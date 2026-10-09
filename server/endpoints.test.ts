import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodePng } from "../src/gb/png";
import { handleCartographerRequest } from "./endpoints";
import { setProjectFolder } from "./project";

// A throwaway folder with a tiny fake GB Studio 4 project.
let root = "";
let project = "";
let server: Server;
let base = "";

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "gbc-"));
  project = join(root, "gbstudio");
  for (const folder of ["project/scenes/town/actors", "project/palettes", "assets/backgrounds", "assets/sprites", "assets/tilesets", "assets/fonts"]) mkdirSync(join(project, folder), { recursive: true });
  writeFileSync(join(project, "assets/fonts/tiny.png"), encodePng(new Uint8ClampedArray(8 * 8 * 4).fill(255), 8, 8, deflateSync));
  writeFileSync(join(project, "assets/fonts/tiny.png.gbsres"), JSON.stringify({ _resourceType: "font", id: "font-tiny", name: "Tiny" }));
  // A demo project next to the "app": one background, copied when asked for.
  mkdirSync(join(root, "demo/assets/backgrounds"), { recursive: true });
  mkdirSync(join(root, "demo/project"), { recursive: true });
  writeFileSync(join(root, "demo/demo.gbsproj"), JSON.stringify({ name: "Demo" }));
  writeFileSync(join(root, "demo/assets/backgrounds/a.png"), encodePng(new Uint8ClampedArray(8 * 8 * 4).fill(255), 8, 8, deflateSync));
  writeFileSync(join(project, "my-game.gbsproj"), JSON.stringify({ _resourceType: "project", name: "My Game" }));
  writeFileSync(join(project, "project/settings.gbsres"), JSON.stringify({ defaultBackgroundPaletteIds: ["pal-default", "pal-default", "pal-default", "pal-default", "pal-default", "pal-default", "pal-default", "pal-ui"], defaultSpritePaletteIds: ["spr-a", "spr-b", "spr-c", "spr-d", "spr-e", "spr-f", "spr-g", "spr-h"] }));
  // 160x144 background, one shade: 20 x 18 cells; first cell slot 1 with priority, the rest slot 0.
  const pixels = new Uint8ClampedArray(160 * 144 * 4).map((_, index) => index % 4 === 3 ? 255 : 0xe0);
  writeFileSync(join(project, "assets/backgrounds/town.png"), encodePng(pixels, 160, 144, deflateSync));
  writeFileSync(join(project, "assets/backgrounds/town.png.gbsres"), JSON.stringify({ _resourceType: "background", id: "bg-town", name: "Town", tileColors: "81!00167+" }));
  writeFileSync(join(project, "project/scenes/town/scene.gbsres"), JSON.stringify({ name: "Town", backgroundId: "bg-town", width: 20, height: 18, paletteIds: ["", "pal-town"] }));
  writeFileSync(join(project, "project/scenes/town/actors/shopkeeper.gbsres"), JSON.stringify({ _resourceType: "actor", name: "Shopkeeper", spriteSheetId: "spr-hero", x: 8, y: 9 }));
  writeFileSync(join(project, "project/palettes/town.gbsres"), JSON.stringify({ _resourceType: "palette", id: "pal-town", name: "Town day", colors: ["e6ffce", "7bef52", "21735a", "001031"] }));
  // A 16 x 16 sprite sheet: key green around a dark square; two 8 x 16 slices, the right one used by two frames.
  const sprite = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 256; i += 1) sprite.set(i % 16 >= 4 && i % 16 < 12 && i >= 64 && i < 192 ? [7, 24, 33, 255] : [0x65, 0xff, 0, 255], i * 4);
  writeFileSync(join(project, "assets/sprites/hero.png"), encodePng(sprite, 16, 16, deflateSync));
  const slice = (sliceX: number, paletteIndex: number) => ({ id: `t${sliceX}-${paletteIndex}`, x: sliceX, y: 0, sliceX, sliceY: 0, flipX: false, flipY: false, palette: 0, paletteIndex, objPalette: "OBP0", priority: false });
  writeFileSync(join(project, "assets/sprites/hero.png.gbsres"), JSON.stringify({ _resourceType: "sprite", id: "spr-hero", name: "Hero", states: [{ id: "s", name: "", animations: [{ id: "a", frames: [{ id: "f1", tiles: [slice(0, 2), slice(8, 0)] }, { id: "f2", tiles: [slice(8, 0)] }] }] }], numTiles: 2 }));
  writeFileSync(join(project, "assets/tilesets/props.png"), encodePng(new Uint8ClampedArray(8 * 8 * 4).fill(255), 8, 8, deflateSync));
  writeFileSync(join(project, "assets/tilesets/notes.txt"), "not a picture");
  setProjectFolder(null);
  server = createServer((req, res) => { void handleCartographerRequest(req, res, { root, backupDir: join(root, "backups"), settingsFile: join(root, "settings.json") }); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/__cartographer`;
});

afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

const json = <T>(response: Response) => response.json() as Promise<T>;

describe("project folder", () => {
  it("starts with no project, refuses folders that are not projects, and remembers the chosen one", async () => {
    expect(await json<{ project: null }>(await fetch(`${base}/ping`))).toEqual({ ok: true, project: null, recent: [] });
    expect((await fetch(`${base}/gbstudio-assets`)).status).toBe(404);
    const post = (path: string) => fetch(`${base}/project`, { method: "POST", body: JSON.stringify({ path }) });
    expect((await post(root)).status).toBe(400);
    const opened = await json<{ ok: boolean; project: { name: string; path: string } }>(await post(project));
    expect(opened.project).toEqual({ name: "My Game", path: project });
    expect(JSON.parse(readFileSync(join(root, "settings.json"), "utf8"))).toEqual({ project, recent: [project] });
    const ping = await json<{ project: { name: string }; recent: { name: string; path: string }[] }>(await fetch(`${base}/ping`));
    expect(ping.project.name).toBe("My Game");
    expect(ping.recent).toEqual([{ name: "My Game", path: project }]);
  });

  it("opens a copy of the shipped demo project, made once, and goes back to the real project afterwards", async () => {
    const post = (body: object) => fetch(`${base}/project`, { method: "POST", body: JSON.stringify(body) });
    const demo = await json<{ project: { name: string; path: string } }>(await post({ demo: true }));
    expect(demo.project).toEqual({ name: "Demo", path: join(root, "demo-project") });
    expect(readFileSync(join(root, "demo-project/assets/backgrounds/a.png")).length).toBeGreaterThan(0);
    writeFileSync(join(root, "demo-project/marker.txt"), "painted here");
    await post({ demo: true });
    expect(readFileSync(join(root, "demo-project/marker.txt"), "utf8")).toBe("painted here");
    expect((await json<{ project: { name: string } }>(await post({ path: project }))).project.name).toBe("My Game");
  });
});

describe("assets", () => {
  it("lists the asset PNGs with names and sizes, and the project's palettes", async () => {
    const result = await json<{ name: string; assets: { kind: string; file: string; name: string; width: number; height: number; mtime: number }[]; palettes: unknown[] }>(await fetch(`${base}/gbstudio-assets`));
    expect(result.name).toBe("My Game");
    expect(result.assets.map(({ kind, file, name, width, height }) => ({ kind, file, name, width, height }))).toEqual([
      { kind: "backgrounds", file: "town.png", name: "Town", width: 160, height: 144 },
      { kind: "sprites", file: "hero.png", name: "Hero", width: 16, height: 16 },
      { kind: "tilesets", file: "props.png", name: "props", width: 8, height: 8 },
      { kind: "fonts", file: "tiny.png", name: "Tiny", width: 8, height: 8 },
    ]);
    expect(result.palettes).toEqual([{ id: "pal-town", name: "Town day", colors: ["#E6FFCE", "#7BEF52", "#21735A", "#001031"] }]);
  });

  it("serves one PNG and its info: tile colors and slots for backgrounds, slice palettes for sprites", async () => {
    const png = await fetch(`${base}/gbstudio-asset?kind=backgrounds&file=town.png`);
    expect(png.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await png.arrayBuffer()).subarray(1, 4).toString()).toBe("PNG");
    const info = await json<{ width: number; height: number; tileColors: number[]; slots: string[]; metaMtime: number }>(await fetch(`${base}/gbstudio-asset-info?kind=backgrounds&file=town.png`));
    expect([info.width, info.height, info.tileColors.length, info.tileColors[0]]).toEqual([160, 144, 360, 0x81]);
    expect(info.slots).toEqual(["pal-default", "pal-town", "pal-default", "pal-default", "pal-default", "pal-default", "pal-default", "pal-ui"]);
    expect(info.metaMtime).toBeGreaterThan(0);
    const sprite = await json<{ tileColors: number[]; slots: string[]; animations: { name: string; frames: { tiles: { sliceX: number }[] }[] }[] }>(await fetch(`${base}/gbstudio-asset-info?kind=sprites&file=hero.png`));
    expect(sprite.tileColors).toEqual([2, 0, 2, 0]);
    expect(sprite.animations).toHaveLength(1);
    expect(sprite.animations[0].frames.map((frame) => frame.tiles.map((tile) => tile.sliceX))).toEqual([[0, 8], [8]]);
    expect(sprite.slots).toEqual(["spr-a", "spr-b", "spr-c", "spr-d", "spr-e", "spr-f", "spr-g", "spr-h"]);
    const tileset = await json<{ tileColors: number[]; slots: string[]; metaMtime: number | null }>(await fetch(`${base}/gbstudio-asset-info?kind=tilesets&file=props.png`));
    expect([tileset.tileColors, tileset.slots, tileset.metaMtime]).toEqual([[], [], null]);
    for (const query of ["kind=backgrounds&file=..%2F..%2Fproject%2Fsettings.gbsres", "kind=scenes&file=town.png", "kind=tilesets&file=notes.txt", "kind=backgrounds&file=missing.png"]) {
      expect((await fetch(`${base}/gbstudio-asset?${query}`)).status).toBe(404);
    }
  });

  it("overwrites a PNG of the same size, keeps a backup, and refuses stale or resized writes", async () => {
    const file = join(project, "assets/sprites/hero.png");
    const before = readFileSync(file);
    const { mtime } = await json<{ mtime: number }>(await fetch(`${base}/gbstudio-asset-info?kind=sprites&file=hero.png`));
    const repainted = encodePng(new Uint8ClampedArray(16 * 16 * 4).fill(0x65), 16, 16, deflateSync);
    const post = (body: Uint8Array, query = "") => fetch(`${base}/gbstudio-asset?kind=sprites&file=hero.png${query}`, { method: "POST", body });
    expect((await post(encodePng(new Uint8ClampedArray(8 * 8 * 4), 8, 8, deflateSync), `&mtime=${mtime}`)).status).toBe(400);
    expect((await post(new Uint8Array([1, 2, 3]), `&mtime=${mtime}`)).status).toBe(400);
    expect((await post(repainted, `&mtime=${mtime - 5000}`)).status).toBe(409);
    expect(readFileSync(file).equals(before)).toBe(true);
    const written = await json<{ ok: boolean; backup: string }>(await post(repainted, `&mtime=${mtime}`));
    expect(written.ok).toBe(true);
    expect(readFileSync(file).equals(Buffer.from(repainted))).toBe(true);
    expect(written.backup).toBe(join(root, "backups/gbstudio/sprites/hero.png"));
    expect(readFileSync(written.backup).equals(before)).toBe(true);
    expect((await post(repainted, `&mtime=${mtime - 5000}&force=1`)).status).toBe(200);
    expect(JSON.parse(readFileSync(`${file}.gbsres`, "utf8")).name).toBe("Hero");
  });
});

describe("palette files", () => {
  it("adds a palette to the project with a GB Studio file name, numbers a taken name, and rewrites one by id", async () => {
    const post = (body: object) => fetch(`${base}/gbstudio-palette`, { method: "POST", body: JSON.stringify(body) });
    expect((await post({ name: "Bad", colors: ["#123"] })).status).toBe(400);
    expect((await post({ name: "  ", colors: ["#000000", "#111111", "#222222", "#333333"] })).status).toBe(400);
    const made = await json<{ ok: boolean; id: string; file: string }>(await post({ name: "Cave Night", colors: ["#E0F8CF", "#86C06C", "#306850", "#071821"] }));
    expect(made.file).toBe("cave_night.gbsres");
    const file = join(project, "project/palettes/cave_night.gbsres");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ _resourceType: "palette", id: made.id, name: "Cave Night", colors: ["e0f8cf", "86c06c", "306850", "071821"] });
    const again = await json<{ file: string }>(await post({ name: "Cave Night", colors: ["#000000", "#111111", "#222222", "#333333"] }));
    expect(again.file).toBe("cave_night_2.gbsres");
    // Rewriting by id keeps the file and its other fields.
    writeFileSync(file, JSON.stringify({ _resourceType: "palette", id: made.id, name: "Cave Night", colors: ["e0f8cf", "86c06c", "306850", "071821"], extra: 1 }));
    const edited = await json<{ ok: boolean; id: string; file: string }>(await post({ id: made.id, name: "Cave Dusk", colors: ["#FFFFFF", "#AAAAAA", "#555555", "#000000"] }));
    expect(edited).toEqual({ ok: true, id: made.id, file: "cave_night.gbsres" });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ _resourceType: "palette", id: made.id, name: "Cave Dusk", colors: ["ffffff", "aaaaaa", "555555", "000000"], extra: 1 });
    expect(readFileSync(join(root, "backups/gbstudio/palettes/cave_night.gbsres"), "utf8")).toContain("Cave Night");
    expect((await post({ id: "nope", name: "x", colors: ["#000000", "#111111", "#222222", "#333333"] })).status).toBe(404);
    const listed = await json<{ palettes: { name: string }[] }>(await fetch(`${base}/gbstudio-assets`));
    expect(listed.palettes.map((palette) => palette.name)).toEqual(["Cave Dusk", "Cave Night", "Town day"]);
  });
});

describe("tile palettes", () => {
  it("writes a background's slots into tileColors, keeping other bits and fields, as GB Studio spells it", async () => {
    const sidecar = join(project, "assets/backgrounds/town.png.gbsres");
    const { metaMtime } = await json<{ metaMtime: number }>(await fetch(`${base}/gbstudio-asset-info?kind=backgrounds&file=town.png`));
    const post = (body: object, query = "") => fetch(`${base}/gbstudio-tile-colors?file=town.png${query}`, { method: "POST", body: JSON.stringify(body) });
    expect((await post({ slots: [9] }, `&metaMtime=${metaMtime}`)).status).toBe(400);
    expect((await post({ slots: [3] }, `&metaMtime=${metaMtime - 5000}`)).status).toBe(409);
    expect(await json(await post({ slots: [1, null, 0] }, `&metaMtime=${metaMtime}`))).toEqual({ ok: true, changed: false, cells: 0, mtime: metaMtime });
    const written = await json<{ changed: boolean; cells: number }>(await post({ slots: [3, null, 5] }, `&metaMtime=${metaMtime}`));
    expect([written.changed, written.cells]).toEqual([true, 2]);
    const text = readFileSync(sidecar, "utf8");
    const meta = JSON.parse(text) as { id: string; tileColors: string };
    expect([meta.tileColors, meta.id, text]).toEqual(["83!00!05!00165+", "bg-town", JSON.stringify(meta, null, 2)]);
    expect(readFileSync(join(root, "backups/gbstudio/backgrounds/town.png.gbsres"), "utf8")).toContain("81!00167+");
    expect((await post({ slots: [0] }, `&metaMtime=${metaMtime}`)).status).toBe(409);
    expect((await post({ slots: [0] }, `&metaMtime=${metaMtime}&force=1`)).status).toBe(200);
    expect((await fetch(`${base}/gbstudio-tile-colors?kind=tilesets&file=props.png`, { method: "POST", body: "{}" })).status).toBe(404);
  });

  it("writes a sprite sheet's slots as paletteIndex on every slice covering a painted cell", async () => {
    const sidecar = join(project, "assets/sprites/hero.png.gbsres");
    const before = readFileSync(sidecar, "utf8");
    const { metaMtime } = await json<{ metaMtime: number }>(await fetch(`${base}/gbstudio-asset-info?kind=sprites&file=hero.png`));
    const post = (body: object, query = "") => fetch(`${base}/gbstudio-tile-colors?kind=sprites&file=hero.png${query}`, { method: "POST", body: JSON.stringify(body) });
    expect(await json(await post({ slots: [2, 0, null, null] }, `&metaMtime=${metaMtime}`))).toMatchObject({ ok: true, changed: false, cells: 0 });
    expect(readFileSync(sidecar, "utf8")).toBe(before);
    const written = await json<{ changed: boolean; cells: number }>(await post({ slots: [null, null, null, 5] }, `&metaMtime=${metaMtime}`));
    expect(written).toMatchObject({ changed: true, cells: 2 });
    const text = readFileSync(sidecar, "utf8");
    const meta = JSON.parse(text) as { name: string; states: { animations: { frames: { tiles: { paletteIndex: number; palette: number }[] }[] }[] }[] };
    expect(meta.states[0].animations[0].frames.map((frame) => frame.tiles.map((tile) => tile.paletteIndex))).toEqual([[2, 5], [5]]);
    expect(meta.states[0].animations[0].frames[0].tiles.map((tile) => tile.palette)).toEqual([0, 0]);
    expect([meta.name, text]).toEqual(["Hero", JSON.stringify(meta, null, 2)]);
    expect(readFileSync(join(root, "backups/gbstudio/sprites/hero.png.gbsres"), "utf8")).toBe(before);
    expect((await post({ slots: [1] }, `&metaMtime=${metaMtime}`)).status).toBe(409);
  });
});
