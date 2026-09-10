-- LevelsPark: real in-game park/unpark for The Isle EVRIMA.
--
-- !park [name]  captures growth/health/stamina/hunger/thirst (plus the
--         display-only extras below) for the sender's live dino, saves it to
--         disk, then kills the dino (SetHealth(0)). The player naturally
--         lands on the respawn/species-select screen. The optional name
--         (e.g. "!park Rex") is our own metadata for the website gallery —
--         the game has no such field, so it's just stored as-is.
-- !unpark applies the saved stats onto the sender's current live pawn, IF the
--         species matches what was parked and the pawn is a fresh spawn
--         (growth below FRESH_SPAWN_GROWTH_CEILING). Consumes (deletes) the
--         saved snapshot on success, matching the website's "one active
--         parked dino at a time" rule.
-- !parkstatus reports what's currently parked for the sender, if anything.
--
-- Architecture notes (see EVRIMA_State_Restore_Cookbook.md / DinoStorage
-- Architecture for the full recipe this is a trimmed-down version of):
--   - Transform-in-place only. RequestRespawn is unreachable from Lua
--     (crashes on the FCustomizerDataBase by-value param), so this never
--     calls any respawn API. !park kills the pawn and lets the player
--     respawn through the normal game UI; !unpark mutates the resulting
--     fresh juvenile in-place via scalar setters.
--   - No mutations/nutrients/skin restore. Deliberately out of scope; this
--     mod only round-trips growth + the four core vitals. PRIME status and
--     body color ARE captured, but display-only (for the website gallery,
--     not applied on !unpark).
--   - Heavy actions (kill, restore) are deferred a few seconds off the chat
--     hook and re-resolve the pawn fresh at fire time (hook parameter
--     wrappers and cached pawns are unsafe across ticks).

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

local function loadParkedState(steam)
    local path = parkedFilePath(steam)
    if not fileExists(path) then return nil end
    local body = readAll(path)
    if body == nil or body == "" then return nil end
    return {
        name = jsonReadString(body, "name"),
        classPath = jsonReadString(body, "classPath"),
        growth = jsonReadNumber(body, "growth"),
        health = jsonReadNumber(body, "health"),
        maxHealth = jsonReadNumber(body, "maxHealth"),
        stamina = jsonReadNumber(body, "stamina"),
        hunger = jsonReadNumber(body, "hunger"),
        thirst = jsonReadNumber(body, "thirst"),
        maxHunger = jsonReadNumber(body, "maxHunger"),
        maxThirst = jsonReadNumber(body, "maxThirst"),
        maxStamina = jsonReadNumber(body, "maxStamina"),
        primeElder = jsonReadBool(body, "primeElder"),
        bodyColorR = jsonReadNumber(body, "bodyColorR"),
        bodyColorG = jsonReadNumber(body, "bodyColorG"),
        bodyColorB = jsonReadNumber(body, "bodyColorB"),
        capturedAt = jsonReadNumber(body, "capturedAt"),
    }
end

local function saveParkedState(steam, state)
    local json = string.format(
        '{"version":1,"steam":"%s","name":"%s","classPath":"%s","growth":%f,"health":%f,' ..
        '"maxHealth":%f,"stamina":%f,"hunger":%f,"thirst":%f,"maxHunger":%f,"maxThirst":%f,' ..
        '"maxStamina":%f,"primeElder":%s,"bodyColorR":%f,"bodyColorG":%f,"bodyColorB":%f,' ..
        '"capturedAt":%d}',
        jsonEscape(steam), jsonEscape(state.name or ""), jsonEscape(state.classPath), state.growth,
        state.health, state.maxHealth or 0, state.stamina, state.hunger, state.thirst,
        state.maxHunger or 0, state.maxThirst or 0, state.maxStamina or 0,
        state.primeElder and "true" or "false", state.bodyColorR or 0, state.bodyColorG or 0,
        state.bodyColorB or 0, state.capturedAt
    )
    return writeAll(parkedFilePath(steam), json)
end

local function deleteParkedState(steam)
    os.remove(parkedFilePath(steam))
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
    if state.maxHunger then pcall(function() pawn:SetMaxHunger(state.maxHunger) end) end
    if state.maxThirst then pcall(function() pawn:SetMaxThirst(state.maxThirst) end) end
    if state.maxStamina then pcall(function() pawn:SetMaxStamina(state.maxStamina) end) end
    pcall(function() pawn:SetHealth(state.health) end)
    pcall(function() pawn:SetStamina(state.stamina) end)
    pcall(function() pawn:SetHunger(state.hunger) end)
    pcall(function() pawn:SetThirst(state.thirst) end)
end

-- ── Deferred action queue (rule 5: never SetHealth/notify/etc from inside a hook) ──

local pendingActions = {}

local function queueAction(kind, steam, extra)
    pendingActions[#pendingActions + 1] = { kind = kind, steam = steam, extra = extra }
end

local function processPark(steam, name)
    local gm = findGameMode()
    if gm == nil then return end
    local ctrl
    pcall(function() ctrl = gm:GetControllerBySteamId(steam) end)
    local pawn = livePawnFromCtrl(ctrl)
    if pawn == nil then
        safeNotify(steam, "Park failed: no live dino found.")
        return
    end

    local state = capturePawnState(pawn)
    state.name = sanitizeName(name)
    if state.classPath == nil or state.growth == nil then
        safeNotify(steam, "Park failed: could not read dino state.")
        return
    end

    if not saveParkedState(steam, state) then
        safeNotify(steam, "Park failed: could not save state.")
        return
    end

    pcall(function() pawn:SetHealth(0) end)
    log("Parked " .. steam .. " (" .. tostring(state.classPath) .. ", growth=" .. tostring(state.growth)
        .. (state.name ~= "" and (", name=" .. state.name) or "") .. ")")
    safeNotify(steam, "Dino parked" .. (state.name ~= "" and (" as \"" .. state.name .. "\"") or "")
        .. ". Respawn as the same species, then type !unpark to restore it.")
end

local function processUnpark(steam)
    local state = loadParkedState(steam)
    if state == nil then
        safeNotify(steam, "Nothing parked for you right now.")
        return
    end

    local gm = findGameMode()
    if gm == nil then return end
    local ctrl
    pcall(function() ctrl = gm:GetControllerBySteamId(steam) end)
    local pawn = livePawnFromCtrl(ctrl)
    if pawn == nil then
        safeNotify(steam, "Unpark failed: spawn in first, then type !unpark.")
        return
    end

    local liveClassPath
    pcall(function() liveClassPath = stripClassPrefix(pawn:GetClass():GetFullName()) end)
    if liveClassPath == nil or liveClassPath ~= state.classPath then
        safeNotify(steam, "Unpark failed: spawn as the same species you parked, then try again.")
        return
    end

    local liveGrowth
    pcall(function() liveGrowth = pawn:GetGrowth() end)
    if liveGrowth == nil or liveGrowth > FRESH_SPAWN_GROWTH_CEILING then
        safeNotify(steam, "Unpark only works on a freshly-spawned juvenile.")
        return
    end

    applyStateToPawn(pawn, state)
    deleteParkedState(steam)
    log("Unparked " .. steam .. " (" .. tostring(state.classPath) .. ")")
    safeNotify(steam, "Dino restored from your parked snapshot.")
end

local function processParkStatus(steam)
    local state = loadParkedState(steam)
    if state == nil then
        safeNotify(steam, "You have nothing parked.")
        return
    end
    local ageMin = math.floor((os.time() - (state.capturedAt or os.time())) / 60)
    local label = (state.name and state.name ~= "") and (state.name .. " (" .. tostring(state.classPath) .. ")")
        or tostring(state.classPath)
    safeNotify(steam, string.format("Parked: %s, growth %.0f%%, parked %d min ago.",
        label, (state.growth or 0) * 100, ageMin))
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

LoopInGameThreadWithDelay(ACTION_DELAY_MS, function()
    if #pendingActions == 0 then return end
    local drain = pendingActions
    pendingActions = {}
    for _, action in ipairs(drain) do
        local ok, err = pcall(function()
            if action.kind == "park" then processPark(action.steam, action.extra)
            elseif action.kind == "unpark" then processUnpark(action.steam)
            elseif action.kind == "status" then processParkStatus(action.steam)
            elseif action.kind == "testcurl" then processTestCurl(action.steam)
            end
        end)
        if not ok then log("Action " .. tostring(action.kind) .. " failed: " .. tostring(err)) end
    end
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
                elseif lower == "!unpark" then
                    command = "!unpark"
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
                elseif command == "!unpark" then queueAction("unpark", steam)
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
