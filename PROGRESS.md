# Progress

What exists, decisions made, and known issues. Newest at the bottom.

### Origins (2026-10-03 → 2026-10-09)
The painter began in 2026-10-03 as "GBPaint", a companion tool inside the author's earlier, private map-editor project (also
called GB Cartographer, now archived) and moved into this repo with a fresh history on 2026-10-09, taking the name with it, keeping only what it needs: the painter (`src/`), the theme and logo (`src/ui/`, with
only the rules the painter uses extracted from the old stylesheet), the GB Studio format helpers (`src/gb/`), the
server layer (`server/`) and the Electron shell (`electron/`). Nothing from any game project came along.

### What it does
- **Pictures**: one byte per pixel, GB shade 0–3 or see-through (`src/paint.ts`). Opening a PNG snaps colours a hair
  off the GB greens (within 24 per channel) to the exact shades, keeps tiles of up to four other colours as
  palettes of the file, and snaps anything else by brightness; the counts are reported once. Save writes a flat
  PNG in the four greens; sprite sheets get key green (`#65FF00`) for see-through pixels.
- **Tools**: pencil, eraser, spray, line, rectangle (outline / filled), ellipse, fill, flood erase, eyedropper,
  palette brush, select, move, pan; mirror painting; brush 1–16; undo (60 steps, ~96 MB cap); tabs; drag-and-drop;
  clipboard paste; a TILES counter against GB Studio's 192 / 384 budgets; 8 / 16 px grid; snap to tiles.
- **GB Studio project** (`server/endpoints.ts`, `server/assets.ts`): list backgrounds, sprites, tilesets and
  palettes; open a PNG with its per-cell palette slots (a background's `tileColors`; a sprite's slices'
  `paletteIndex`, the last frame using a slice wins, -1 where no slice is) and the eight palette ids they mean (the
  scene's background palettes, or the project's sprite palettes, with the first overriding scene's actors
  considered); write a PNG back (same size, backup, 409 on a changed file); write palette slots back (background:
  only the low three bits of each cell's attribute change; sprite: `paletteIndex` on every frame tile using a
  painted slice; sidecars rewritten as GB Studio writes them, two-space JSON, no trailing newline).
- **Project panel**: Backgrounds · Sprites · Tilesets with counts, a name filter, lazy thumbnails; the open
  picture's row outlined; the picked project's eight palettes lead the palette list with slot tags.
- **Themes and fonts** (`src/ui/theme.ts`): OLED Game Boy green (the only one offered for now; Slate, OLED orange / green and Shuffle stay in the code), and and palette
  themes DMG, Pocket, Berry computed from four colours; fonts JetBrains Mono, Public Pixel (8 px steps), OpenDyslexic.

### Decisions
- Palettes on a plain PNG are for looking only; Save writes greens. On a project picture they are real: Save
  writes them into the sidecar as slots. "None" leaves a tile's slot alone; so does a palette outside the eight.
- Only cells whose slot changed since opening are written (`asset.opened`): a sprite slice shown in several
  palettes across frames (a flash) keeps them unless painted.
- Only `paletteIndex` is written for sprites; the older `palette` field is not what GB Studio reads and is left alone.
- GB Studio 4 layout only (a folder with `assets/` and `project/`; sidecar `.png.gbsres` files).

### Demo project, fonts, palette manager (2026-10-09)
- `demo/`: a GB Studio 4 project built from the Wintery Pixel Art Pack (CC0, Spencer "Raptorspank" Gerowe) and
  pictures from the GB Studio Community Assets repo (MIT; GumpyFunction, yoanqwp, krümel, Paige Ashlynn, Anima,
  Santiago Crespo, KizulEmeraldfire), credited in `demo/CREDITS.md`, with the author's DWC palettes (30) and a WIN set (8 + a sprite palette)
  made for the winter scene, whose tiles are dressed in it (snow / pine / wood by each tile's shades) as the
  project palettes. Four sprites had pure black / one brown normalized to the GB dark green. The app opens a
  copy of it (`demoProjectCopy`: `<data folder>/demo-project`, made once) from the start screen or the project
  panel. Fonts (`assets/fonts`) are a fourth asset kind.
- Palette manager (`src/PaletteManager.tsx`, header button Palettes): collections Project · Mine · Game Boy ·
  Chorbi (`src/palettes/library.json`, 233 palettes), filter, name and four colors with hex fields, a preview of
  the open picture in the palette, Add to project (new `project/palettes/<name>.gbsres`, numbered when taken),
  Save into project (rewrite by id, other fields kept, backup first), Copy to Mine, Mine's Save / Delete, Use for
  the palette brush. Open pictures whose copy of an edited palette was unchanged take the new colors.

### Layout A, start screen, frames (2026-10-09, evening)
- One theme, OLED Game Boy green: the accent is the Game Boy's mid green (`#86c06c`, lit `#9bd07e`, shaded `#6aae58`, dark text `#071821` on it; the deep green `#306850` is `--acc-deep`) on every active state. It began as mauve, then maroon; the author found pink too GB Studio and asked for the two Game Boy greens on 2026-10-09. Layout A from the mockups:
  one toolbar row, a kind rail with counts, the thumbnail list, the inspector as a shades row plus Palettes /
  Picture tabs with the scene's eight slots as a strip, short tool hints in the status bar, the long text and
  all keys behind a ? help panel. Tint, tile budget and Font live in the Picture tab.
- Start screen (served, no project): the author's icon, three cards (project, demo, PNGs) and Recent (the last
  six project folders, kept in the settings file, served by ping).
- Palette manager restyled: a collection rail with counts, the list grouped into "Scene slots" and "Others in
  the project", bigger color wells, Duplicate / Copy to Mine in the title row, one action row with the write
  note (which file is added or rewritten).
- Frames strip: a sprite sheet's animations (every state's, from the sidecar) with frame thumbnails drawn from
  the sheet (flips honored), play at 8 frames a second, the current frame's 8 × 16 slices outlined on the sheet.
- Mockups and review captures live in `review/` (gitignored); `review/shoot.cjs` renders a page offscreen at 2×.

- Thumbnails come from `gbstudio-asset-preview`: the PNG decoded on the server, read like the app reads it
  (`quantize`, `assignSlots`), and colored the way GB Studio shows it (sprites through colors 1–3, key green
  see-through), encoded with the app's own PNG codec and cached by file time.
- Fonts: a sample sentence (editable) drawn with the sheet's 8 × 8 glyphs (ASCII from 32, 16 a row), live.
- Save (Ctrl+S) saves every changed picture that has somewhere to go; the active one is asked where if it has
  none. Export copy stays per picture. The accent is `#c489ab`, a notch more saturated.
- The demo's three backgrounds carry the author's tile colors (saved in the app, baked into `demo/`).

- Shade squares edit colors: clicking the selected square again opens a color picker for that position of the
  picked palette (or of the tint, which becomes Custom). Project palettes recolored this way are written back on
  Save (`editedProjectPalettes` → the palette endpoint) or with the sidebar's Save to project; Revert returns to the
  project's colors. Before any project JSON write, `gbstudio-running` (a process list check) can trigger a
  once-per-session warning: GB Studio keeps the project in memory and writes it back when it saves.

- The UI font is Inter (JetBrains Mono, Public Pixel and OpenDyslexic are options); tools sit in two compact
  columns; grays are much lighter. `npm run screenshot` (headless Edge or Chrome over the DevTools protocol)
  makes `docs/screenshot.png`; Electron-based capture crashes on this machine.

- Soft cards (the author's pick of three mockups, `review/ui-round3`): panels are rounded cards with gaps, controls are
  rounded layers of gray with a lit accent, tabs and segmented groups are pills, the start screen, frames strip and
  palette manager follow. It is the last block of `src/paint.css`, built on the `--b-*` surface variables and the
  `--acc*` accent variables from `src/ui/theme.css`.
- Screenshot scripts must never remove `.gbp-toast` by hand (React then crashes on unmount and the page paints
  black): hide it with `visibility` instead.

- The picture selector is a two-column grid of thumbnail cards (preview on a checkerboard, name and size under
  it). A sprite's preview is its first frame put together from its slices. Thumbnail URLs carry `pv`
  (`PREVIEW_VERSION`) so a change to the previews refreshes cached images. Right-click a card for Open, Show in
  Finder / Explorer (`POST /__cartographer/reveal`, the asset or the project folder), Copy file path.

- Project menu on the GB Cartographer name at the top left (it works on the start screen, where it lists open and recent): Open another project…, the demo, recent projects, Show in
  Finder, Close project (back to the start screen). Switching or closing first asks to save unsaved pictures of the
  current project (`readyToLeaveProject`), then closes that project's tabs (`closeDocsOf`). Each project picture
  records its project folder (`asset.project`) and Save refuses to write it into another project.

- Tilesets have tile colors like backgrounds: GB Studio 4's tileset sidecar has a `tileColors` field (same encoding).
  A tileset belongs to no scene, so its slots are the project's default background palettes. Pictures restored from
  an older session learn their slots when the project loads.
- Unsaved pictures: italic name with a trailing `*` (tabs, cards, window title).
- The demo's credited files are named `<Name> (<Author>).png` (ASCII in file names, the sidecar `name` keeps "krümel").
  The demo generator lives outside the repo; the demo is edited by hand from here on.

### Known issues
- Inter and JetBrains Mono load from Google Fonts: offline, the app falls back to the system font.
- GB Studio's animation speed is not read yet: the frames strip plays at a fixed 8 fps.
- A PNG drawn in colours that are not the GB greens (some teams draw sprites in real colours) is kept as palettes
  of the file and saved as greens in brightness order, which may not match GB Studio's own colour conversion.
  The open message warns for project pictures. Matching GB Studio's rule exactly is the next correctness step.
- The thumbnails fetch one PNG each (lazily); a project with a thousand assets will show them as it scrolls.
- No signed builds yet; `npm run install-mac-app` / `install-shortcut` only point an Electron at this checkout.
