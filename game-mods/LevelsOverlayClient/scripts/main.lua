-- LevelsOverlayClient — Phase 0 proof of concept.
--
-- Renders Live Dino stats as a native UMG widget built directly into the
-- game's own UI layer, so it shows up regardless of display mode
-- (fullscreen, borderless, windowed) — unlike the separate Electron
-- overlay (overlay/), which only renders over the game when it's NOT in
-- true exclusive fullscreen, since that's an OS-compositor limitation no
-- external window can get around.
--
-- CLIENT-SIDE mod — installed on an individual PLAYER's own machine,
-- not the dedicated server. This is a genuinely different execution
-- context from game-mods/LevelsPark (the existing server-side mod):
-- this code only ever has visibility into the LOCAL player's own pawn/
-- controller, never anyone else's. That's also why this phase is
-- Live-Dino-only — Live Dino only ever needs the local player's own
-- data; the Map widget needs OTHER players' positions, which this
-- client has no server-side authority to just read, and is deliberately
-- deferred to a later phase once this one's two real unknowns are
-- actually confirmed:
--   1. Does a UMG widget built this way actually survive true
--      exclusive fullscreen the way native HUD elements do? (Expected
--      yes, per how UMG/Slate rendering works, but unverified on this
--      specific game build.)
--   2. Does Isle's Easy Anti-Cheat tolerate a client-side UE4SS mod at
--      all? Unverified — see the Overlay design memo. This is why this
--      build is for Sidh and Skoob's own accounts ONLY, not distributed
--      to the wider playerbase yet.
--
-- The exact stat property names below (Growth/Health/Stamina/Hunger/
-- Thirst) are an educated guess, NOT confirmed against this build —
-- the server-side mod only ever reads these via RCON's text protocol,
-- never as direct Lua pawn properties, so there's no existing precedent
-- in this codebase to copy from. Each read is individually pcall-wrapped
-- and logs on failure specifically so a wrong guess shows up clearly in
-- UE4SS.log instead of silently displaying nothing.

local UEHelpers = require("UEHelpers")

local UPDATE_INTERVAL_MS = 500
-- 1/10 of screen, top-left corner — the default placement locked in on
-- the Overlay design memo. No edit mode (drag/resize) yet in this phase.
local SCREEN_FRACTION = 0.1

local function log(msg)
    print("[LevelsOverlayClient] " .. tostring(msg) .. "\n")
end

local function construct(classPath, outer, name)
    local cls = StaticFindObject(classPath)
    if cls == nil then
        log("construct: StaticFindObject failed for " .. classPath)
        return nil
    end
    local ok, obj = pcall(function()
        return StaticConstructObject(cls, outer, FName(name))
    end)
    if not ok or obj == nil then
        log("construct: StaticConstructObject failed for " .. classPath .. " (" .. tostring(obj) .. ")")
        return nil
    end
    return obj
end

local function styleText(textBlock, size, r, g, b)
    pcall(function()
        if textBlock.Font ~= nil then
            textBlock.Font.Size = size
        end
        textBlock:SetColorAndOpacity({
            SpecifiedColor = { R = r, G = g, B = b, A = 1.0 },
            ColorUseRule = 0,
        })
    end)
end

-- Pins a CanvasPanel child to a fixed fractional rectangle of the
-- viewport (0,0 = top-left corner of the screen, 1,1 = bottom-right) —
-- not auto-sized, not stretched, exactly the rect given.
local function anchorRect(slot, minX, minY, maxX, maxY)
    pcall(function()
        slot:SetAutoSize(false)
        slot:SetAnchors({ Minimum = { X = minX, Y = minY }, Maximum = { X = maxX, Y = maxY } })
        slot:SetOffsets({ Left = 0, Top = 0, Right = 0, Bottom = 0 })
        slot:SetAlignment({ X = 0, Y = 0 })
    end)
end

local hud = nil
local labels = {}

local function createHud()
    local outer = UEHelpers.GetGameInstance()
    if outer == nil or not outer:IsValid() then
        outer = UEHelpers.GetPlayerController()
    end
    if outer == nil or not outer:IsValid() then
        return nil -- no GameInstance/PlayerController yet — retried next tick
    end

    local root = construct("/Script/UMG.UserWidget", outer, "LevelsOverlay_Root")
    if root == nil then return nil end
    local tree = construct("/Script/UMG.WidgetTree", root, "LevelsOverlay_Tree")
    if tree == nil then return nil end
    root.WidgetTree = tree

    local canvas = construct("/Script/UMG.CanvasPanel", tree, "LevelsOverlay_Canvas")
    if canvas == nil then return nil end
    tree.RootWidget = canvas

    -- Dark, semi-opaque background so the stats stay legible over any
    -- in-game scene — same idea as the Electron overlay's own card.
    local panel = construct("/Script/UMG.Border", canvas, "LevelsOverlay_Panel")
    if panel == nil then return nil end
    pcall(function()
        panel:SetBrushColor({ R = 0.08, G = 0.07, B = 0.05, A = 0.82 })
        panel:SetPadding({ Left = 10, Top = 8, Right = 10, Bottom = 8 })
    end)

    local vbox = construct("/Script/UMG.VerticalBox", panel, "LevelsOverlay_VBox")
    if vbox == nil then return nil end
    pcall(function() panel:SetContent(vbox) end)

    local function addLine(name, size)
        local line = construct("/Script/UMG.TextBlock", vbox, name)
        if line == nil then return nil end
        styleText(line, size, 0.94, 0.90, 0.83)
        pcall(function() vbox:AddChildToVerticalBox(line) end)
        return line
    end

    labels.species = addLine("LevelsOverlay_Species", 13)
    labels.name = addLine("LevelsOverlay_Name", 12)
    labels.growth = addLine("LevelsOverlay_Growth", 11)
    labels.health = addLine("LevelsOverlay_Health", 11)
    labels.stamina = addLine("LevelsOverlay_Stamina", 11)
    labels.hunger = addLine("LevelsOverlay_Hunger", 11)
    labels.thirst = addLine("LevelsOverlay_Thirst", 11)

    local slot
    pcall(function() slot = canvas:AddChildToCanvas(panel) end)
    if slot ~= nil then
        anchorRect(slot, 0, 0, SCREEN_FRACTION, SCREEN_FRACTION)
    end

    local added = pcall(function() root:AddToViewport(100) end)
    if not added then
        log("createHud: AddToViewport failed")
        return nil
    end

    log("HUD created.")
    return root
end

local function setLine(label, text)
    if label == nil then return end
    pcall(function() label:SetText(FText(text)) end)
end

local function pct(value)
    if type(value) ~= "number" then return "—" end
    return string.format("%d%%", math.floor((value * 100) + 0.5))
end

-- Tracks which of the guessed stat properties have already failed once,
-- so a wrong guess logs exactly once (not every 500ms) instead of
-- spamming UE4SS.log into uselessness.
local loggedFailures = {}
local function readStat(pawn, propertyName)
    local value
    local ok = pcall(function() value = pawn[propertyName] end)
    if (not ok or value == nil) and not loggedFailures[propertyName] then
        loggedFailures[propertyName] = true
        log("Could not read pawn property '" .. propertyName .. "' — guessed name is likely wrong for this build.")
    end
    return value
end

local function updateHud()
    local playerController = UEHelpers.GetPlayerController()
    if playerController == nil or not playerController:IsValid() then return end

    local pawn
    pcall(function() pawn = playerController.Pawn end)
    if pawn == nil or not pawn:IsValid() then
        setLine(labels.species, "No live dino")
        setLine(labels.name, "")
        setLine(labels.growth, "")
        setLine(labels.health, "")
        setLine(labels.stamina, "")
        setLine(labels.hunger, "")
        setLine(labels.thirst, "")
        return
    end

    local className = "Unknown"
    pcall(function() className = pawn:GetClass():GetFName():ToString() end)

    setLine(labels.species, className)
    setLine(labels.name, "")
    setLine(labels.growth, "Growth: " .. pct(readStat(pawn, "Growth")))
    setLine(labels.health, "Health: " .. pct(readStat(pawn, "Health")))
    setLine(labels.stamina, "Stamina: " .. pct(readStat(pawn, "Stamina")))
    setLine(labels.hunger, "Hunger: " .. pct(readStat(pawn, "Hunger")))
    setLine(labels.thirst, "Thirst: " .. pct(readStat(pawn, "Thirst")))
end

-- LoopInGameThreadWithDelay repeats on its own (confirmed in the
-- server-side mod's own comments) — registered once, not re-scheduled
-- manually each tick.
LoopInGameThreadWithDelay(UPDATE_INTERVAL_MS, function()
    if hud == nil or not hud:IsValid() then
        hud = createHud()
    end
    if hud ~= nil then
        updateHud()
    end
end)

log("Loaded. Waiting for a valid PlayerController to build the HUD.")
