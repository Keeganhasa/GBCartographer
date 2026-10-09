# To do

Release checklist for GB Cartographer, roughly in order. Tick things off as they land; move finished items
into PROGRESS.md when they deserve a note.

## In progress (2026-10-09)

- [x] **Demo project** in `demo/`: the Wintery Pixel Art Pack (CC0) and community assets (MIT) with credits in
      `demo/CREDITS.md`; the author's Chorbi palettes as the project palettes.
- [x] **Open the demo** from the app: a button when no project is open; it opens a copy in the app's data folder
      so edits never touch the repo's copy.
- [x] **Fonts** as a fourth asset kind (`assets/fonts`, PNG + `.png.gbsres`), open and save like tilesets.
- [x] **Palette manager**: a window listing the project's palettes and a bundled library (Chorbi, Game Boy
      classics); edit colors and names; new palettes; add a palette to the project (writes
      `project/palettes/<name>.gbsres`); update a project palette's colors.
- [ ] Palette manager, round 2: delete a project palette (with a check that no scene uses it), reorder,
      import/export a palette set as JSON, keyboard navigation in the list.
- [x] README: credits for the demo assets and a line about the demo.

## UI pass (asked 2026-10-09)

- [x] One theme for now: OLED Game Boy green (mauve, then maroon, then the two Game Boy greens: pink felt too GB Studio).
      Other themes stay unlisted in theme.ts.
- [x] Hover is the Game Boy's dark green (`#306850`, light-green text) on buttons, tools, icon buttons, segmented
      groups and tabs; toggled-on buttons brighten on hover instead of going dark.
- [x] The picture selector is a grid of thumbnail cards; sprite cards show their first frame, not the whole strip.
- [x] Right-click a card: Open, Show in Finder / Explorer, Copy file path, Show project folder.
- [x] Open project accepts the .gbsproj file or its folder (macOS greyed out Open inside a folder in folder-only mode).
- [x] Soft cards restyle of every control, border and panel (picked from three mockups); the start screen, frames
      strip and palette manager follow it.
- [x] Layout A (chosen from three mockups in `review/mockups-2026-10-09`): one toolbar row with grouped buttons,
      a kind rail with counts, the thumbnail list, the inspector as a shades row + Palettes / Picture tabs, the
      scene's eight palette slots as a strip at the top of Palettes (borrowed from mockup B), short tool hints in
      the status bar, the long text and all keys behind a ? help panel. Tint, tile budget and Font moved to Picture.
- [x] Rooms: decided against for now (three jobs, not nine; the modal and the panel cover them).
- [x] Round 2 (mockups in `review/mockups-2026-10-09/round2-*`, all built): a start screen with three cards and a
      Recent list (the last six project folders, kept in the settings file); the palette manager restyled with a
      collection rail, a list grouped into the scene's slots and the rest, bigger wells and one action row; a
      frames strip above a sprite sheet (every animation's frames, thumbnails, play at 8 fps, the current frame's
      slices outlined on the sheet).
- [x] Palette brush: [ ] set it to 1, 2 × 2 or 3 × 3 tiles; Shift-click draws a straight line of tiles; I picks a tile's palette.
- [x] Bake the author's tile colors into the demo (cabin, forest, winter), from the saved copy.
- [x] Thumbnails show each picture in its palettes (a server-rendered preview PNG, cached by file time).
- [x] Fonts: a live sample sentence set in the sheet's glyphs above the picture, editable.
- [x] Save writes every changed picture, not only the active one (Export copy stays per picture).
- [x] Shade squares: click the selected one again to change that color (the picked palette's, or the tint's).
- [x] Palette colors edited in the sidebar go into the GB Studio project on Save (and a Save to project button);
      a once-per-session warning when GB Studio looks open, since it writes the project back when it saves.
- [x] The inspector no longer clips sideways: rows shrink, names ellipsize.
- [x] UI font is Inter (JetBrains Mono, Public Pixel and OpenDyslexic stay as options); the saved-font key was bumped.
- [x] Tools in a compact two-column palette that never scrolls; the grays are much lighter (text, icons, borders,
      control fills) so everything is easier to see on the black.
- [x] README screenshot retaken (maroon, Inter, the demo's winter scene); `npm run screenshot` makes it.
- [ ] Bundle Inter and JetBrains Mono with the app (both OFL) so it works offline; they load from Google Fonts for
      now. Needs the font files downloaded and their licenses shipped.
- [x] Hint line: gone; one clause per tool in the status bar, the full text behind ?.

## Before anyone else runs it

- [ ] **Colour conversion like GB Studio.** A PNG drawn in colours that are not the four greens is saved as
      greens in brightness order, which may not match GB Studio's own rule (seen on a sprite sheet drawn in
      real colours). Read GB Studio's source for its thresholds and match them on open. Until then the open
      message warns.
- [ ] **Windows pass.** Open, paint, save, tile colours and sprite palettes on the Windows PC (paths, the
      sidecar rewrite, the folder dialog, `npm run install-shortcut`).
- [ ] **About box** with the version and the licenses (code MIT, logo CC0, fonts).
- [ ] **No-project first run.** Check the empty state reads well on a fresh machine: open a project, or open PNGs.

## Publishing the code

- [ ] Rename the archived private repo on GitHub (`gh repo rename GBCartographer-archive --repo Keeganhasa/GBCartographer`)
      so the name is free, then `gh repo create Keeganhasa/GBCartographer --public --source . --push`.
- [ ] README: a short GIF of painting and saving (a screenshot is in).
- [ ] Repo settings: description, topics (gbstudio, game-boy, pixel-art, electron), issues on, discussions off for now.
- [ ] Tag `v0.1.0` once the builds below exist.

## Builds

- [ ] **electron-builder**: macOS dmg + zip (universal), Windows installer + portable zip, Linux AppImage.
      Icons from `build/icon.png` (the script already writes it). App id `io.github.keeganhasa.gbcartographer`.
      Ship `demo/` as an extra resource and point the demo opener at it in packaged builds.
- [ ] **GitHub Actions** on a version tag: build the three platforms, attach to a GitHub Release.
- [ ] Decide on signing: unsigned at first (document the right-click-Open / SmartScreen steps), or an Apple
      Developer account for notarization later.
- [ ] Settings and backups live in the app's data folder; say where in the README (macOS, Windows, Linux paths).

## itch.io

- [ ] Page title that owns the search: "GB Cartographer for GB Studio" (plain "GBPaint"/"GB Paint" is taken by
      two free toys and an old assembly project).
- [ ] Pay what you want with a minimum; builds uploaded with butler (channels mac / windows / linux).
- [ ] Screenshots: the project panel with a background open, the palette brush on a sprite sheet, a theme or two.
- [ ] The page states the same "what it writes into your project" list as the README.

## Nice to have

- [ ] GB Studio 3 projects (everything in one `.gbsproj`): read-only support, or a clear "not supported" message.
- [ ] A "reveal in Finder / Explorer" for the backups folder (pictures have it on right-click).
- [ ] Thumbnails for very large projects: a cached contact sheet instead of one request per PNG.
- [ ] Keyboard: next / previous tab, close tab.
- [ ] Reload a picture from disk when GB Studio changed it (watch the file, offer to reload).
