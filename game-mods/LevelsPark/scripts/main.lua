-- LevelsPark: real in-game park/unpark for The Isle EVRIMA.
--
-- !park   captures growth/health/stamina/hunger/thirst for the sender's live
--         dino, saves it to disk, then kills the dino (SetHealth(0)). The
--         player naturally lands on the respawn/species-select screen.
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
--   - No mutations/nutrients/skin/prime handling. Deliberately out of scope;
--     this mod only round-trips growth + the four core vitals.
--   - Heavy actions (kill, restore) are deferred a few seconds off the chat
--     hook and re-resolve the pawn fresh at fire time (hook parameter
--     wrappers and cached pawns are unsafe across ticks).

local MOD_NAME = "LevelsPark"
local SAVED_DIR = "Mods/LevelsPark/Saved"
local PARKED_DIR = SAVED_DIR .. "/parked"
local FRESH_SPAWN_GROWTH_CEILING = 0.30

-- os.execute() spawns a child process (cmd.exe) whose working directory does
-- NOT match the relative path base that UE4SS's own Lua io.open() resolves
-- against — confirmed live: curl reported success but the relative-path
-- output file never appeared where Lua looked for it. Use an absolute path
-- (from this server's confirmed UE4SS root directory, logged at boot) for
-- anything written via os.execute. If this mod is moved to a different
-- server/host, update this to match that server's UE4SS.log "root directory"
-- line.
local ABS_SAVED_DIR = "Z:/home/container/TheIsle/Binaries/Win64/ue4ss/Mods/LevelsPark/Saved"
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
    local f = io.open(path, "wb")
    if f == nil then return false end
    f:write(body)
    f:close()
    return true
end

local function parkedFilePath(steam)
    return PARKED_DIR .. "/" .. steam .. ".json"
end

local function loadParkedState(steam)
    local path = parkedFilePath(steam)
    if not fileExists(path) then return nil end
    local body = readAll(path)
    if body == nil or body == "" then return nil end
    return {
        classPath = jsonReadString(body, "classPath"),
        growth = jsonReadNumber(body, "growth"),
        health = jsonReadNumber(body, "health"),
        stamina = jsonReadNumber(body, "stamina"),
        hunger = jsonReadNumber(body, "hunger"),
        thirst = jsonReadNumber(body, "thirst"),
        maxHunger = jsonReadNumber(body, "maxHunger"),
        maxThirst = jsonReadNumber(body, "maxThirst"),
        maxStamina = jsonReadNumber(body, "maxStamina"),
        capturedAt = jsonReadNumber(body, "capturedAt"),
    }
end

local function saveParkedState(steam, state)
    local json = string.format(
        '{"version":1,"steam":"%s","classPath":"%s","growth":%f,"health":%f,"stamina":%f,' ..
        '"hunger":%f,"thirst":%f,"maxHunger":%f,"maxThirst":%f,"maxStamina":%f,"capturedAt":%d}',
        jsonEscape(steam), jsonEscape(state.classPath), state.growth, state.health, state.stamina,
        state.hunger, state.thirst, state.maxHunger, state.maxThirst, state.maxStamina, state.capturedAt
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
    pcall(function() state.stamina = pawn:GetStamina() end)
    pcall(function() state.hunger = pawn:GetHunger() end)
    pcall(function() state.thirst = pawn:GetThirst() end)
    pcall(function() state.maxHunger = pawn:GetMaxHunger() end)
    pcall(function() state.maxThirst = pawn:GetMaxThirst() end)
    pcall(function() state.maxStamina = pawn:GetMaxStamina() end)
    state.capturedAt = os.time()
    return state
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

local function queueAction(kind, steam)
    pendingActions[#pendingActions + 1] = { kind = kind, steam = steam }
end

local function processPark(steam)
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
    if state.classPath == nil or state.growth == nil then
        safeNotify(steam, "Park failed: could not read dino state.")
        return
    end

    if not saveParkedState(steam, state) then
        safeNotify(steam, "Park failed: could not save state.")
        return
    end

    pcall(function() pawn:SetHealth(0) end)
    log("Parked " .. steam .. " (" .. tostring(state.classPath) .. ", growth=" .. tostring(state.growth) .. ")")
    safeNotify(steam, "Dino parked. Respawn as the same species, then type !unpark to restore it.")
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
    safeNotify(steam, string.format("Parked: %s, growth %.0f%%, parked %d min ago.",
        tostring(state.classPath), (state.growth or 0) * 100, ageMin))
end

-- TEMPORARY diagnostic: checks whether os.execute + curl.exe are usable from
-- this Lua environment at all, before building the real webhook on top of it.
-- Safe/cheap: curl --version does no network I/O, so this can't hang or
-- freeze the server even if something's wrong.
local function processTestCurl(steam)
    local outPathAbs = ABS_SAVED_DIR .. "/curltest.txt"
    local outPathRel = SAVED_DIR .. "/curltest.txt"
    os.remove(outPathRel)

    local cmd = 'curl --version > "' .. outPathAbs .. '" 2>&1'
    log("testcurl: running command: " .. cmd)
    local execOk, r1, r2, r3 = pcall(function()
        return os.execute(cmd)
    end)
    log("testcurl: os.execute pcall ok=" .. tostring(execOk) .. " r1=" .. tostring(r1)
        .. " r2=" .. tostring(r2) .. " r3=" .. tostring(r3))

    local body = readAll(outPathRel)
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
            if action.kind == "park" then processPark(action.steam)
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

                local message = safeString(newText)
                log("raw message=[" .. message .. "]")
                if message == "" then return end
                message = message:lower():match("^%s*(.-)%s*$") or ""
                log("normalized message=[" .. message .. "]")

                if message ~= "!park" and message ~= "!unpark" and message ~= "!parkstatus"
                    and message ~= "!testcurl" then
                    log("no command match, ignoring")
                    return
                end
                if alreadyHandled(steam, message) then
                    log("deduped, ignoring")
                    return
                end

                log("dispatching command: " .. message)
                if message == "!park" then queueAction("park", steam)
                elseif message == "!unpark" then queueAction("unpark", steam)
                elseif message == "!parkstatus" then queueAction("status", steam)
                else queueAction("testcurl", steam) end
            end)
    end)
    if ok then log("Chat hook registered")
    else log("Chat hook FAILED: " .. tostring(err)) end
end

log("Boot")
registerChatHook()
