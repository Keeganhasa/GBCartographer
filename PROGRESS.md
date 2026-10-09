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
- **Themes and fonts** (`src/ui/theme.ts`): Slate (default), OLED orange / mauve / green, Shuffle, and palette
  themes DMG, Pocket, Berry computed from four colours; fonts JetBrains Mono, Public Pixel (8 px steps), OpenDyslexic.

### Decisions
- Palettes on a plain PNG are for looking only; Save writes greens. On a project picture they are real: Save
  writes them into the sidecar as slots. "None" leaves a tile's slot alone; so does a palette outside the eight.
- Only cells whose slot changed since opening are written (`asset.opened`): a sprite slice shown in several
  palettes across frames (a flash) keeps them unless painted.
- Only `paletteIndex` is written for sprites; the older `palette` field is not what GB Studio reads and is left alone.
- GB Studio 4 layout only (a folder with `assets/` and `project/`; sidecar `.png.gbsres` files).

### Known issues
- A PNG drawn in colours that are not the GB greens (some teams draw sprites in real colours) is kept as palettes
  of the file and saved as greens in brightness order, which may not match GB Studio's own colour conversion.
  The open message warns for project pictures. Matching GB Studio's rule exactly is the next correctness step.
- The thumbnails fetch one PNG each (lazily); a project with a thousand assets will show them as it scrolls.
- No signed builds yet; `npm run install-mac-app` / `install-shortcut` only point an Electron at this checkout.
