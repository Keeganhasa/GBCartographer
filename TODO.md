# To do

Release checklist for GB Cartographer, roughly in order. Tick things off as they land; move finished items
into PROGRESS.md when they deserve a note.

## Before anyone else runs it

- [ ] **Colour conversion like GB Studio.** A PNG drawn in colours that are not the four greens is saved as
      greens in brightness order, which may not match GB Studio's own rule (seen on a sprite sheet drawn in
      real colours). Read GB Studio's source for its thresholds and match them on open. Until then the open
      message warns.
- [ ] **Windows pass.** Open, paint, save, tile colours and sprite palettes on the Windows PC (paths, the
      sidecar rewrite, the folder dialog, `npm run install-shortcut`).
- [ ] **Public Pixel font file.** Put GGBotNet's `PublicPixel.ttf` (CC0) in `public/fonts/`; the Font menu
      already offers it. Keep its license text next to it.
- [ ] **About box** with the version and the licenses (code MIT, logo CC0, fonts).
- [ ] **No-project first run.** Check the empty state reads well on a fresh machine: open a project, or open PNGs.

## Publishing the code

- [ ] Rename the archived private repo on GitHub (`gh repo rename GBCartographer-archive --repo Keeganhasa/GBCartographer`)
      so the name is free, then `gh repo create Keeganhasa/GBCartographer --public --source . --push`.
- [ ] README: a screenshot or short GIF at the top; say "GB Studio 4 projects" plainly.
- [ ] Repo settings: description, topics (gbstudio, game-boy, pixel-art, electron), issues on, discussions off for now.
- [ ] Tag `v0.1.0` once the builds below exist.

## Builds

- [ ] **electron-builder**: macOS dmg + zip (universal), Windows installer + portable zip, Linux AppImage.
      Icons from `build/icon.png` (the script already writes it). App id `io.github.keeganhasa.gbcartographer`.
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
