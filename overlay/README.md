# LeveLs Desktop Overlay — Phase 0

Proof of concept only. One fixed-position, fixed-size, always-on-top
window showing Live Dino for a single hardcoded Steam ID, permanently
click-through, no drag/resize, no real auth. The only thing this phase
exists to answer: **does an Electron always-on-top transparent window
actually sit cleanly over Evrima in practice?** Everything else (the Map
widget, pairing-code auth, edit mode, packaging/distribution) is a later
phase — see the design memo for the full plan, and don't build those
until this is confirmed working live.

## Setup

Requires [Node.js](https://nodejs.org) and **must run on the Windows
machine you actually play Evrima on** — the parts this phase needs to
test (always-on-top over a fullscreen game, kernel-level EAC coexisting
with a separate overlay process) are Windows-specific and can't be
verified any other way.

```
cd overlay
npm install
```

Then open `main.js` and replace `TEST_STEAM_ID` with a real steamId64 —
whoever's actually going to be spawned in-game while you test.

```
npm start
```

A small card should appear in the top-left corner of your screen, about
1/10 the size of it, showing that player's live growth/health/stamina/
hunger/thirst once they're spawned in-game. It polls the live site every
2 seconds, same as the website's own Live Dino tab.

## What to actually check

1. **Does it show up over the game at all?** Launch Evrima in **Borderless
   Windowed** mode first, not true Fullscreen Exclusive — this is a known
   limitation of every overlay technique (Discord's included), not
   specific to this one. If it doesn't appear even in Borderless
   Windowed, that's the real finding to report back.
2. **Does anything about EAC complain?** Watch for anything unusual —
   a ban, a warning, the game refusing to launch with the overlay
   running. (Not expected, per the design memo's reasoning — this is a
   separate window the OS draws on top of the game, not anything
   injected into it — but this phase exists specifically to confirm that
   in practice, not just in theory.)
3. **Does the data update correctly** as the test account's dino's stats
   change in-game (take damage, get hungry, etc.)?
4. **Visual check** — is the card actually legible over typical in-game
   backgrounds (grass, water, sky), or does the semi-transparent
   background need to be more opaque?

## Known limitations (expected, not bugs)

- Fixed top-left position, fixed size — no dragging or resizing yet
  (Phase 2).
- One hardcoded Steam ID, edited directly in `main.js` — no login, no
  pairing code yet (Phase 1).
- No Map widget yet — Live Dino only (Phase 1).
- Click-through is permanent — there's no edit-mode hotkey yet to toggle
  it (Phase 2).
- Not packaged as an installer — runs via `npm start` from source only
  (Phase 3).
