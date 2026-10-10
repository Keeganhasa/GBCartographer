/**
 * Smoke test on the real demo project: open a copy of it, paint one tile of a tileset, save the PNG and that tile's
 * palette slot the way the app does, put a palette in a scene slot, and check the files GB Studio would read and the
 * backups. It goes through the same endpoints as the app (no browser).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { afterAll, beforeAll, expect, it } from "vitest";
import { decodeTileColors } from "../src/gb/gbstudio";
import { decodePng, encodePng } from "../src/gb/png";
import { handleCartographerRequest } from "./endpoints";
import { setProjectFolder } from "./project";

const repo = resolve(__dirname, "..");
let data = "";
let server: Server;
let base = "";

beforeAll(async () => {
  data = mkdtempSync(join(tmpdir(), "gbc-smoke-"));
  setProjectFolder(null);
  server = createServer((req, res) => { void handleCartographerRequest(req, res, { root: repo, backupDir: join(data, "backups"), settingsFile: join(data, "settings.json") }); });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/__cartographer`;
});

afterAll(() => {
  server.close();
  setProjectFolder(null);
  rmSync(data, { recursive: true, force: true });
});

const json = async <T>(response: Response) => {
  expect(response.ok, `${response.url} → ${response.status}`).toBe(true);
  return response.json() as Promise<T>;
};

it("opens the demo, paints a tile, saves it and its palette, and GB Studio's files say so", async () => {
  const opened = await json<{ project: { name: string; path: string } }>(await fetch(`${base}/project`, { method: "POST", body: JSON.stringify({ demo: true }) }));
  expect(opened.project.name).toBe("Demo Project");
  const project = opened.project.path;
  const listed = await json<{ assets: { kind: string; file: string }[]; palettes: { id: string; name: string }[] }>(await fetch(`${base}/gbstudio-assets`));
  const tileset = listed.assets.find((asset) => asset.kind === "tilesets" && asset.file.startsWith("Winter Tileset"))!;
  expect(tileset).toBeTruthy();
  const query = new URLSearchParams({ kind: "tilesets", file: tileset.file });

  // Paint the first 8 × 8 tile in the darkest green and save the PNG with the time it was opened with.
  const info = await json<{ mtime: number; metaMtime: number; tileColors: number[]; slots: string[] }>(await fetch(`${base}/gbstudio-asset-info?${query}`));
  const png = decodePng(new Uint8Array(await (await fetch(`${base}/gbstudio-asset?${query}`)).arrayBuffer()), (bytes) => inflateSync(bytes));
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) png.pixels.set([7, 24, 33, 255], (y * png.width + x) * 4);
  await json(await fetch(`${base}/gbstudio-asset?${query}&mtime=${info.mtime}`, { method: "POST", body: encodePng(png.pixels, png.width, png.height, (bytes) => deflateSync(bytes)) }));

  // Give that tile slot 5 (the slots are the project's default background palettes for a tileset).
  const slots: (number | null)[] = info.tileColors.map(() => null);
  slots[0] = 4;
  const written = await json<{ changed: boolean; cells: number }>(await fetch(`${base}/gbstudio-tile-colors?${query}&metaMtime=${info.metaMtime}`, { method: "POST", body: JSON.stringify({ slots }) }));
  expect(written).toMatchObject({ changed: true, cells: 1 });

  // What GB Studio reads: the PNG's first tile is dark, the sidecar's first tile is slot 5, every other tile as it was.
  const file = join(project, "assets/tilesets", tileset.file);
  const saved = decodePng(readFileSync(file), (bytes) => inflateSync(bytes));
  expect([...saved.pixels.slice(0, 4)]).toEqual([7, 24, 33, 255]);
  const colors = decodeTileColors(JSON.parse(readFileSync(`${file}.gbsres`, "utf8")).tileColors);
  expect(colors[0] & 7).toBe(4);
  expect(colors.slice(1)).toEqual(info.tileColors.slice(1));

  // Put DWC-3-Cactus in slot 3 of the Winter Example scene (it holds WIN-3-Pine): its scene file changes.
  const winter = listed.assets.find((asset) => asset.kind === "backgrounds" && asset.file.startsWith("Winter Example"))!;
  const pine = listed.palettes.find((palette) => palette.name === "WIN-3-Pine")!;
  const cactus = listed.palettes.find((palette) => palette.name === "DWC-3-Cactus")!;
  const placed = await json<{ scene: string; slots: string[] }>(await fetch(`${base}/gbstudio-palette-slot?${new URLSearchParams({ kind: "backgrounds", file: winter.file })}`, { method: "POST", body: JSON.stringify({ slot: 2, paletteId: cactus.id, expected: pine.id }) }));
  expect(placed.scene).toBe("Winter Example");
  const scene = JSON.parse(readFileSync(join(project, "project/scenes/winter_example/scene.gbsres"), "utf8")) as { paletteIds: string[] };
  expect(scene.paletteIds[2]).toBe(cactus.id);
  expect(scene.paletteIds.filter((id) => id !== cactus.id)).toHaveLength(7);

  // Every overwritten file has a backup, and the shipped demo is untouched.
  const backups = await json<{ files: { file: string }[] }>(await fetch(`${base}/backups`));
  expect(backups.files.map((entry) => entry.file).sort()).toEqual([`assets/tilesets/${tileset.file}`, `assets/tilesets/${tileset.file}.gbsres`, "project/scenes/winter_example/scene.gbsres"].sort());
  expect(readFileSync(join(repo, "demo/assets/tilesets", tileset.file)).equals(readFileSync(file))).toBe(false);
});
