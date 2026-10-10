# LevelsOverlayClient — Phase 0 (testing only)

A **client-side** UE4SS mod — installed on your own gaming PC, not the
server — that renders Live Dino stats as a native in-game UI panel,
top-left corner, instead of a separate downloadable app. Built to answer
two open questions before this goes anywhere near the wider playerbase:

1. Does a widget built this way actually show up during real gameplay,
   including true Fullscreen (not just Borderless)?
2. Does Isle's Easy Anti-Cheat tolerate a client-side UE4SS mod at all?

**This is for Sidh and Skoob's own accounts only.** Do not share this
folder with other players yet — see the Overlay design memo for why a
client-side mod is a materially different anti-cheat question than the
server-side LevelsPark mod (which runs on the dedicated server and never
touches your own machine at all).

## What it does right now

Just Live Dino — species, growth, health, stamina, hunger, thirst — for
your own currently-spawned dino. No Map yet (that needs a different data
source and comes later, once this is confirmed working). No drag/resize
(also later). Fixed top-left corner, 1/10 of your screen.

## Install

This installs **into your own local copy of the game**, not the server.

1. Make sure UE4SS is installed on your own Isle client (this is a
   different install from the server's copy — you need your own, on your
   own PC). Grab the **experimental** build, not the stable release —
   confirmed elsewhere in this project that Isle needs the experimental
   build, the stable one won't load. Extract it into your own
   `TheIsle/Binaries/Win64/` folder (right-click The Isle in Steam →
   Manage → Browse local files to find your install).
2. Copy this whole `LevelsOverlayClient` folder into:
   ```
   <your Isle install>/TheIsle/Binaries/Win64/ue4ss/Mods/
   ```
   It already includes an `enabled.txt`, so it should load automatically
   — no need to edit `mods.txt` by hand.
3. Launch the game normally through Steam and join the server as usual.

## What to check

1. **Does the panel show up at all**, top-left corner, once you're
   spawned?
2. **Does it stay visible while actually playing**, not just when
   alt-tabbed — try this in both Fullscreen and Borderless Windowed if
   you can, since testing Fullscreen specifically is the whole point of
   this phase.
3. **Do the numbers look right** — growth/health/stamina/hunger/thirst
   roughly matching what you'd expect? The exact property names this
   reads (`Growth`, `Health`, etc.) are an educated guess, not confirmed
   against this build.
4. **Anything that looks like an anti-cheat warning, kick, or ban.**
   Report this immediately regardless of anything else — it's the
   single most important thing this test exists to check.

## If stats show as "—" or blank

Open `ue4ss/UE4SS.log` (same log file the server-side diagnostic tooling
already reads) and search for `[LevelsOverlayClient]`. A line like:
```
[LevelsOverlayClient] Could not read pawn property 'Growth' — guessed name is likely wrong for this build.
```
tells us exactly which property name guess was wrong — send me that log
output and I'll fix the property name in one pass instead of guessing
again blind.
