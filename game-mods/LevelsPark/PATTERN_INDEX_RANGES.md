# Skin PatternIndex — per-species valid ranges

Why this file exists: `PatternIndex` (the Skin Library's "Pattern Index"
field) is strictly validated by the game client against each species' own
pattern table. There is no official published table, and an out-of-range
value doesn't just fail to change the pattern — it silently drops the
**entire** skin apply, colors included, with no error anywhere. See
`scripts/main.lua`'s `applyCustomizer` for the code-side detail, and
https://github.com/diplomatic-tendencies/evrima-dev-knowledge's
`EVRIMA_Customizer_Field_Map.md` for the underlying mechanism.

The only reliable way to learn a species' real range is to check in-game:
open that species' in-game Character Creator and count how many pattern
thumbnails it shows — valid `PatternIndex` is `0` through `(count − 1)`.
The Skin Library's **"Test on my live dino"** button is the other way:
spawn as the species, try `0, 1, 2, 3…` in Pattern Index until colors
stop showing up on a test apply — the last value that still rendered is
the top of that species' range.

Fill this in as each species gets checked. Until a species has a
confirmed row here, treat any value above 0 as a guess that might
silently blank the whole skin.

| Species | Confirmed valid range | Checked by | Date |
|---|---|---|---|
| Tyrannosaurus | 0–2 (3 patterns) | — | — |
| | | | |

Add a row per species as it's verified. Once most/all of the current
22-species roster (see `main.lua`'s `KNOWN_SPECIES`) has a confirmed row,
`applyCustomizer`'s current flat 0–9 sanity check can be tightened to a
real per-species table, so a bad guess gets rejected with a clear log
line instead of silently eating the whole skin.

## A promising lead: nerfofficial.org's Skin Creator

A third-party (not affiliated with this project) Isle Evrima skin tool at
nerfofficial.org/skins renders the actual in-game species models with a
"PATTERN STYLE" slider, and its exported skin code is a base64 JSON blob
containing `"pattern": "<n>"` and `"patternVariation": "<n>"` — the exact
same two concepts as our `PatternIndex`/`SkinVariation`, just named
lowercase. 2026-09-17 screenshots from that tool showed multiple
different pattern numbers all rendering distinct, non-broken patterns
for Allosaurus, Stegosaurus, Tyrannosaurus, and Triceratops — real
evidence that several species do have more than one usable pattern
(matching what this file already suspected but lacked confirmed
examples for beyond Rex).

**Caveat before trusting it as a source for the table above:** it's
unconfirmed whether that tool's displayed "PATTERN STYLE: 3" is the same
raw index as our `PatternIndex: 3`, or off by one the way the real
in-game Character Creator's displayed option N maps to index N−1 (see
this file's intro). Worth cross-referencing next time someone verifies a
species via "Test on my live dino" — if a value that works there lines
up with what that tool showed for the same species, that confirms the
mapping and this becomes a much faster way to pre-scout likely-good
values before verifying in-game, instead of blindly trying 0, 1, 2, 3…
