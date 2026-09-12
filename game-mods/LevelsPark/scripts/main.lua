-- LevelsPark: real in-game park/redeem for The Isle EVRIMA.
--
-- !park [name]  captures growth/health/stamina/hunger/thirst (plus the
--         display-only extras below) for the sender's live dino, saves it to
--         disk, then kills the dino (SetHealth(0)). The player naturally
--         lands on the respawn/species-select screen. The optional name
--         (e.g. "!park Rex") is our own metadata for the website gallery —
--         the game has no such field, so it's just stored as-is. Players can
--         have any number of dinos parked at once (no "one at a time" limit).
-- !redeem [name]  applies the saved stats for one parked dino of the SAME
--         SPECIES as the sender's current live pawn, IF that pawn is a fresh
--         spawn (growth below FRESH_SPAWN_GROWTH_CEILING). Bare "!redeem"
--         picks the most recently parked matching-species dino; "!redeem
--         <name>" picks the most recent matching-species dino with that name
--         (case-insensitive) specifically, even if newer same-species parks
--         exist in between. Consumes (deletes) that one snapshot on success;
--         any other parked dinos are untouched. To redeem by exact snapshot
--         rather than by name, use the website's per-card Redeem button
--         instead — see the website-redeem-request section below.
-- !parkstatus reports everything currently parked for the sender.
--
-- Architecture notes (see EVRIMA_State_Restore_Cookbook.md / DinoStorage
-- Architecture for the full recipe this is a trimmed-down version of):
--   - Transform-in-place only. RequestRespawn is unreachable from Lua
--     (crashes on the FCustomizerDataBase by-value param), so this never
--     calls any respawn API. !park kills the pawn and lets the player
--     respawn through the normal game UI; !redeem mutates the resulting
--     fresh juvenile in-place via scalar setters.
--   - No nutrients restore. Deliberately out of scope. PRIME status and
--     body color ARE captured, but display-only (for the website gallery,
--     not applied on !redeem). Skin colors and admin-granted mutation
--     slots/entombment level ARE captured and applied — see applyCustomizer
--     and the mutation-slot handling in applyStateToPawn respectively.
--   - Heavy actions (kill, restore) are deferred a few seconds off the chat
--     hook and re-resolve the pawn fresh at fire time (hook parameter
--     wrappers and cached pawns are unsafe across ticks).
--   - Website-triggered park/redeem: the mod can't list directory contents
--     from Lua at all, so it can't discover a request file for an arbitrary
--     player. Instead a poll loop walks gm.AllPlayerControllers (a
--     TSet<APlayerController*>, iterated via :ForEach — NOT indexable with
--     #/[i], that's a TSet-vs-TArray gotcha) and checks each currently-online
--     player's own fixed-name request files. FindAllOf("TIPlayerController")
--     is NOT safe (crashes on stale post-disconnect entries, per
--     EVRIMA_Lua_Safety_Rules.md Rule 3), and GameState.PlayerArray — the
--     OTHER pattern the same rule documents as safe — turned out to return
--     "TrivialObject" entries on THIS build that UE4SS hasn't bound methods
--     for (:GetOwningController() throws), confirmed live; AllPlayerControllers
--     hands back real, fully-bound controllers directly and doesn't have that
--     problem. This means a website park/redeem can only ever be processed
--     while that player is actually connected — which is required anyway, since
--     applying stats needs a live pawn.

local MOD_NAME = "LevelsPark"
-- Confirmed live: a relative path ("Mods/LevelsPark/Saved/...") fails with
-- ENOENT from Lua's io.open even when that folder demonstrably exists on
-- disk (verified via the host panel's file browser), while the identical
-- path written out as an absolute "Z:/..." path succeeds. Lua's io library
-- here resolves relative paths against some working directory other than
-- the UE4SS root printed in the boot log — so every file path in this mod
-- is absolute. If this mod is moved to a different server/host, update this
-- to match that server's UE4SS.log "root directory" line.
local SAVED_DIR = "Z:/home/container/TheIsle/Binaries/Win64/ue4ss/Mods/LevelsPark/Saved"
-- Flattened into SAVED_DIR directly (parked_<steam>.json) rather than a
-- Saved/parked/ subfolder: one less directory that has to exist on disk
-- before saves can work, since Lua's writer won't create missing folders.
local PARKED_DIR = SAVED_DIR
local FRESH_SPAWN_GROWTH_CEILING = 0.30
local ACTION_DELAY_MS = 3000

local function log(msg)
    print(string.format("[%s] %s\n", MOD_NAME, tostring(msg)))
end

-- ── Safety-rule helpers (see EVRIMA_Lua_Safety_Rules.md / Helpers_Reference) ──

local function findGameMode()
    local candidates = { "BP_SurvivalGameMode_C", "TISurvivalGameMode", "TIGameModeBase", "GameModeBase" }
    for _, name in ipairs(candidates) do
        local gm
        pcall(function() gm = FindFirstOf(name) end)
        if gm ~= nil then return gm end
    end
    return nil
end

local function livePawnFromCtrl(ctrl)
    if ctrl == nil then return nil end
    local pawn
    pcall(function() pawn = ctrl:K2_GetPawn() end)
    if pawn == nil then return nil end
    local addr
    pcall(function() addr = pawn:GetAddress() end)
    if addr == nil or addr == 0 then return nil end
    return pawn
end

-- Hook params can arrive as a generic RemoteUnrealParam wrapper that needs
-- :get() to reach the real underlying value (same pattern as unwrapping the
-- sender controller). Harmless no-op if value doesn't have :get().
local function unwrapIfNeeded(value)
    if value == nil then return nil end
    local ok, unwrapped = pcall(function() return value:get() end)
    if ok and unwrapped ~= nil then return unwrapped end
    return value
end

-- On this build, some UE string values arrive as plain Lua strings already
-- (calling :ToString() on those fails, since strings don't have that method),
-- while others are wrapper userdata that need :ToString() to get real content
-- (tostring() on those just yields "FString: <hexaddr>" / "UObject: <hexaddr>"
-- junk — note: no "0x" prefix on this build, just raw hex digits).
local function safeString(rawValue)
    local value = unwrapIfNeeded(rawValue)
    if value == nil then return "" end
    if type(value) == "string" then return value end
    local okT, t = pcall(function() return value:ToString() end)
    if okT and type(t) == "string" and t ~= "" then return t end
    local ok, s = pcall(function() return tostring(value) end)
    if ok and type(s) == "string" and not s:find("^%a+:%s*%x+$") then return s end
    return ""
end

local function getControllerSteamId(ctrl)
    if ctrl == nil then return "" end
    local sId
    pcall(function() sId = ctrl:GetSteamId() end)
    if sId ~= nil then
        local s = safeString(sId)
        if s ~= "" and not s:find("^UObject") then return s end
    end
    local field
    pcall(function() field = ctrl.SteamId end)
    if field ~= nil then
        local s = safeString(field)
        if s ~= "" then return s end
    end
    return ""
end

local function makeText(message)
    if FText == nil then return message end
    local ok, ft = pcall(function() return FText(message) end)
    if ok and ft ~= nil then return ft end
    return message
end

-- Safe to call from a tick; NOT safe from inside a hook callback (rule 5).
local function safeNotify(steamId, message)
    if steamId == nil or steamId == "" then return false, "no-steam" end
    local gm = findGameMode()
    if gm == nil then return false, "no-gameMode" end
    local controller
    pcall(function() controller = gm:GetControllerBySteamId(steamId) end)
    if controller == nil then return false, "no-controller" end
    local text = makeText(message)
    local okN, errN = pcall(function() controller:ClientShowNotification(text) end)
    return okN, errN
end

local function stripClassPrefix(s)
    if s == nil then return nil end
    s = tostring(s)
    return string.match(s, "^%S+%s+(.+)$") or s
end

-- Friendly species name for display (e.g. "Allosaurus") out of a stored
-- classPath like ".../Dinosaurs/Allosaurus/BP_Allosaurus.BP_Allosaurus_C" —
-- mirrors script.js's speciesFromClassPath so !parkstatus reads the same
-- way the website does.
local function speciesFromClassPath(classPath)
    if classPath == nil then return "Unknown" end
    return classPath:match("/Dinosaurs/([^/]+)/") or "Unknown"
end

-- ── Tiny JSON helpers (no require, no library — see Helpers_Reference) ──

local function jsonReadString(body, fieldName)
    return string.match(body or "", '"' .. fieldName .. '"%s*:%s*"([^"]*)"')
end

local function jsonReadNumber(body, fieldName)
    return tonumber(string.match(body or "", '"' .. fieldName .. '"%s*:%s*(-?%d+%.?%d*)'))
end

local function jsonReadBool(body, fieldName)
    return string.match(body or "", '"' .. fieldName .. '"%s*:%s*(true)') ~= nil
end

local function jsonEscape(s)
    if s == nil then return "" end
    s = tostring(s)
    s = s:gsub("\\", "\\\\")
    s = s:gsub('"', '\\"')
    return s
end

-- The 10 FCustomizerDataBase color fields (0.21.720+) glitch skins can set —
-- declared up here (not down in the glitch-skins section below) because
-- loadParkedDinos needs it too, to pick up an optional skin attached to a
-- specific parked dino, and Lua locals must be declared before use.
local SKIN_COLOR_FIELDS = {
    "BodyColor", "MarkingsColor", "FlankColor", "UnderbellyColor",
    "Detail1Color", "EyesColor", "MaleDisplayColor",
    "TeethColor", "MouthColor", "ClawsColor",
}

-- The 16 FName slots on ATICharacterBase's FReplicatedMutationsData struct
-- (confirmed via a live GenerateSDK dump of TheIsle.hpp) — 4 base + 4
-- "parent" (unlocked at 1 entombment) + 8 "elder" split A/B (unlocked at 2
-- and 3 entombments respectively). Declared up here for the same reason as
-- SKIN_COLOR_FIELDS: loadParkedDinos needs it, Lua locals must precede use.
local MUTATION_SLOT_FIELDS = {
    "MutationSlot1", "MutationSlot2", "MutationSlot3", "MutationSlot4",
    "ParentMutationSlot1", "ParentMutationSlot2", "ParentMutationSlot3", "ParentMutationSlot4",
    "ElderMutationSlot1A", "ElderMutationSlot2A", "ElderMutationSlot3A", "ElderMutationSlot4A",
    "ElderMutationSlot1B", "ElderMutationSlot2B", "ElderMutationSlot3B", "ElderMutationSlot4B",
}

-- JSON keys use lowerCamelCase (e.g. "mutationSlot1") while the live
-- struct's actual field names are PascalCase ("MutationSlot1") — this just
-- lowercases the first letter, same relationship as bodyColorR/BodyColor.R
-- elsewhere in this file.
local function mutationJsonKey(field)
    return field:sub(1, 1):lower() .. field:sub(2)
end

local function jsonReadColorField(body, fieldName)
    local sub = body:match('"' .. fieldName .. '"%s*:%s*(%b{})')
    if sub == nil then return nil end
    local r = jsonReadNumber(sub, "r")
    local g = jsonReadNumber(sub, "g")
    local b = jsonReadNumber(sub, "b")
    if r == nil or g == nil or b == nil then return nil end
    return { R = r, G = g, B = b, A = jsonReadNumber(sub, "a") or 1.0 }
end

-- Recipe per EVRIMA_Customizer_Field_Map.md (post-0.21.720 skin-system
-- overhaul): the old GetCustomizerData()/SetCustomizerData() round-trip
-- silently no-ops server-side now (no error, no crash — the color just
-- never renders). The working recipe is a direct write on the live
-- pawn.CustomizerData property (never the GetCustomizerData() wrapper —
-- same reasoning capturePawnState below uses for reads) followed by
-- pawn:ForceNetUpdate() to push replication. Deliberately does NOT touch
-- PatternIndex or SkinVariation — PatternIndex is strictly per-species
-- range-validated and an out-of-range value silently drops the ENTIRE
-- apply (every color field too), and we don't have each species' valid
-- pattern-count table. Every other customizer field is an unvalidated POD
-- write, which this mod's own safety notes already prove safe for
-- BodyColor specifically (writing all seven original color fields,
-- verified live, server stable for hours afterward) — this just extends
-- that same proven pattern to the three new 0.21.720 regions (Teeth/
-- Mouth/Claws) and adds the ForceNetUpdate the overhaul now requires for
-- it to actually be visible. Declared up here (not in the glitch-skins
-- section further down) because tryRedeem needs it and comes first.
local function applyCustomizer(pawn, colors)
    if pawn == nil or colors == nil then return false end
    local okCd, cd = pcall(function() return pawn.CustomizerData end)
    if not okCd or cd == nil then return false end

    for _, field in ipairs(SKIN_COLOR_FIELDS) do
        local color = colors[field]
        if color ~= nil then
            local ok, err = pcall(function()
                cd[field].R = color.R
                cd[field].G = color.G
                cd[field].B = color.B
                cd[field].A = color.A or 1.0
            end)
            if not ok then log("Skin apply: " .. field .. " write failed: " .. tostring(err)) end
        end
    end

    pcall(function() pawn:ForceNetUpdate() end)
    return true
end

-- ── File I/O ──

local function fileExists(path)
    local f = io.open(path, "rb")
    if f == nil then return false end
    f:close()
    return true
end

local function readAll(path)
    local f = io.open(path, "rb")
    if f == nil then return nil end
    local body = f:read("*a")
    f:close()
    return body
end

local function writeAll(path, body)
    local f, err = io.open(path, "wb")
    if f == nil then
        log("writeAll failed for [" .. tostring(path) .. "]: " .. tostring(err))
        return false
    end
    f:write(body)
    f:close()
    return true
end

local function parkedFilePath(steam)
    return PARKED_DIR .. "/parked_" .. steam .. ".json"
end

-- Each player's file is now {"version":2,"steam":"...","dinos":[{...},{...}]}
-- — any number of parked dinos, not just one. The tiny jsonRead* helpers work
-- by regex-scanning a whole string for a field, so they'd cross-contaminate
-- across array elements if run on the full file body; %b{} (Lua's balanced-
-- match pattern) splits the "dinos" array into individual flat-object
-- substrings first, and each field is read from just its own object.
-- Builds `"mutationSlot1":"...",...` for all 16 slots (empty string for an
-- unused slot) from a table keyed by the PascalCase struct field names
-- (MUTATION_SLOT_FIELDS) — the shape capturePawnState/applyStateToPawn use.
local function mutationsToJsonFragment(mutations)
    local parts = {}
    for _, field in ipairs(MUTATION_SLOT_FIELDS) do
        local value = (mutations and mutations[field]) or ""
        table.insert(parts, string.format('"%s":"%s"', mutationJsonKey(field), jsonEscape(value)))
    end
    return table.concat(parts, ",")
end

local function dinoToJson(state)
    return string.format(
        '{"name":"%s","classPath":"%s","growth":%f,"health":%f,' ..
        '"maxHealth":%f,"stamina":%f,"hunger":%f,"thirst":%f,"maxHunger":%f,"maxThirst":%f,' ..
        '"maxStamina":%f,"primeElder":%s,"bodyColorR":%f,"bodyColorG":%f,"bodyColorB":%f,' ..
        '"capturedAt":%d,"entombments":%d,%s}',
        jsonEscape(state.name or ""), jsonEscape(state.classPath), state.growth,
        state.health, state.maxHealth or 0, state.stamina, state.hunger, state.thirst,
        state.maxHunger or 0, state.maxThirst or 0, state.maxStamina or 0,
        state.primeElder and "true" or "false", state.bodyColorR or 0, state.bodyColorG or 0,
        state.bodyColorB or 0, state.capturedAt, state.entombments or 0,
        mutationsToJsonFragment(state.mutations)
    )
end

local function writeParkedDinos(steam, dinos)
    if #dinos == 0 then
        os.remove(parkedFilePath(steam))
        return true
    end
    local parts = {}
    for _, d in ipairs(dinos) do table.insert(parts, dinoToJson(d)) end
    local json = string.format('{"version":2,"steam":"%s","dinos":[%s]}',
        jsonEscape(steam), table.concat(parts, ","))
    return writeAll(parkedFilePath(steam), json)
end

-- Returns an array (possibly empty) of every dino currently parked for this
-- player. An old (pre-multi-park) single-object file, or no file at all,
-- both just come back as an empty array — this is a breaking schema change,
-- accepted deliberately rather than writing migration code for a handful of
-- live records (see plan notes).
local function loadParkedDinos(steam)
    local path = parkedFilePath(steam)
    if not fileExists(path) then return {} end
    local body = readAll(path)
    if body == nil or body == "" then return {} end
    local dinosSection = body:match('"dinos"%s*:%s*(%b[])') or "[]"
    local dinos = {}
    for objStr in dinosSection:gmatch("%b{}") do
        -- Optional skin attached by the website's /skin-attach-parked (an
        -- admin-granted charge spent on this specific snapshot) — absent
        -- on ordinary parked dinos. Read once here, applied once at
        -- redeem time in tryRedeem; never written back by this mod (the
        -- snapshot is deleted right after a successful redeem anyway).
        local skinSection = objStr:match('"skin"%s*:%s*(%b{})')
        local skin = nil
        if skinSection ~= nil then
            local colorsSection = skinSection:match('"colors"%s*:%s*(%b{})') or "{}"
            local colors = {}
            for _, field in ipairs(SKIN_COLOR_FIELDS) do
                local color = jsonReadColorField(colorsSection, field)
                if color ~= nil then colors[field] = color end
            end
            skin = { name = jsonReadString(skinSection, "name"), colors = colors }
        end
        -- Admin-granted (or naturally captured, via !park on an
        -- already-mutated dino) entombment level + mutation slots. Read
        -- into a table keyed by the PascalCase struct field name — the
        -- shape applyStateToPawn's field-write loop expects — from the
        -- lowerCamelCase JSON keys dinoToJson writes.
        local mutations = {}
        for _, field in ipairs(MUTATION_SLOT_FIELDS) do
            mutations[field] = jsonReadString(objStr, mutationJsonKey(field)) or ""
        end
        table.insert(dinos, {
            name = jsonReadString(objStr, "name"),
            classPath = jsonReadString(objStr, "classPath"),
            growth = jsonReadNumber(objStr, "growth"),
            health = jsonReadNumber(objStr, "health"),
            maxHealth = jsonReadNumber(objStr, "maxHealth"),
            stamina = jsonReadNumber(objStr, "stamina"),
            hunger = jsonReadNumber(objStr, "hunger"),
            thirst = jsonReadNumber(objStr, "thirst"),
            maxHunger = jsonReadNumber(objStr, "maxHunger"),
            maxThirst = jsonReadNumber(objStr, "maxThirst"),
            maxStamina = jsonReadNumber(objStr, "maxStamina"),
            primeElder = jsonReadBool(objStr, "primeElder"),
            bodyColorR = jsonReadNumber(objStr, "bodyColorR"),
            bodyColorG = jsonReadNumber(objStr, "bodyColorG"),
            bodyColorB = jsonReadNumber(objStr, "bodyColorB"),
            capturedAt = jsonReadNumber(objStr, "capturedAt"),
            skin = skin,
            entombments = jsonReadNumber(objStr, "entombments") or 0,
            mutations = mutations,
            -- Set only by /compensation-grant (bridge-worker.js) — see
            -- applyStateToPawn for why this matters: it stores
            -- health/stamina/hunger/thirst as 0-1 fractions, not the
            -- absolute point values a real !park capture stores.
            statsArePercentages = jsonReadBool(objStr, "statsArePercentages") or false,
        })
    end
    return dinos
end

local function saveParkedState(steam, state)
    local dinos = loadParkedDinos(steam)
    table.insert(dinos, state)
    return writeParkedDinos(steam, dinos)
end

-- Removes exactly one parked dino (identified by its capturedAt, which
-- doubles as its id — a player can't !park twice in the same second) and
-- rewrites the file, or removes the file entirely if that was the last one.
local function deleteParkedSnapshot(steam, capturedAt)
    local dinos = loadParkedDinos(steam)
    local remaining = {}
    for _, d in ipairs(dinos) do
        if d.capturedAt ~= capturedAt then table.insert(remaining, d) end
    end
    return writeParkedDinos(steam, remaining)
end

-- ── Capture / apply ──

local function capturePawnState(pawn)
    local state = {}
    pcall(function() state.classPath = stripClassPrefix(pawn:GetClass():GetFullName()) end)
    pcall(function() state.growth = pawn:GetGrowth() end)
    pcall(function() state.health = pawn:GetHealth() end)
    pcall(function() state.maxHealth = pawn:GetMaxHealth() end)
    pcall(function() state.stamina = pawn:GetStamina() end)
    pcall(function() state.hunger = pawn:GetHunger() end)
    pcall(function() state.thirst = pawn:GetThirst() end)
    pcall(function() state.maxHunger = pawn:GetMaxHunger() end)
    pcall(function() state.maxThirst = pawn:GetMaxThirst() end)
    pcall(function() state.maxStamina = pawn:GetMaxStamina() end)
    -- Display-only extras for the website gallery (not needed for restore,
    -- so a failed read here must never block !park — always pcall-guarded).
    pcall(function() state.primeElder = pawn:GetIsEligiblePrimeElder() end)
    pcall(function()
        -- Read the live CustomizerData property directly rather than via
        -- GetCustomizerData() — the getter is unreliable post-0.21.720 per
        -- the community's customizer field-map notes; the live property read
        -- is a plain POD field access and safe.
        local color = pawn.CustomizerData.BodyColor
        state.bodyColorR = color.R
        state.bodyColorG = color.G
        state.bodyColorB = color.B
    end)
    -- Entombment tier + mutation slots this dino already has (whether from
    -- natural gameplay or an earlier admin grant) — captured so a plain
    -- !park on an already-mutated dino doesn't silently drop them. See
    -- EVRIMA_EntombBonus_Fix.md: ElderReplicationStacks is the tier counter
    -- (0/1/2 = Life 1/2/3, confirmed; higher is untested but clamped to 3
    -- here to match this feature's own 0-3 range), separate from the slot
    -- FNames themselves.
    local stacksOk, stacksErr = pcall(function()
        local stacks = pawn:GetElderReplicationStacks()
        if type(stacks) == "number" then
            state.entombments = math.min(3, math.max(0, stacks))
        else
            log("capturePawnState: GetElderReplicationStacks returned non-number: " .. tostring(stacks))
        end
    end)
    if not stacksOk then
        log("capturePawnState: GetElderReplicationStacks call failed: " .. tostring(stacksErr))
    end
    pcall(function()
        local mutData = pawn.ReplicatedMutationsData
        local mutations = {}
        for _, field in ipairs(MUTATION_SLOT_FIELDS) do
            local value = ""
            local okRead, raw = pcall(function() return mutData[field] end)
            if okRead and raw ~= nil then
                local okStr, s = pcall(function() return raw:ToString() end)
                if okStr and type(s) == "string" and s ~= "None" then value = s end
            end
            mutations[field] = value
        end
        state.mutations = mutations
    end)
    state.capturedAt = os.time()
    return state
end

-- Player-supplied label for their parked dino (e.g. "!park Rex"), purely our
-- own metadata — the game has no such field. Trim, cap length, strip
-- anything that isn't a plain printable character so it's safe to store and
-- later render as plain text on the website.
local MAX_NAME_LENGTH = 24
local function sanitizeName(raw)
    if raw == nil then return "" end
    local name = raw:match("^%s*(.-)%s*$") or ""
    name = name:gsub("[^%w %-_']", "")
    if #name > MAX_NAME_LENGTH then name = name:sub(1, MAX_NAME_LENGTH) end
    return name
end

-- Apply order matters (GAS-attribute auto-refill on growth change; see
-- Safety Rule 8 / State Restore Cookbook): growth first, then max-vitals,
-- then current vitals.
local function applyStateToPawn(pawn, state)
    pcall(function() pawn:SetGrowth(state.growth) end)

    if state.statsArePercentages then
        -- Compensation-granted dinos (website admin panel) store
        -- health/stamina/hunger/thirst as 0-1 FRACTIONS — the admin form
        -- only ever offers a percentage, and the Worker has no way to know
        -- a species' actual max-stat curve to convert that into a real
        -- point value up front. A real !park capture, by contrast, always
        -- stores the exact absolute point values GetHealth()/etc. returned
        -- (e.g. 125, 61.5) — those two are NOT the same scale, and calling
        -- SetHealth() with a raw 0-1 fraction here used to leave a redeemed
        -- comp dino at ~1 hp (real bug, fixed 2026-09-11). Growth is set
        -- first above specifically so GAS's auto-refill-to-new-max already
        -- ran, then this reads the freshly-computed native max back out
        -- and scales by the stored fraction, rather than trusting any
        -- stored max value (there isn't one — comp grants never set one).
        local maxHealth, maxStamina, maxHunger, maxThirst = 1, 1, 1, 1
        pcall(function() maxHealth = pawn:GetMaxHealth() or 1 end)
        pcall(function() maxStamina = pawn:GetMaxStamina() or 1 end)
        pcall(function() maxHunger = pawn:GetMaxHunger() or 1 end)
        pcall(function() maxThirst = pawn:GetMaxThirst() or 1 end)
        pcall(function() pawn:SetHealth(maxHealth * (state.health or 1)) end)
        pcall(function() pawn:SetStamina(maxStamina * (state.stamina or 1)) end)
        pcall(function() pawn:SetHunger(maxHunger * (state.hunger or 1)) end)
        pcall(function() pawn:SetThirst(maxThirst * (state.thirst or 1)) end)
        return
    end

    if state.maxHunger then pcall(function() pawn:SetMaxHunger(state.maxHunger) end) end
    if state.maxThirst then pcall(function() pawn:SetMaxThirst(state.maxThirst) end) end
    if state.maxStamina then pcall(function() pawn:SetMaxStamina(state.maxStamina) end) end
    pcall(function() pawn:SetHealth(state.health) end)
    pcall(function() pawn:SetStamina(state.stamina) end)
    pcall(function() pawn:SetHunger(state.hunger) end)
    pcall(function() pawn:SetThirst(state.thirst) end)
end

-- Restores entombment level + mutation slots (admin-granted via
-- Compensation, or naturally captured by !park on an already-mutated
-- dino) — per EVRIMA_QuestMutation_Fix.md, this needs to run ~500ms AFTER
-- the bulk growth/vitals writes above, on a FRESHLY re-resolved pawn
-- (never the wrapper captured synchronously above, which can go stale
-- across ticks — same rule already applied to the friend-teleport
-- re-derive elsewhere in this file). Also per that doc: SetSlotNEquippedMutation
-- silently rejects on a just-restored pawn, so this field-writes
-- pawn.ReplicatedMutationsData directly and pushes via
-- SetReplicatedMutationsData instead.
local function applyMutationsDeferred(steam, entombments, mutations)
    if entombments == nil or entombments <= 0 or mutations == nil then return end
    local hasAny = false
    for _, field in ipairs(MUTATION_SLOT_FIELDS) do
        if mutations[field] ~= nil and mutations[field] ~= "" then
            hasAny = true
            break
        end
    end
    if not hasAny then return end

    local fired = false
    local handle
    handle = LoopInGameThreadWithDelay(500, function()
        -- LoopInGameThreadWithDelay REPEATS rather than firing once
        -- (confirmed elsewhere this session) — this guard makes every
        -- tick after the first a no-op regardless of whether the
        -- best-effort CancelDelayedAction below actually exists/works.
        if fired then return end
        fired = true
        pcall(function()
            if handle ~= nil and CancelDelayedAction ~= nil then CancelDelayedAction(handle) end
        end)

        local gm = findGameMode()
        if gm == nil then return end
        local ctrl
        pcall(function() ctrl = gm:GetControllerBySteamId(steam) end)
        local pawn = livePawnFromCtrl(ctrl)
        if pawn == nil then return end

        local okMut, mutData = pcall(function() return pawn.ReplicatedMutationsData end)
        local written = 0
        if okMut and mutData ~= nil then
            for _, field in ipairs(MUTATION_SLOT_FIELDS) do
                local value = mutations[field]
                if value ~= nil and value ~= "" then
                    local okF, fn = pcall(function() return FName(value) end)
                    if okF and fn ~= nil then
                        local okW = pcall(function() mutData[field] = fn end)
                        if okW then written = written + 1 end
                    end
                end
            end
            if written > 0 then
                pcall(function() pawn:SetReplicatedMutationsData(mutData, true) end)
            end
        end

        -- Quest-locked mutation names need to be in the unlock list or the
        -- engine's other systems won't treat the grant as legitimate.
        -- Appended, not overwritten, so any unlocks the engine itself
        -- hydrated on respawn are preserved.
        local okMR, mrData = pcall(function() return pawn.MutationsRequirementsData end)
        if okMR and mrData ~= nil then
            local okArr, arr = pcall(function() return mrData.UnlockRequiredMutations end)
            if okArr and arr ~= nil then
                local currentN
                pcall(function() currentN = #arr end)
                currentN = type(currentN) == "number" and currentN or 0
                local existing = {}
                for i = 1, currentN do
                    local raw
                    pcall(function() raw = arr[i] end)
                    if raw ~= nil then
                        local s
                        pcall(function() s = raw:ToString() end)
                        if type(s) == "string" then existing[s] = true end
                    end
                end
                local added = 0
                for _, field in ipairs(MUTATION_SLOT_FIELDS) do
                    local value = mutations[field]
                    if value ~= nil and value ~= "" and not existing[value] then
                        local okW = pcall(function() arr[currentN + 1 + added] = FName(value) end)
                        if okW then
                            added = added + 1
                            existing[value] = true
                        end
                    end
                end
                if added > 0 then
                    pcall(function() pawn:SetMutationRequirementsData(mrData) end)
                end
            end
        end

        -- Confirmed safe for 0-2 (Life 1/2/3); 3 is untested by the source
        -- doc but degrades safely — worst case the boosted value doesn't
        -- apply while the slots themselves still do.
        pcall(function() pawn:SetElderReplicationStacks(entombments) end)
        log("Applied entombment=" .. tostring(entombments) .. " mutations=" .. tostring(written)
            .. " for " .. steam)
    end)
end

-- ── Deferred action queue (rule 5: never SetHealth/notify/etc from inside a hook) ──

local pendingActions = {}

local function queueAction(kind, steam, extra)
    pendingActions[#pendingActions + 1] = { kind = kind, steam = steam, extra = extra }
end

-- Guards against spamming !park / the website's Park button against the
-- SAME already-parked dino: SetHealth(0) below doesn't despawn the pawn
-- instantly, so the controller's pawn (and the RCON-sourced /api/live-dino
-- status the website polls) can keep reporting a "live" dino for a window
-- after it's already been captured and slain, right up until the client
-- actually transitions to character select. Without this, repeatedly
-- clicking Park during that window (or spamming !park in that same window)
-- captures the identical dino over and over, flooding a player's Inventory
-- with duplicate cards for a dino that was already parked. Keyed by pawn
-- address (unique per spawned dino instance) rather than time-based, since
-- it needs to keep blocking for however long that window actually is, but
-- stop blocking the instant a genuinely new pawn (a real respawn) appears.
local lastParkedPawnAddr = {}

-- Core park logic shared by the in-game !park command and website-
-- triggered park requests (the Live Dino tab's Park button — see the
-- website-bridge section below). Returns ok (bool), message (string).
local function tryPark(steam, name)
    local gm = findGameMode()
    if gm == nil then return false, "Park failed: internal error." end
    local ctrl
    pcall(function() ctrl = gm:GetControllerBySteamId(steam) end)
    local pawn = livePawnFromCtrl(ctrl)
    if pawn == nil then
        return false, "Park failed: no live dino found."
    end

    local addr
    pcall(function() addr = pawn:GetAddress() end)
    if addr ~= nil and lastParkedPawnAddr[steam] == addr then
        return false, "Park failed: this dino is already parked. Spawn in as a new dino first."
    end

    local state = capturePawnState(pawn)
    state.name = sanitizeName(name)
    if state.classPath == nil or state.growth == nil then
        return false, "Park failed: could not read dino state."
    end

    if not saveParkedState(steam, state) then
        return false, "Park failed: could not save state."
    end

    lastParkedPawnAddr[steam] = addr
    pcall(function() pawn:SetHealth(0) end)
    local mutationCount = 0
    if state.mutations ~= nil then
        for _, field in ipairs(MUTATION_SLOT_FIELDS) do
            if state.mutations[field] ~= nil and state.mutations[field] ~= "" then
                mutationCount = mutationCount + 1
            end
        end
    end
    log("Parked " .. steam .. " (" .. tostring(state.classPath) .. ", growth=" .. tostring(state.growth)
        .. (state.name ~= "" and (", name=" .. state.name) or "")
        .. ", entombments=" .. tostring(state.entombments) .. ", mutations=" .. tostring(mutationCount) .. ")")
    local message = "Dino parked" .. (state.name ~= "" and (" as \"" .. state.name .. "\"") or "")
        .. ". Respawn as the same species, then type !redeem to restore it."
    return true, message
end

local function processPark(steam, name)
    local ok, message = tryPark(steam, name)
    safeNotify(steam, message)
end

-- Core redeem logic shared by the in-game !redeem[/redeem <name>] command
-- and website-triggered redeem requests. Every candidate must match the
-- player's current live species (applying one species' vitals onto
-- another's model makes no sense) and that pawn must be a fresh spawn —
-- those two checks always apply. Within the species-matching candidates,
-- selection narrows further:
--   1. snapshotId given (the website's per-card Redeem button) -> only that
--      exact snapshot qualifies.
--   2. name given ("!redeem <name>") -> the most recent same-species dino
--      with that name (case-insensitive), even if a *newer* unnamed or
--      differently-named same-species park exists in between — a name
--      pins down a specific dino regardless of recency among the rest.
--   3. neither given (bare "!redeem") -> the most recent same-species dino,
--      full stop (today's original shortcut behavior).
-- Returns ok (bool), message (string).
local function tryRedeem(steam, snapshotId, name)
    local gm = findGameMode()
    if gm == nil then return false, "Redeem failed: internal error." end
    local ctrl
    pcall(function() ctrl = gm:GetControllerBySteamId(steam) end)
    local pawn = livePawnFromCtrl(ctrl)
    if pawn == nil then
        return false, "Redeem failed: spawn in first, then try again."
    end

    local liveClassPath
    pcall(function() liveClassPath = stripClassPrefix(pawn:GetClass():GetFullName()) end)
    if liveClassPath == nil then
        return false, "Redeem failed: could not read your current species."
    end

    local liveGrowth
    pcall(function() liveGrowth = pawn:GetGrowth() end)
    if liveGrowth == nil or liveGrowth > FRESH_SPAWN_GROWTH_CEILING then
        return false, "Redeem only works on a freshly-spawned juvenile."
    end

    local lowerName = (name ~= nil and name ~= "") and name:lower() or nil
    local dinos = loadParkedDinos(steam)
    local target = nil
    for _, d in ipairs(dinos) do
        if d.classPath == liveClassPath then
            local matches
            if snapshotId ~= nil then
                matches = (d.capturedAt == snapshotId)
            elseif lowerName ~= nil then
                matches = (d.name ~= nil and d.name:lower() == lowerName)
            else
                matches = true
            end
            if matches and (target == nil or (d.capturedAt or 0) > (target.capturedAt or 0)) then
                target = d
            end
        end
    end

    if target == nil then
        if snapshotId ~= nil then
            -- Diagnostic for an intermittent stress-test report (2026-09-11):
            -- same dino, same species, sometimes fails this exact check.
            -- Logs the live class, the requested snapshotId, and every
            -- currently-parked snapshot's classPath+capturedAt for this
            -- player, so a real occurrence gives ground truth instead of a
            -- guess — distinguishes "genuinely already consumed" (a
            -- Worker-side file write racing this mod's own read-modify-write,
            -- since neither side locks the file) from "classPath actually
            -- differs" from a stale website snapshotId.
            local dump = {}
            for _, d in ipairs(dinos) do
                table.insert(dump, tostring(d.classPath) .. "@" .. tostring(d.capturedAt))
            end
            log("Redeem miss: steam=" .. steam .. " requestedSnapshotId=" .. tostring(snapshotId)
                .. " liveClassPath=" .. tostring(liveClassPath)
                .. " parked=[" .. table.concat(dump, ", ") .. "]")
            return false, "Redeem failed: that snapshot wasn't found, or its species doesn't match what you're playing."
        end
        if lowerName ~= nil then
            return false, "Redeem failed: no parked dino named \"" .. name .. "\" matches what you're playing."
        end
        return false, "Redeem failed: spawn as a species you have parked, then try again."
    end

    applyStateToPawn(pawn, target)
    applyMutationsDeferred(steam, target.entombments, target.mutations)
    -- A skin attached to this specific snapshot (via the website's
    -- Attach action, spending a charge) travels with it — applied once,
    -- right here, never via a continuous per-player poll. This is what
    -- actually keeps skins scoped to the dino they were attached to
    -- instead of leaking onto whatever a player redeems next.
    if target.skin ~= nil then
        applyCustomizer(pawn, target.skin.colors)
    end
    deleteParkedSnapshot(steam, target.capturedAt)
    local label = (target.name and target.name ~= "") and (" (" .. target.name .. ")") or ""
    return true, "Dino restored from your parked snapshot" .. label .. "."
end

local function processRedeem(steam, name)
    local ok, message = tryRedeem(steam, nil, name)
    safeNotify(steam, message)
    if ok then log("Redeemed for " .. steam) end
end

-- Only shows parked dinos matching the species the player is CURRENTLY
-- spawned as — not their whole inventory — since that's the one relevant
-- set right before a !redeem. Requires being spawned in (there's no "which
-- species did they mean" otherwise).
local function processParkStatus(steam)
    local dinos = loadParkedDinos(steam)
    if #dinos == 0 then
        safeNotify(steam, "You have nothing parked.")
        return
    end

    local gm = findGameMode()
    local ctrl
    if gm ~= nil then pcall(function() ctrl = gm:GetControllerBySteamId(steam) end) end
    local pawn = livePawnFromCtrl(ctrl)
    local liveClassPath
    if pawn ~= nil then pcall(function() liveClassPath = stripClassPrefix(pawn:GetClass():GetFullName()) end) end
    if liveClassPath == nil then
        safeNotify(steam, "Spawn in first to see what's parked for that species.")
        return
    end

    local matching = {}
    for _, d in ipairs(dinos) do
        if d.classPath == liveClassPath then table.insert(matching, d) end
    end
    if #matching == 0 then
        safeNotify(steam, "Nothing parked for " .. speciesFromClassPath(liveClassPath) .. ".")
        return
    end
    table.sort(matching, function(a, b) return (a.capturedAt or 0) > (b.capturedAt or 0) end)

    local parts = {}
    for _, d in ipairs(matching) do
        local ageMin = math.floor((os.time() - (d.capturedAt or os.time())) / 60)
        local namePrefix = (d.name and d.name ~= "") and (d.name .. ", ") or ""
        table.insert(parts, string.format("%sgrowth %.0f%% (%dm ago)", namePrefix, (d.growth or 0) * 100, ageMin))
    end
    safeNotify(steam, string.format("%d %s parked: %s", #matching, speciesFromClassPath(liveClassPath),
        table.concat(parts, "; ")))
end

-- TEMPORARY diagnostic: checks whether os.execute + curl.exe are usable from
-- this Lua environment at all, before building the real webhook on top of it.
-- Safe/cheap: curl --version does no network I/O, so this can't hang or
-- freeze the server even if something's wrong.
local function processTestCurl(steam)
    local outPath = SAVED_DIR .. "/curltest.txt"
    os.remove(outPath)

    local cmd = 'curl --version > "' .. outPath .. '" 2>&1'
    log("testcurl: running command: " .. cmd)
    local execOk, r1, r2, r3 = pcall(function()
        return os.execute(cmd)
    end)
    log("testcurl: os.execute pcall ok=" .. tostring(execOk) .. " r1=" .. tostring(r1)
        .. " r2=" .. tostring(r2) .. " r3=" .. tostring(r3))

    local body = readAll(outPath)
    if body ~= nil and body ~= "" then
        log("testcurl output: " .. body)
        safeNotify(steam, "curl works: " .. body:sub(1, 150))
    else
        log("testcurl: no output file — os.execute or curl.exe unavailable")
        safeNotify(steam, "curl test FAILED — no output produced. Check UE4SS.log.")
    end
end

-- REMOVED: a temporary !admindump diagnostic used to live here to enumerate
-- native UFunctions by walking a class's function list looking for
-- ban/timeout/weather/allowedclass-like names. Confirmed live (2026-09-11)
-- that UE4SS's ForEachFunction hard-crashes this build with
-- EXCEPTION_ACCESS_VIOLATION inside UE4SS.dll — a native crash, NOT a Lua
-- error, so it isn't catchable by pcall and takes the whole server process
-- down. Do not reintroduce ForEachFunction (or anything else that walks a
-- UClass's reflection data this way) on this build. Native-function
-- discovery for admin-tier enforcement needs a different approach.

LoopInGameThreadWithDelay(ACTION_DELAY_MS, function()
    if #pendingActions == 0 then return end
    local drain = pendingActions
    pendingActions = {}
    for _, action in ipairs(drain) do
        local ok, err = pcall(function()
            if action.kind == "park" then processPark(action.steam, action.extra)
            elseif action.kind == "redeem" then processRedeem(action.steam, action.extra)
            elseif action.kind == "status" then processParkStatus(action.steam)
            elseif action.kind == "testcurl" then processTestCurl(action.steam)
            end
        end)
        if not ok then log("Action " .. tostring(action.kind) .. " failed: " .. tostring(err)) end
    end
end)

-- ── Website-triggered park/redeem (mod ↔ website bridge, write direction) ──
--
-- The website writes park_request_<steamid>.json (Live Dino tab's Park
-- button) or redeem_request_<steamid>.json (a specific parked-dino card's
-- Redeem button) via Bropanel's Pterodactyl API — see
-- workers/bridge-worker.js. This mod has no way to list directory contents,
-- so it can't discover either file for an arbitrary player; instead this
-- loop walks the currently-online players (via gm.AllPlayerControllers, not
-- FindAllOf or GameState.PlayerArray — see the header notes) and checks
-- each one's own fixed-name request files.
local REDEEM_REQUEST_POLL_MS = 3000

local function parkRequestFilePath(steam)
    return SAVED_DIR .. "/park_request_" .. steam .. ".json"
end

local function parkResultFilePath(steam)
    return SAVED_DIR .. "/park_result_" .. steam .. ".json"
end

local function redeemRequestFilePath(steam)
    return SAVED_DIR .. "/redeem_request_" .. steam .. ".json"
end

local function redeemResultFilePath(steam)
    return SAVED_DIR .. "/redeem_result_" .. steam .. ".json"
end

local function skinUseRequestFilePath(steam)
    return SAVED_DIR .. "/skin_use_request_" .. steam .. ".json"
end

local function skinUseResultFilePath(steam)
    return SAVED_DIR .. "/skin_use_result_" .. steam .. ".json"
end

local function teleportExecuteRequestFilePath(steam)
    return SAVED_DIR .. "/teleport_execute_request_" .. steam .. ".json"
end

local function teleportExecuteResultFilePath(steam)
    return SAVED_DIR .. "/teleport_execute_result_" .. steam .. ".json"
end

local function growthPauseRequestFilePath(steam)
    return SAVED_DIR .. "/growth_pause_request_" .. steam .. ".json"
end

local function growthPauseResultFilePath(steam)
    return SAVED_DIR .. "/growth_pause_result_" .. steam .. ".json"
end

-- Written opportunistically every poll tick (see the per-controller loop
-- below) for whichever players are currently online+spawned, so the
-- website has somewhere to read live bIsGrowthPaused state from — RCON's
-- PlayerData command is a fixed protocol we don't control and doesn't
-- carry this flag, so the site can't get it any other way.
local function growthStatusFilePath(steam)
    return SAVED_DIR .. "/growth_status_" .. steam .. ".json"
end

local function writeRequestResult(resultPath, requestId, ok, message)
    local resultJson = string.format(
        '{"requestId":"%s","ok":%s,"message":"%s","processedAt":%d}',
        jsonEscape(requestId), ok and "true" or "false", jsonEscape(message), os.time()
    )
    writeAll(resultPath, resultJson)
end

local function checkWebsiteParkRequest(steam)
    local path = parkRequestFilePath(steam)
    if not fileExists(path) then return end
    local body = readAll(path)
    os.remove(path)
    if body == nil or body == "" then return end

    local requestId = jsonReadString(body, "requestId")
    local name = jsonReadString(body, "name")
    if requestId == nil then return end

    local ok, message = tryPark(steam, name)
    safeNotify(steam, message)
    log("Website park request " .. requestId .. " for " .. steam .. ": ok=" .. tostring(ok)
        .. " message=" .. tostring(message))
    writeRequestResult(parkResultFilePath(steam), requestId, ok, message)
end

local function checkWebsiteRedeemRequest(steam)
    local path = redeemRequestFilePath(steam)
    if not fileExists(path) then return end
    local body = readAll(path)
    os.remove(path)
    if body == nil or body == "" then return end

    local requestId = jsonReadString(body, "requestId")
    local snapshotId = jsonReadNumber(body, "snapshotId")
    if requestId == nil then return end

    local ok, message = tryRedeem(steam, snapshotId, nil)
    safeNotify(steam, message)
    log("Website redeem request " .. requestId .. " for " .. steam .. ": ok=" .. tostring(ok)
        .. " message=" .. tostring(message))
    writeRequestResult(redeemResultFilePath(steam), requestId, ok, message)
end

-- ── Website-triggered glitch skins (admin panel, write direction) ──
--
-- Skins are a charge-based inventory item, NOT an always-on per-player
-- override (an earlier version of this feature auto-restored one skin to
-- "whatever pawn this player currently has," which meant parking one dino
-- and redeeming a different one still carried the old skin over — wrong,
-- confirmed live). A skin only ever applies at one of two well-defined
-- moments now: a website-triggered live-use request (below), or a redeem
-- of a parked dino that has a skin attached to it specifically (see
-- tryRedeem above) — never a continuous poll re-applying "the last used
-- skin." applyCustomizer itself (the actual color-write recipe) lives up
-- near jsonReadColorField, not here — tryRedeem needs it and comes before
-- this section in the file.

-- Charge ledger: {"skins":[{"name":...,"code":"SKIN-XXXX","colors":{...},"charges":N}]}
-- Written by the Worker's /skin-grant-charges (admin grants) and
-- /skin-attach-parked (decrements on attach); read and decremented here on
-- a live-use request. code is the stable id requests key off, not name
-- (names can collide or get retyped).
local function skinChargesFilePath(steam)
    return SAVED_DIR .. "/skin_charges_" .. steam .. ".json"
end

local function loadSkinCharges(steam)
    local path = skinChargesFilePath(steam)
    if not fileExists(path) then return {} end
    local body = readAll(path)
    if body == nil or body == "" then return {} end
    local section = body:match('"skins"%s*:%s*(%b[])') or "[]"
    local skins = {}
    for objStr in section:gmatch("%b{}") do
        local colorsSection = objStr:match('"colors"%s*:%s*(%b{})') or "{}"
        local colors = {}
        for _, field in ipairs(SKIN_COLOR_FIELDS) do
            local color = jsonReadColorField(colorsSection, field)
            if color ~= nil then colors[field] = color end
        end
        table.insert(skins, {
            name = jsonReadString(objStr, "name"),
            code = jsonReadString(objStr, "code"),
            charges = jsonReadNumber(objStr, "charges") or 0,
            colors = colors,
        })
    end
    return skins
end

local function skinChargeEntryToJson(entry)
    local colorParts = {}
    for _, field in ipairs(SKIN_COLOR_FIELDS) do
        local c = entry.colors[field]
        if c ~= nil then
            table.insert(colorParts, string.format('"%s":{"r":%f,"g":%f,"b":%f,"a":%f}',
                field, c.R, c.G, c.B, c.A or 1.0))
        end
    end
    return string.format('{"name":"%s","code":"%s","colors":{%s},"charges":%d}',
        jsonEscape(entry.name or ""), jsonEscape(entry.code or ""),
        table.concat(colorParts, ","), entry.charges or 0)
end

local function writeSkinCharges(steam, skins)
    if #skins == 0 then
        os.remove(skinChargesFilePath(steam))
        return true
    end
    local parts = {}
    for _, entry in ipairs(skins) do table.insert(parts, skinChargeEntryToJson(entry)) end
    local json = string.format('{"skins":[%s]}', table.concat(parts, ","))
    return writeAll(skinChargesFilePath(steam), json)
end

-- Core live-use logic: spend one charge of skinCode on the sender's
-- CURRENT live pawn. Deliberately does not touch the charge count until
-- AFTER a confirmed successful apply, so a failed attempt (no live pawn,
-- unknown code) never burns a charge. One-shot — does not persist past
-- this pawn's life; relogging or redeeming a different dino will not
-- carry it over (no auto-restore exists for this path, by design).
local function trySkinUse(steam, skinCode)
    if skinCode == nil or skinCode == "" then
        return false, "Skin use failed: missing skin code."
    end
    local gm = findGameMode()
    if gm == nil then return false, "Skin use failed: internal error." end
    local ctrl
    pcall(function() ctrl = gm:GetControllerBySteamId(steam) end)
    local pawn = livePawnFromCtrl(ctrl)
    if pawn == nil then
        return false, "Skin use failed: spawn in first, then try again."
    end

    local skins = loadSkinCharges(steam)
    local target, targetIndex
    for i, entry in ipairs(skins) do
        if entry.code == skinCode then
            target = entry
            targetIndex = i
            break
        end
    end
    if target == nil or (target.charges or 0) <= 0 then
        return false, "Skin use failed: no charges remaining."
    end

    if not applyCustomizer(pawn, target.colors) then
        return false, "Skin use failed: could not apply."
    end

    target.charges = target.charges - 1
    if target.charges <= 0 then
        table.remove(skins, targetIndex)
    end
    writeSkinCharges(steam, skins)

    local label = (target.name and target.name ~= "") and (" \"" .. target.name .. "\"") or ""
    return true, "Skin" .. label .. " applied."
end

local function checkWebsiteSkinUseRequest(steam)
    local path = skinUseRequestFilePath(steam)
    if not fileExists(path) then return end
    local body = readAll(path)
    os.remove(path)
    if body == nil or body == "" then return end

    local requestId = jsonReadString(body, "requestId")
    local skinCode = jsonReadString(body, "skinCode")
    if requestId == nil then return end

    local ok, message = trySkinUse(steam, skinCode)
    safeNotify(steam, message)
    log("Website skin-use request " .. requestId .. " for " .. steam .. ": ok=" .. tostring(ok)
        .. " message=" .. tostring(message))
    writeRequestResult(skinUseResultFilePath(steam), requestId, ok, message)
end

-- ── Website-triggered friend teleport (Friends tab, write direction) ──
--
-- First feature in this mod that moves a pawn's LOCATION rather than its
-- vitals/growth/cosmetics. K2_GetActorLocation (reading) is already on
-- this mod's own proven-safe list; K2_SetActorLocation (writing) is the
-- standard, universal AActor Blueprint counterpart — not an Isle-specific
-- function, so it's expected to behave the same way here, but genuinely
-- untested on this build. bTeleport=true tells the engine to skip
-- velocity-based movement blending, matching what an actual teleport
-- should do. ForceNetUpdate afterward mirrors the same defensive
-- replication kick applyCustomizer already uses for the same reason.
--
-- Deliberately does NOT use any of the game's own admin teleport
-- functions (TeleportToTarget/TeleportToMe on ATIGameModeBase,
-- ServerTeleportToTarget/ServerTeleportToMe on TIPlayerController) —
-- confirmed via the CXXHeaderDump that all four are part of the admin
-- system specifically (the GameModeBase pair requires an AdminController
-- parameter; the PlayerController pair sits in the same function list as
-- SetAdminCred/ServerUnban/ServerSmite, implying an internal admin check).
-- Building a player-facing feature on top of an admin-gated function would
-- either silently fail or risk exploiting a permission boundary we don't
-- fully understand — moving the pawn directly sidesteps that entirely.
local function tryTeleportToFriend(moverSteam, referenceSteam)
    if referenceSteam == nil or referenceSteam == "" then
        return false, "Teleport failed: missing friend reference."
    end
    local gm = findGameMode()
    if gm == nil then return false, "Teleport failed: internal error." end

    local moverCtrl
    pcall(function() moverCtrl = gm:GetControllerBySteamId(moverSteam) end)
    local moverPawn = livePawnFromCtrl(moverCtrl)
    if moverPawn == nil then
        return false, "Teleport failed: spawn in first, then try again."
    end

    local referenceCtrl
    pcall(function() referenceCtrl = gm:GetControllerBySteamId(referenceSteam) end)
    local referencePawn = livePawnFromCtrl(referenceCtrl)
    if referencePawn == nil then
        return false, "Teleport failed: your friend isn't online and spawned right now."
    end

    local location
    pcall(function() location = referencePawn:K2_GetActorLocation() end)
    if location == nil then
        return false, "Teleport failed: could not read your friend's location."
    end

    local ok, err = pcall(function()
        moverPawn:K2_SetActorLocation(location, false, nil, true)
    end)
    if not ok then
        log("Teleport: K2_SetActorLocation failed: " .. tostring(err))
        return false, "Teleport failed: could not move you there."
    end
    pcall(function() moverPawn:ForceNetUpdate() end)

    return true, "Teleported to your friend."
end

local function checkWebsiteTeleportRequest(steam)
    local path = teleportExecuteRequestFilePath(steam)
    if not fileExists(path) then return end
    local body = readAll(path)
    os.remove(path)
    if body == nil or body == "" then return end

    local requestId = jsonReadString(body, "requestId")
    local referenceSteam = jsonReadString(body, "referenceSteamId")
    if requestId == nil then return end

    local ok, message = tryTeleportToFriend(steam, referenceSteam)
    safeNotify(steam, message)
    if ok and referenceSteam ~= nil and referenceSteam ~= "" then
        safeNotify(referenceSteam, "A friend just teleported to you.")
    end
    log("Website teleport request " .. requestId .. " for " .. steam .. ": ok=" .. tostring(ok)
        .. " message=" .. tostring(message))
    writeRequestResult(teleportExecuteResultFilePath(steam), requestId, ok, message)
end

-- ── Website-triggered growth pause/resume (Live Dino tab) ──
--
-- ATIDinosaurBase carries its own uint8 bIsGrowthPaused flag plus an
-- IsGrowthPaused()/GetGrowthRate() getter pair — confirmed via a live
-- GenerateSDK dump of TheIsle.hpp, sitting directly alongside the other
-- growth-timing fields (NextGrowthTick, HatchlingGrowthTimeMinutes, etc.),
-- which is why this writes that flag directly rather than repeatedly
-- re-asserting Growth via SetGrowth — the community docs' own safety
-- rules warn SetGrowth recomputes and refills every vital's max each call,
-- which a polling re-assert would thrash badly. This flag isn't documented
-- anywhere in the community knowledge base (new ground, like the
-- ForEachFunction crash earlier this mod's history) — genuinely unverified
-- until watched live for a few real minutes to confirm Growth actually
-- stops advancing once set, not just decoratively flagged.
local GROWTH_PAUSE_MIN = 0.50
local GROWTH_PAUSE_MAX = 0.99

local function tryGrowthPauseToggle(steam, action)
    local gm = findGameMode()
    if gm == nil then return false, "Failed: internal error." end
    local ctrl
    pcall(function() ctrl = gm:GetControllerBySteamId(steam) end)
    local pawn = livePawnFromCtrl(ctrl)
    if pawn == nil then
        return false, "Failed: spawn in first, then try again."
    end

    if action == "pause" then
        local growth
        pcall(function() growth = pawn:GetGrowth() end)
        if growth == nil then
            return false, "Failed: could not read growth."
        end
        if growth < GROWTH_PAUSE_MIN or growth > GROWTH_PAUSE_MAX then
            return false, string.format(
                "Growth pause only allowed between 50%% and 99%% growth (currently %.0f%%).",
                growth * 100
            )
        end
        local ok, err = pcall(function()
            pawn.bIsGrowthPaused = true
            pawn:ForceNetUpdate()
        end)
        if not ok then
            log("Growth pause: write failed: " .. tostring(err))
            return false, "Failed: could not pause growth."
        end
        return true, "Growth paused."
    elseif action == "resume" then
        local ok, err = pcall(function()
            pawn.bIsGrowthPaused = false
            pawn:ForceNetUpdate()
        end)
        if not ok then
            log("Growth resume: write failed: " .. tostring(err))
            return false, "Failed: could not resume growth."
        end
        return true, "Growth resumed."
    end
    return false, "Failed: unknown action."
end

local function checkWebsiteGrowthPauseRequest(steam)
    local path = growthPauseRequestFilePath(steam)
    if not fileExists(path) then return end
    local body = readAll(path)
    os.remove(path)
    if body == nil or body == "" then return end

    local requestId = jsonReadString(body, "requestId")
    local action = jsonReadString(body, "action")
    if requestId == nil then return end

    local ok, message = tryGrowthPauseToggle(steam, action)
    safeNotify(steam, message)
    log("Website growth-pause request " .. requestId .. " for " .. steam .. ": action=" .. tostring(action)
        .. " ok=" .. tostring(ok) .. " message=" .. tostring(message))
    writeRequestResult(growthPauseResultFilePath(steam), requestId, ok, message)
end

-- Opportunistic status write, not request-driven — see growthStatusFilePath
-- above for why the website needs this at all.
local function writeGrowthStatus(steam, pawn)
    local paused = false
    pcall(function() paused = pawn.bIsGrowthPaused and true or false end)
    local growth = 0
    pcall(function() growth = pawn:GetGrowth() or 0 end)
    local body = string.format(
        '{"paused":%s,"growth":%f,"updatedAt":%d}',
        paused and "true" or "false", growth, os.time() * 1000
    )
    writeAll(growthStatusFilePath(steam), body)
end

-- TEMPORARY diagnostic (2026-09-11): dump a live dino's mutation catalog
-- once, to source real mutation FNames for the entombment compensation
-- feature (see EVRIMA_EntombBonus_Fix.md / EVRIMA_QuestMutation_Fix.md for
-- the underlying SetReplicatedMutationsData mechanism) rather than
-- guessing names from a wiki. FindFirstOf("TIMutations") + the global
-- GetAllLifecycleMutations() call was tried first (boot-time, no live
-- pawn needed) but came back nil — the global catalog isn't populated at
-- boot. This version instead reads a live dino's own per-instance catalog
-- (GetAllEnabledLifecycleMutationsAll/GetAvailableLifecycleMutationsAll on
-- ATIDinosaurBase), gated to fire exactly once via mutationDumpDone. Only
-- ordinary UFunctions — NOT ForEachFunction, which is confirmed to
-- hard-crash this build. Remove once the catalog has been captured from
-- the log; see git history if it needs revisiting.
local mutationDumpDone = false
local function tryMutationDumpOnce(pawn)
    if mutationDumpDone or pawn == nil then return end
    mutationDumpDone = true
    local ok, err = pcall(function()
        local classPath
        pcall(function() classPath = stripClassPrefix(pawn:GetClass():GetFullName()) end)
        local all
        pcall(function() all = pawn:GetAllEnabledLifecycleMutationsAll() end)
        if all == nil then pcall(function() all = pawn:GetAvailableLifecycleMutationsAll() end) end
        if all == nil then
            log("MutationDump: both catalog calls returned nil for class=" .. tostring(classPath))
            return
        end
        local n
        pcall(function() n = #all end)
        if type(n) ~= "number" then
            log("MutationDump: could not read array length for class=" .. tostring(classPath))
            return
        end
        log("MutationDump: class=" .. tostring(classPath) .. " entries=" .. tostring(n))
        for i = 1, n do
            local entry
            pcall(function() entry = all[i] end)
            local name, mtype
            if entry ~= nil then
                pcall(function() name = entry.MutationName:ToString() end)
                pcall(function() mtype = tostring(entry.MutationType) end)
            end
            log("MutationDump[" .. i .. "] name=" .. tostring(name) .. " type=" .. tostring(mtype))
        end
    end)
    if not ok then log("MutationDump: failed: " .. tostring(err)) end
end

-- Throttled diagnostic logging (this loop fires every REDEEM_REQUEST_POLL_MS,
-- too often to log unconditionally) so a silent failure here is actually
-- visible instead of just never doing anything. Gated ONCE per tick (not per
-- individual log call) so a genuinely silent failure (no GameMode, no
-- AllPlayerControllers) is still visible without spamming every tick.
local lastRedeemPollLogAt = 0
local function redeemPollShouldLog()
    local now = os.time()
    if now - lastRedeemPollLogAt < 30 then return false end
    lastRedeemPollLogAt = now
    return true
end

-- Confirmed live on this build: GameState.PlayerArray entries come back as
-- opaque "TrivialObject" values UE4SS hasn't bound methods for — calling
-- :GetOwningController() on one throws ("attempt to call a TrivialObject
-- value"). gm.AllPlayerControllers (a TSet<APlayerController*> on the game
-- mode, iterated via :ForEach — NOT indexable with #/[i], that's the
-- TSet-vs-TArray gotcha the safety docs warn about) hands back controllers
-- directly, sidestepping the broken call entirely — but each one still
-- arrives as a RemoteUnrealParam wrapper needing :get(), same as chat-hook
-- parameters elsewhere in this mod (confirmed live).
LoopInGameThreadWithDelay(REDEEM_REQUEST_POLL_MS, function()
    local gm = findGameMode()
    if gm == nil then
        if redeemPollShouldLog() then log("Redeem-request poll: no GameMode found") end
        return
    end
    local controllers
    pcall(function() controllers = gm.AllPlayerControllers end)
    if controllers == nil then
        if redeemPollShouldLog() then log("Redeem-request poll: AllPlayerControllers not available") end
        return
    end

    pcall(function()
        controllers:ForEach(function(ctrl)
            local ok, err = pcall(function()
                local unwrapped = unwrapIfNeeded(ctrl)
                local steam = getControllerSteamId(unwrapped)
                if steam ~= "" then
                    checkWebsiteParkRequest(steam)
                    checkWebsiteRedeemRequest(steam)
                    checkWebsiteSkinUseRequest(steam)
                    checkWebsiteTeleportRequest(steam)
                    checkWebsiteGrowthPauseRequest(steam)
                    local pawn = livePawnFromCtrl(unwrapped)
                    if pawn ~= nil then
                        writeGrowthStatus(steam, pawn)
                        tryMutationDumpOnce(pawn)
                    end
                end
            end)
            if not ok then log("Redeem-request poll: controller check failed: " .. tostring(err)) end
        end)
    end)
end)

-- ── Chat command hook ──

local recentCommands = {}

local function alreadyHandled(steam, message)
    local key = steam .. "|" .. message
    local now = os.time()
    if recentCommands[key] and (now - recentCommands[key]) < 3 then return true end
    recentCommands[key] = now
    return false
end

local function registerChatHook()
    local ok, err = pcall(function()
        RegisterHook("/Script/TheIsle.TIPlayerController:GetChatMessage",
            function(_self, newText, senderCtrlParam, _chatMode, _noFilter)
                log("HOOK FIRED")

                local senderCtrl
                local unwrapOk, unwrapErr = pcall(function() senderCtrl = senderCtrlParam:get() end)
                log("unwrap sender: ok=" .. tostring(unwrapOk) .. " err=" .. tostring(unwrapErr)
                    .. " senderCtrl=" .. tostring(senderCtrl))
                if senderCtrl == nil then return end

                local steam = getControllerSteamId(senderCtrl)
                log("sender steam=[" .. steam .. "]")
                if steam == "" then return end

                local rawMessage = safeString(newText)
                log("raw message=[" .. rawMessage .. "]")
                if rawMessage == "" then return end
                -- Keep original casing for the !park name argument; only the
                -- command word itself is matched case-insensitively.
                local trimmed = rawMessage:match("^%s*(.-)%s*$") or ""
                local lower = trimmed:lower()
                log("normalized message=[" .. lower .. "]")

                local command, nameArg
                if lower == "!park" or lower:match("^!park%s") then
                    command = "!park"
                    nameArg = trimmed:match("^%S+%s*(.-)%s*$") or ""
                elseif lower == "!redeem" or lower:match("^!redeem%s") then
                    command = "!redeem"
                    nameArg = trimmed:match("^%S+%s*(.-)%s*$") or ""
                elseif lower == "!parkstatus" then
                    command = "!parkstatus"
                elseif lower == "!testcurl" then
                    command = "!testcurl"
                end

                if command == nil then
                    log("no command match, ignoring")
                    return
                end
                if alreadyHandled(steam, lower) then
                    log("deduped, ignoring")
                    return
                end

                log("dispatching command: " .. command)
                if command == "!park" then queueAction("park", steam, nameArg)
                elseif command == "!redeem" then queueAction("redeem", steam, nameArg)
                elseif command == "!parkstatus" then queueAction("status", steam)
                else queueAction("testcurl", steam) end
            end)
    end)
    if ok then log("Chat hook registered")
    else log("Chat hook FAILED: " .. tostring(err)) end
end

log("Boot")
if writeAll(SAVED_DIR .. "/_boot_check.txt", "ok") then
    log("boot check: [" .. SAVED_DIR .. "] is writable")
else
    log("boot check: [" .. SAVED_DIR .. "] is NOT writable — !park will fail until this exists")
end
registerChatHook()

-- ── Admin-tier audit log (Ban/Kick/SetWeather/SetNewAvailableClasses) ──
--
-- These 4 native ATIGameModeBase functions (confirmed live 2026-09-11 via
-- UE4SS's GenerateSDK() header dump — see git history for the removed
-- discovery code) are what the in-game /adminpanel calls for Ban, Kick,
-- weather changes, and allowed-species changes. "Timeout" is NOT a separate
-- function — it's Ban(...) with a finite Time instead of a permanent one.
--
-- IMPORTANT: this is audit-only, not enforcement. Checked directly against
-- UE4SS's own docs: RegisterHook's pre-callback has no documented mechanism
-- to cancel or block the native function it's hooking — it can only observe
-- parameters and optionally override the *return value*. The real admin
-- action always executes regardless of what this hook does. What this CAN
-- do is record, precisely and tamper-evidently, who did what and whether
-- their tier was supposed to be able to.
--
-- Tamper-resistance has two layers:
--   1. Each line is hash-chained (every entry embeds a hash of the previous
--      entry plus its own content) so any edit or deletion of a past line
--      breaks the chain from that point forward — detectable even by
--      someone with full file access to this server.
--   2. Every entry also gets pulled off THIS server entirely into Cloudflare
--      KV by the bridge Worker's existing sync cron (see
--      workers/bridge-worker.js) — a system only the website owner
--      controls. That's the real tamper-resistance: the local file's hash
--      chain only detects tampering after the fact, but the Worker cron
--      runs every minute, so a same-server tamper attempt has at most a
--      ~1-minute window before an independent, off-server copy exists.
-- Neither layer is cryptographically bulletproof (no crypto library is
-- reachable from this Lua runtime — no `require`, no bit ops assumed), but
-- together they make quiet, undetected tampering impractical.

local ADMIN_TIERS_PATH = SAVED_DIR .. "/admin_tiers.json"
local ADMIN_AUDIT_LOG_PATH = SAVED_DIR .. "/admin_audit_log.ndjson"

local function loadAdminTiers()
    local body = readAll(ADMIN_TIERS_PATH)
    local tiers = { owner = {}, senior = {}, admin = {} }
    if body == nil or body == "" then return tiers end
    for _, tierName in ipairs({ "owner", "senior", "admin" }) do
        local arrStr = body:match('"' .. tierName .. '"%s*:%s*(%b[])')
        if arrStr ~= nil then
            for id in arrStr:gmatch('"(%d+)"') do
                tiers[tierName][id] = true
            end
        end
    end
    return tiers
end

local function tierOf(steam)
    local tiers = loadAdminTiers()
    if tiers.owner[steam] then return "owner" end
    if tiers.senior[steam] then return "senior" end
    if tiers.admin[steam] then return "admin" end
    return nil
end

-- Only the 3 actions with any real restriction need an entry here. Kick
-- isn't restricted for any tier, so it's always "allowed" (still logged,
-- for a complete trail, just never flagged as a violation).
local RESTRICTED_ACTIONS = {
    ban = { owner = true, senior = false, admin = false },
    allowedclasses = { owner = true, senior = false, admin = false },
    weather = { owner = true, senior = true, admin = false },
}

local function canPerform(tier, action)
    if tier == nil then return false end
    local rule = RESTRICTED_ACTIONS[action]
    if rule == nil then return true end
    return rule[tier] == true
end

-- Pure-Lua FNV-1a-style hash using only arithmetic (no bitwise operators,
-- no external library) so it works regardless of this build's Lua version.
-- This is a tamper-EVIDENCE checksum, not cryptographic security — its job
-- is to make a silently-edited or silently-deleted line detectable, not to
-- resist a determined attacker with time to forge matching hashes by hand.
local function simpleHash(s)
    local hash = 2166136261
    for i = 1, #s do
        hash = ((hash % 16777216) * 16777619 + s:byte(i)) % 4294967296
    end
    return string.format("%08x", hash % 4294967296)
end

-- Reads the log's last line to continue the hash chain across restarts.
-- The log is small (admin actions are rare) so reading it whole is fine.
local function lastAuditChainState()
    local body = readAll(ADMIN_AUDIT_LOG_PATH)
    if body == nil or body == "" then return 0, "genesis" end
    local lastLine = nil
    for line in body:gmatch("[^\n]+") do lastLine = line end
    if lastLine == nil then return 0, "genesis" end
    local seq = jsonReadNumber(lastLine, "seq") or 0
    local hash = jsonReadString(lastLine, "hash") or "genesis"
    return seq, hash
end

local pendingAuditEvents = {}

local function queueAuditEvent(action, adminSteam, extra)
    pendingAuditEvents[#pendingAuditEvents + 1] = {
        action = action, adminSteam = adminSteam, extra = extra or {}, at = os.time(),
    }
end

local function processAuditEvent(evt)
    local tier = tierOf(evt.adminSteam)
    local allowed = canPerform(tier, evt.action)
    local extraParts = {}
    for _, k in ipairs({ "targetSteam", "targetName", "reason", "timeHours" }) do
        if evt.extra[k] ~= nil then
            table.insert(extraParts, k .. "=" .. tostring(evt.extra[k]))
        end
    end
    local extraStr = table.concat(extraParts, "; ")

    local seq, prevHash = lastAuditChainState()
    seq = seq + 1
    -- Canonical (field-order-fixed) body used for the hash so the chain is
    -- reproducible; hash covers this entry's own fields PLUS the previous
    -- entry's hash, which is what makes it a chain (breaking any one entry
    -- invalidates every entry after it, not just that one).
    local bodyForHash = string.format(
        '%d|%d|%s|%s|%s|%s|%s',
        seq, evt.at, evt.action, evt.adminSteam, tostring(tier), tostring(allowed), extraStr
    )
    local hash = simpleHash(prevHash .. "|" .. bodyForHash)

    local line = string.format(
        '{"seq":%d,"ts":%d,"action":"%s","adminSteam":"%s","adminTier":"%s","allowed":%s,"extra":"%s","prevHash":"%s","hash":"%s"}',
        seq, evt.at, jsonEscape(evt.action), jsonEscape(evt.adminSteam), jsonEscape(tostring(tier)),
        allowed and "true" or "false", jsonEscape(extraStr), jsonEscape(prevHash), jsonEscape(hash)
    )
    local f = io.open(ADMIN_AUDIT_LOG_PATH, "a")
    if f ~= nil then
        f:write(line .. "\n")
        f:close()
    else
        log("Admin audit log: FAILED to open " .. ADMIN_AUDIT_LOG_PATH .. " for append")
    end

    log("Admin audit: seq=" .. seq .. " action=" .. evt.action .. " admin=" .. evt.adminSteam
        .. " tier=" .. tostring(tier) .. " allowed=" .. tostring(allowed) .. " [" .. extraStr .. "]")

    if not allowed then
        safeNotify(evt.adminSteam,
            "Note: this action is outside your admin tier's normal permissions. It still went through, but it's been logged for review.")
    end
end

LoopInGameThreadWithDelay(3000, function()
    if #pendingAuditEvents == 0 then return end
    local drain = pendingAuditEvents
    pendingAuditEvents = {}
    for _, evt in ipairs(drain) do
        local ok, err = pcall(function() processAuditEvent(evt) end)
        if not ok then log("Audit event failed: " .. tostring(err)) end
    end
end)

-- Every hook below follows the same shape: extract only PRIMITIVE values
-- (steam ids, names, numbers, bools) from the hook's RemoteUnrealParam
-- arguments inside the hook itself, then queue those primitives for the
-- deferred tick above. Never do file I/O or safeNotify from inside a hook
-- (rule 5 in the safety docs — ClientShowNotification crashes synchronously
-- from inside a hook callback), and never hold onto the wrapped param
-- objects themselves past this callback (rule 6 — unstable across ticks).
local function registerAdminAuditHooks()
    -- Ban(AdminController, TargetSteamID, TargetName, Reason, Time)
    local okBan, errBan = pcall(function()
        RegisterHook("/Script/TheIsle.TIGameModeBase:Ban",
            function(_self, adminCtrlParam, targetSteamParam, targetNameParam, _reasonParam, timeParam)
                local ok, err = pcall(function()
                    local adminSteam = getControllerSteamId(unwrapIfNeeded(adminCtrlParam))
                    if adminSteam == "" then return end
                    local timeHours
                    pcall(function() timeHours = unwrapIfNeeded(timeParam) end)
                    queueAuditEvent("ban", adminSteam, {
                        targetSteam = safeString(targetSteamParam),
                        targetName = safeString(targetNameParam),
                        timeHours = timeHours,
                    })
                end)
                if not ok then log("Ban audit hook failed: " .. tostring(err)) end
            end)
    end)
    if okBan then log("Admin audit hook registered: Ban")
    else log("Admin audit hook FAILED (Ban): " .. tostring(errBan)) end

    -- Kick(AdminController, TargetSteamID, TargetName, Reason)
    local okKick, errKick = pcall(function()
        RegisterHook("/Script/TheIsle.TIGameModeBase:Kick",
            function(_self, adminCtrlParam, targetSteamParam, targetNameParam, _reasonParam)
                local ok, err = pcall(function()
                    local adminSteam = getControllerSteamId(unwrapIfNeeded(adminCtrlParam))
                    if adminSteam == "" then return end
                    queueAuditEvent("kick", adminSteam, {
                        targetSteam = safeString(targetSteamParam),
                        targetName = safeString(targetNameParam),
                    })
                end)
                if not ok then log("Kick audit hook failed: " .. tostring(err)) end
            end)
    end)
    if okKick then log("Admin audit hook registered: Kick")
    else log("Admin audit hook FAILED (Kick): " .. tostring(errKick)) end

    -- SetWeather(AdminController, Weather) — Weather is an opaque UObject*;
    -- deliberately never touched, only AdminController is read.
    local okWeather, errWeather = pcall(function()
        RegisterHook("/Script/TheIsle.TIGameModeBase:SetWeather",
            function(_self, adminCtrlParam, _weatherParam)
                local ok, err = pcall(function()
                    local adminSteam = getControllerSteamId(unwrapIfNeeded(adminCtrlParam))
                    if adminSteam == "" then return end
                    queueAuditEvent("weather", adminSteam, {})
                end)
                if not ok then log("Weather audit hook failed: " .. tostring(err)) end
            end)
    end)
    if okWeather then log("Admin audit hook registered: SetWeather")
    else log("Admin audit hook FAILED (SetWeather): " .. tostring(errWeather)) end

    -- SetNewAvailableClasses(NewAvailableClasses, NewCookedClasses,
    -- AdminController, bIsRcon) — note AdminController is the 3rd param
    -- here, not the 1st. The two TArray<FTIAvailableClassData> params are
    -- deliberately never touched (unknown struct shape, not worth the
    -- risk for an audit log that doesn't need the exact class list).
    local okClasses, errClasses = pcall(function()
        RegisterHook("/Script/TheIsle.TIGameModeBase:SetNewAvailableClasses",
            function(_self, _newClassesParam, _newCookedParam, adminCtrlParam, _bIsRconParam)
                local ok, err = pcall(function()
                    local adminSteam = getControllerSteamId(unwrapIfNeeded(adminCtrlParam))
                    if adminSteam == "" then return end
                    queueAuditEvent("allowedclasses", adminSteam, {})
                end)
                if not ok then log("AllowedClasses audit hook failed: " .. tostring(err)) end
            end)
    end)
    if okClasses then log("Admin audit hook registered: SetNewAvailableClasses")
    else log("Admin audit hook FAILED (SetNewAvailableClasses): " .. tostring(errClasses)) end
end

registerAdminAuditHooks()
