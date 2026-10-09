# GB Cartographer

A small pixel painter for GB Studio 4 projects (Vite + React page, Electron desktop shell). Public, MIT.

- Read `PROGRESS.md` first: what exists, decisions, known issues. `docs/SPEC.md` describes the app precisely.
- Checks: `npm test` and `npm run build`. Dev server: `npm run dev` (port 5173; the Claude launch config uses it too). Desktop app: `npm run desktop`.
- The GB Studio project is chosen in the app (desktop folder dialog, or a typed path on the dev server) and remembered in the desktop app's `settings.json` or `cartographer.local.json` (gitignored). Never commit a GB Studio project or anything from one.
- What GB Cartographer writes into a project, and nothing else: asset PNGs (same size; backgrounds, sprites, tilesets, fonts), a background sidecar's `tileColors`, a sprite sidecar's slices' `paletteIndex`, and palette files in `project/palettes/` (new, or name and colors of an existing one, by id). Old files are copied to the backups folder first; a changed-on-disk file needs a confirm (409 → force). Keep it that way: `server/assets.ts` holds the writes, `server/endpoints.ts` the routes (`/__cartographer/*`, same origin only).
- Everything in the repo must be MIT or CC0 and the author's own. No art, palettes, fonts or data from any game project. Fonts: JetBrains Mono (Google Fonts), OpenDyslexic (jsDelivr, fetched on demand), Public Pixel (CC0, `public/fonts/PublicPixel.woff2` with its license beside it).
- `src/paint.ts` is the pixel model (one byte per pixel, GB shade 0–3 or CLEAR); `src/PaintApp.tsx` the whole UI; `src/ui/` theme, logo, wheel zoom; `src/gb/` GB Studio formats and PNG.
- The palette brush covers 8 × 8 cells on backgrounds and 8 × 16 pairs on sprite sheets; sprite palettes draw colors 1–3 on the shades (color 0 is see-through). Only cells whose slot changed since opening are written (`asset.opened`), so palette-cycling frames keep their palettes.
- `demo/` is a GB Studio 4 sample project with CC0 / MIT art credited in `demo/CREDITS.md`; the app opens a copy of it (`demoProjectCopy`). Only add art with a verified license and a named author; never machine-generated art.
- The palette manager (`src/PaletteManager.tsx`) shows the project's palettes, `src/palettes/library.json` (Game Boy classics + the author's Chorbi palettes, CC0) and "Mine" (localStorage). Writes go through the `gbstudio-palette` endpoint.
- Keep GB Cartographer light: one page, no project format of its own, no tileset or map editing.
