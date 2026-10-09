# GBPaint specification

A precise description of the app, kept in step with the code. Section numbers follow the old numbering only loosely.

## 1 Purpose

GBPaint is a small app: a painter for **Game Boy PNGs** (exported backgrounds, or any picture in the four greens) and for the **pictures inside a GB Studio project** (its backgrounds, sprite sheets and tilesets). It is for touch-ups. It knows nothing about tilesets, stamps or layers: each open file is one flat picture. Of a GB Studio project it knows only where the pictures and palettes live (the GB Studio project section below).

## 2 Starting it

- Desktop: `npm run desktop` builds the page and opens it in an Electron window titled "GBPaint", served from a local server on the fixed port **62933** (so browser storage persists between launches; a random port when it is busy).
- Browser: the page on the development server (`npm run dev`).
- Theme and font are chosen in its header (Slate, OLED orange / mauve / green, Shuffle, DMG, Pocket, Berry; JetBrains Mono, Public Pixel, OpenDyslexic) and remembered per browser. Its browser tab title is "GBPaint", or "• name · GBPaint" with a bullet while the picture has unsaved changes.
- It has no system-menu integration of its own.

## 3 The picture model

- A picture is one value per pixel: shade 1–4 (lightest to darkest) or see-through.
- The four Game Boy greens are `#E0F8CF`, `#86C06C`, `#306850`, `#071821`.
- Each 8 × 8 tile may additionally "wear" one palette (or none). Palettes are **for looking only**.
- Reading a PNG:
  1. Pixels less than half opaque become see-through; the picture then "has see-through pixels". A sprite sheet opened from a GB Studio project also treats GB Studio's key green `#65FF00` as see-through, and writes it back as that green.
  2. A colour within 24 per channel of a green counts as that green (the count of such colours is reported once), so art that is a hair off still reads as plain shades. A tile made only of the four greens maps exactly and wears no palette.
  3. A tile drawn entirely in the colours of one library palette wears that palette; its pixels become positions in it.
  4. A tile of up to four other colours gets a palette made from those colours, named "File 1", "File 2" … (lightest first, the last colour repeated to make four), added after the library's; tiles with more colours are handled first so simpler tiles can share. At most 64 such palettes.
  5. Any remaining colour snaps to the green nearest in brightness, and the count of such colours is reported.
- The library is the open GB Studio project's palettes (none without a project); only palettes with exactly four colours are used. It is loaded before any picture is read. A background opened from the project has each tile dressed in the palette its scene gives it (the sidecar's `tileColors`, low three bits = slot, through the first scene that shows the background, else the project's default palettes).

Guarantees fixed by the tests:

1. A picture in the four greens (with or without see-through pixels) reads and writes back unchanged.
2. Unknown colours snap by brightness: white, light grey, dark grey, black map to shades 1–4; a pure red maps to the third shade.
3. A tile of up to four unknown colours is kept as a "File n" palette and can be reproduced exactly when written with palettes.
4. A tile in a library palette's colours is recognised as wearing it and round-trips; the palette keeps its GB Studio id through cloning.
4a. Key green reads as see-through only when asked (a sprite sheet) and is written back as key green; near greens (`#071923`, `#E5F9D7`) read as the exact shades and write back exact.
4b. Tile colours dress cells through the scene's slots by palette id; a slot whose palette is unknown leaves the cell plain; cells beyond the data are left alone.
5. Brush marks, lines and mirrored points stay inside the picture; a 2 px brush at the corner paints only the pixel that exists.
6. Flood fill changes one connected area only and reports "nothing to do" when the area already has that shade.
7. An ellipse stays inside its box and is closed.
8. Lifting a piece leaves the blank shade behind; dropping it elsewhere clips at the edges and its see-through pixels leave the picture alone.
9. Rectangles snap outward to whole 8 px tiles and clip to the picture.
10. Unique tiles are counted as GB Studio does: identical tiles are one; mirror images merge only in the flip-merging mode; partial edge tiles count as padded with see-through.

## 4 Layout

Top to bottom, full window:

1. **Header bar** (wraps when narrow; 6 px gaps, 6 × 10 px padding, hairline below):
   - the logo at 22 px and "GBPaint" in bold 14 px;
   - quiet buttons **Open**, **Save**, **Export copy** (30 px tall, icon + word);
   - icon buttons Undo and Redo (30 × 30);
   - a flexible gap;
   - the **TILES counter**: a bordered box reading "TILES", a 140 × 8 px bar, "127/384", and a dropdown for the budget: "Color Only · 384" (flipped tiles merge) or "GB / Color + Mono · 192". Label and bar are green `#7fc27a`; over budget, label, bar and count turn red `#e0605a`. The count trails painting by about 150 ms. Shown only with a picture open;
   - **Tile grid** button: cycles off → 8 px → 16 px, showing the size as a tiny number in its corner; **on at 8 px by default**; highlighted while on;
   - **Snap** button (magnet): selections and moves snap to 8 px tiles;
   - Zoom: −, the percentage, +;
   - **Tint** dropdown: "GB greens", "Gray", "Pocket", then the library palettes, then "Custom" (which shows four colour wells). The tint only changes how tiles without a palette look while painting.
2. **Picture tabs**: one tab per open picture (a bullet before the name when unsaved; tooltip with the size in px), each with a small ×, and a "+" at the end that opens files.
3. **Hint line**: one line, 11 px, muted, cut with "…": the current tool's instruction, or with nothing open "Open one or more exported map PNGs to touch them up. Each stays one flat picture."
4. **Body**, three parts:
   - **Tool column** at the left (32 × 32 tool buttons stacked vertically, 3 px apart; the active one filled), then the Mirror button, then the brush-size stepper (−, the number, +).
   - **Canvas** in the middle: a scrolling area on the neutral asset backdrop; the picture centred with 32 px margin, on a grey checkerboard (`#8a8f98` / `#747983`, 16 px squares) that shows through see-through pixels, with a 1 px black outline and a soft shadow. Over it: the tile grid (light lines blended by difference so they read on any colour; hidden when a grid cell would be under 3 screen pixels), the selection outline (dashed white with a black edge; accent-coloured while a piece is floating), and a brush outline that follows the pointer (brush-sized, or one 8 × 8 tile for the palette brush; hidden for Select, Move and Pan). With nothing open: a 56 px logo, "Drop PNG files here, or" and an "Open PNG files" button.
   - **Side panel** at the right, 220 px: heading "SHADES" with four swatches (showing the picked palette's colours, or the tint), each with its key number; a "Transparent" swatch (key 0) only for pictures that have see-through pixels; heading "PALETTES" with the note "For the palette brush (P): each 8 × 8 tile wears one palette, or none. Only for looking: saving always writes the GB greens."; a list starting with "None (GB greens)" then this picture's palettes, each a row of four small colour chips and a name, the picked one outlined in accent. Picking a palette other than None switches to the palette brush. Below, for the picked palette, "<name> in this picture": four colour wells and buttons **Copy values**, **Paste values**, **Back to default**.
5. **Status line**: at the left "x, y · tile tx, ty" under the pointer; at the right the selection ("Selection 16 × 8 at 24, 40") and the picture size ("320 × 144 px · 40 × 18 tiles").
6. **Messages**: a small box at the bottom centre, 40 px up, for 4 s ("Saved name.png", "name.png: 3 colors in tiles of more than four colors became the nearest shade.", "… could not be read as a picture.").

## 5 Tools and keys

| Tool | Key | Behaviour (the hint line shows this text) |
|---|---|---|
| Pencil | B | Drag to paint. Shift-click draws a straight line from the last point. Right-click picks a shade. |
| Eraser | E | Drag to erase to the lightest shade (see-through in a picture that has see-through pixels). |
| Spray can | S | Drag to scatter pixels (a few random pixels within twice the brush size, minimum radius 2). |
| Line | L | Drag from one end to the other. |
| Rectangle | R | Drag a box to outline it. |
| Filled rectangle | Shift+R | Drag a box to fill it. |
| Ellipse | O | Drag a box; the ellipse fills it (outline). |
| Flood fill | G | Click an area to fill it with the active shade. |
| Flood erase | Shift+G | Click an area to erase it. |
| Pick shade | I | Click a pixel to paint with its shade; the previous paint tool comes back by itself. |
| Palette brush | P | Pick a palette on the right, then drag over tiles to give it to them. Right-click picks a tile's palette. |
| Select | M | Drag a box; drag inside it to move (Alt copies). Arrows nudge, Delete clears, Esc drops it. |
| Move | V | Drag the selection, or the whole picture when nothing is selected (Alt copies). |
| Pan | H | Drag to pan. Space or the middle button pans with any tool. |

Other keys:

| Key | Action |
|---|---|
| 1 – 4 | Pick shade 1–4 |
| 0 | See-through (only in pictures that have see-through pixels) |
| [ and ] | Brush smaller / bigger (1–16 px, square) |
| Shift+M | Cycle mirror: off → left-right → up-down → both (painting both halves across the picture's middle) |
| Arrow keys | Nudge the selection 1 px (8 px with Shift or with Snap on) |
| Delete / Backspace | Clear the selection to the blank shade (or discard a floating piece) |
| Escape | Drop the floating piece where it is and deselect |
| Ctrl+A | Select the whole picture (switches to Select) |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / cut / paste. Paste lands as a floating piece at the top-left of the visible area, aligned to a tile, and switches to Select. If nothing was copied inside GBPaint, pasting an image from the system clipboard opens it as a new picture. |
| Ctrl+Z · Ctrl+Shift+Z or Ctrl+Y | Undo · redo |
| Ctrl+O | Open files |
| Ctrl+S | Save |
| Ctrl+E or Ctrl+Shift+S | Export copy |
| Ctrl+= / Ctrl+− | Zoom in / out |
| Wheel · Shift+wheel · Ctrl+wheel or pinch | Scroll · scroll sideways · zoom around the pointer |
| Space + drag, middle-drag | Pan |
| Right-click | Pick the shade under the pointer (or, with the palette brush, the tile's palette); no menu appears |

Keys are ignored while a field, dropdown or text box has focus. Switching to any tool other than Select, Move or Pan drops a floating piece into the picture.

Zoom steps: 50, 100, 200, 300, 400, 600, 800, 1200, 1600, 2400, 3200, 4800 %. A newly opened picture takes the largest step that fits the canvas with a 32 px margin. Each picture keeps its own zoom.

## 6 Opening and saving

- **Open**: the system file picker (several PNGs at once), dropping files on the window, the "+" tab, or pasting an image. Each file becomes a tab; the last one opened becomes active. A file that cannot be read is named in a message and skipped.
- **Save** (Ctrl+S): flattens any floating piece and writes **one flat PNG in the four Game Boy greens** (see-through pixels stay see-through). Tile palettes and the tint are never written: they are only for looking (author's decision). Where the app holds write access to the opened file it writes over it; otherwise it asks where to save; where the browser has no file access it downloads the PNG under the picture's name. A successful save clears the unsaved bullet and reports "Saved …" or "Downloaded …".
- **Export copy** (Ctrl+E): the same flat PNG to a place the user picks; the open picture stays tied to its original file and keeps its unsaved state (unless it had no file yet, in which case the copy becomes its file).
- **Closing a tab** with unsaved changes asks "Close name without saving?".
- **Session**: open pictures (pixels, tile palettes, per-picture palette colours, zoom, unsaved state, file access) are remembered in the browser's local database about 0.8 s after each change and when the window closes, and come back at the next launch. Undo history, the selection and a floating piece do not (a floating piece is flattened into what is stored).
- Grid choice, tile budget, tint and custom tint colours are remembered per browser, as are whether the project panel is open and which asset folder it shows.
- A picture opened from a GB Studio project (the GB Studio project section below) saves back into the project with Ctrl+S; Export copy still asks where.

## 7 Palette editing per picture

- Each picture has its own copy of the library palettes plus any "File n" palettes it brought.
- The four colour wells recolour the picked palette **in this picture only**; the library is unchanged.
- "Copy values" remembers the four colours; "Paste values" puts them on the picked palette, in this tab or another; "Back to default" restores the library's colours (disabled for "File n" palettes and when unchanged).

## 8 Limits

- PNG only. One flat picture per file: no layers, tilesets, stamps or maps.
- Saved files are always in the four greens; colour is not exported.
- Palette colour edits are not undoable. Undo covers pixels and which palette each tile wears: at most 60 steps per picture, fewer for very large pictures (history is capped at about 96 MB).
- A moved or pasted selection carries shades only, not the tiles' palettes.
- Brush is square, 1–16 px. Mirror is across the picture's centre only.
- The tile counter counts shades only (palettes do not make tiles differ).
- Erasing gives the lightest shade unless the picture already has see-through pixels; the see-through "colour" cannot be introduced into an opaque picture.
- A GB Studio asset keeps its size: the server refuses a picture of another size (sprite frames and scene sizes are indexed by position).

## 9 GB Studio project

The development server and the desktop app both answer the `/__gbpaint/*` endpoints. The project folder is chosen in the app: the desktop app shows a native folder dialog and remembers the choice in its settings file; the dev server asks for a typed path, or reads `GBPAINT_PROJECT` / `gbpaint.local.json`. A folder is a project when it has `assets/` and `project/` folders (GB Studio 4). Without a project the header shows **Open project…** and GBPaint is the file painter described above; on a plain static host (no endpoints) that button does not appear.

- **Endpoints** (read-only except the writes named):
  - *list*: the project's display name (from its `.gbsproj`, else the folder name), its path, every PNG under `assets/backgrounds`, `assets/sprites` and `assets/tilesets` (kind, file name, the sidecar's name, the PNG's size, modification time), and the palettes of `project/palettes` (id, name, four `#RRGGBB` colours, sorted by name).
  - *asset*: one PNG's bytes by kind and plain file name; *asset info*: its modification time, size, per-cell palette slots and the eight palette slot ids they refer to, plus the sidecar's modification time. For a background: the decoded tile colours and the scene's background palettes. For a sprite sheet: each 8 × 16 slice's `paletteIndex` on the two cells it covers (the last tile using a slice wins when frames disagree; -1 on cells no slice uses) and the sprite palettes: the first scene, by folder name, with an actor using the sheet that overrides sprite palettes, else the project's default sprite palettes. Empty for tilesets.
  - *write*: overwrite that PNG with the posted bytes. Refused (400) when the bytes are not a PNG or its size differs from the file on disk; refused (409, with the current time) when the file's modification time differs from the one the client opened, unless forced. Before writing, the old file is copied to the backups folder (`backups/gbstudio/<kind>/<file>` under the app's data folder, or the repo's `backups/` on the dev server) (one previous version); the write goes through a temporary file and rename. The sidecar `.gbsres` and every other project file are never written.
  - *tile colours*: POST, for a background, an array with one entry per cell: a slot 0–7, or null to leave that cell alone. The server reads the sidecar's current `tileColors` (missing cells count as 0, the array sized from the PNG), replaces only the low three bits of the named cells (priority and flip bits stay), encodes it as GB Studio does (`07!` for one cell, `0714+` for a run of 0x14 cells), and rewrites the sidecar as two-space JSON without a trailing newline with every other field untouched. Nothing is written when the result equals what is there. 400 when the background has no sidecar or an entry is out of range; 409 (with the sidecar's time) when the sidecar's modification time differs from the one the client opened with, unless forced; the old sidecar is copied to the backup folder first.
  - *tile colours* for a sprite sheet (same call, kind `sprites`): every slice whose top cell (or, failing that, bottom cell) has a slot gets that `paletteIndex` on every frame tile that uses the slice; the older `palette` field and everything else stay. Same 400 / 409 / backup / unchanged rules.
  - A file name must be a plain `*.png` name inside one of the three folders and must already exist: GBPaint never adds assets.
- **Project panel** (left of the tools, 232 px, toggled by a **Project** button in the header that appears only when a project is served): the project's name, three tabs with counts (Backgrounds · Sprites · Tilesets), a name filter, and the list of pictures, each with a lazily loaded 36 × 28 px thumbnail (checkerboard behind, pixelated), its name and its size. The open picture's row is outlined; other open ones are shaded; an unsaved one shows a bullet.
- **Opening** a row fetches the PNG and its info and opens it as a tab named after the asset (or shows the already open tab). Sprites read key green as see-through. Backgrounds with tile colours have their cells dressed (above). The status bar shows `assets/<kind>/<file>`.
- **Saving** a background also writes its tile palettes: every tile wearing one of the scene's eight palettes (matched by palette id) becomes that slot; tiles wearing "None" or a palette outside the scene keep the slot they have, and the count of the latter is reported. The sidebar note says so for backgrounds, and the scene's eight palettes are listed first with their slot number (1–8) as a small tag. The result is appended to the save message ("6 tile palettes written to GB Studio"); a 409 asks "The tile palettes of … changed in GB Studio since you opened it. Replace them with this picture's?". GB Studio shows the change when it next reads the project.
- **Sprite sheets** work the same way with the sprite palettes: the palette brush covers an 8 × 16 pair of cells (the outline shows it), a sprite palette dresses the shades with its colours 1–3 (colour 0 is see-through), and Save writes each painted slice's slot into the sidecar. Only cells whose slot differs from the one they were opened with are sent, so a slice that frames show in several palettes keeps them unless painted.
- **Saving** such a picture posts the flat PNG to the write endpoint with the modification time it was opened with; a 409 asks "… changed on disk since you opened it (GB Studio or another app saved it). Replace it with this picture?" and, on yes, forces the write. Success updates the stored time, clears the bullet, refreshes the row's thumbnail and reports "Saved … into the GB Studio project". The session remembers which asset a tab belongs to, so after a restart Save still writes to the project.
- **Palettes**: with a project served, the palette list is the project's palettes and gets a filter box when there are more than twelve (the picked palette always stays listed). The Tint dropdown lists them too.

---
