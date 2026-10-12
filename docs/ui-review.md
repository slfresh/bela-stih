# UI review: what to improve, in what order

A read of `apps/mobile/src` as it stands (October 2026), screen by screen,
with the fixes it suggests. Recommendations only: nothing here is built yet.
The tests that pin today's markup are named with each item, because a visual
change is not done until they are re-pinned (`npx vitest run apps/mobile`).

The house rules every change must keep (`apps/mobile/test/design-tokens.test.ts`,
`contrast.test.ts`): colours come from `theme.ts` and `cosmetics.ts` (each file
has a ceiling on raw `rgba()`/`#hex` literals that may only go down; a new
file's is 0), no `fontSize` under 11, no `fontWeight` (the weight is the font
family), no typed symbols or emoji (icons are drawn in `ui/icons.tsx`), and
every ink/ground pair in every room passes WCAG contrast.

## P1 — usability and accessibility

1. **Touch targets under 44 dp.** The chip rows in Settings are about 36 dp
   tall (seven hand-built `PressScale` blocks, `screens/SettingsScreen.tsx`),
   the lobby's `Choice` chips the same (`net/OnlineGame.tsx`), and Home's gear
   and coin chip lean on `hitSlop`. Build one `ui/ChoiceChips.tsx` (min height
   44, `accessibilityRole="radio"`, tokens only) and use it in Settings, the
   lobby and the Profile's avatar picker. Re-pin: the lobby `label={…}` regexes
   in `test/review-phase2.test.ts`, the chip counts in `test/source-guards.test.ts`.
2. **Home's bottom row.** Three plain pills now (Rules / History / Stats)
   is the most it can hold. Next: an icon-and-label row, which needs a chart
   and a trophy icon in `ui/icons.tsx` (none exist). Keep the exact rules
   button markup (`test/review-phase2.test.ts`, `test/invite-history.test.ts`).
3. **Raw type sizes and 11 px captions.** Home, Profile, Shop, the lobby and
   `TableScreen.tsx` set `fontSize` by number. Route them through `type` in
   `theme.ts`, and raise captions that carry information (Home's quest lines,
   the history row's meta line) to 12–13.
4. **Widgets built three times.** Progress bars (Home `questTrack`, Profile
   `xpTrack`, the table's `ProfileBar`), text inputs (Home, Settings, Profile)
   and the big-number tile (Profile's headline; `ui/StatTile.tsx` now exists
   from the Stats screen). Extract `ProgressBar` and `TextField` beside it.

## P2 — coherence

5. **`ScreenShell`** (`screens/common.tsx`): a raw 20 px title and no
   right-hand action slot. Add a title token and an optional `right` node
   (History → Stats, Settings → Rules).
6. **Profile**: the win rate appears twice, and the lifetime numbers are a
   flat label/value list. A `StatTile` grid, once, with the duplicate gone.
7. **Rules**: a wall of body text. Collapsible panels (a chevron on the
   `Panel` label, animated under the motion policy in `anim/MotionHere.tsx`).
8. **Shop**: tiles at a fixed 122 dp height and 30.5% width break under large
   system fonts. A flex grid with a minimum width and intrinsic height.
9. **Lobby**: a raw 20 px status line, a copy chip too small to hit, and a QR
   `Modal` that animates outside the app's motion policy.
10. **DeckGallery**: hard-coded Croatian strings, and not on `ScreenShell`.

## P3 — polish

11. **Motion between screens** is one 180 ms `FadeIn` (`App.tsx`). Satellites
    could enter from the right and leave in reverse; lists (History, Stats,
    Shop) could stagger in; History loads synchronously and could show a
    skeleton. Exits stay forbidden (`test/source-guards.test.ts`: no `exiting=`).
12. **`TableScreen.tsx`** still carries nine colour literals; the ratchet lets
    them only go down.
13. **Store screenshots** (`apps/mobile/store/screens`) predate the join-by-code
    panel, the Stats screen and the bot-strength setting. Refresh them after
    the chip rework.
14. **Contrast**: re-run `test/contrast.test.ts` after any token change; it pins
    every pair in every room.
