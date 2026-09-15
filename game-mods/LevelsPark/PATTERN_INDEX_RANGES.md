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
