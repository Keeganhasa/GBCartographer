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
- [ ] A "reveal in Finder / Explorer" for the open asset and for the backups folder.
- [ ] Thumbnails for very large projects: a cached contact sheet instead of one request per PNG.
- [ ] Keyboard: next / previous tab, close tab.
- [ ] Reload a picture from disk when GB Studio changed it (watch the file, offer to reload).
