import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodePng } from "../src/gb/png";
import { handleCartographerRequest } from "./endpoints";
import { KEEP, listBackups, projectBackupDir } from "./backups";
import { setProjectFolder, versionNote } from "./project";

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
  writeFileSync(join(project, "assets/tilesets/props.png.gbsres"), JSON.stringify({ _resourceType: "tileset", id: "ts-props", name: "props", tileColors: "02!" }));
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
/** The newest backup of a project file (a path inside the project), as text. */
const latestBackup = (file: string) => {
  const [entry] = listBackups(join(root, "backups"), project, file);
  return readFileSync(join(projectBackupDir(join(root, "backups"), project), file, entry.versions[0].id), "utf8");
};

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
    // Reset keeps the painted copy in the backups folder and makes a fresh one.
    await post({ demo: true, reset: true });
    expect(existsSync(join(root, "demo-project/marker.txt"))).toBe(false);
    const kept = readdirSync(join(root, "backups")).find((name) => name.startsWith("demo-project "))!;
    expect(readFileSync(join(root, "backups", kept, "marker.txt"), "utf8")).toBe("painted here");
    expect((await json<{ project: { name: string } }>(await post({ path: project }))).project.name).toBe("My Game");
    // The .gbsproj file stands for its folder.
    expect((await json<{ project: { path: string } }>(await post({ path: join(project, "my-game.gbsproj") }))).project.path).toBe(project);
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
    expect(result.palettes).toEqual([{ id: "pal-town", name: "Town day", colors: ["#E6FFCE", "#7BEF52", "#21735A", "#001031"], mtime: expect.any(Number) }]);
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
    // Tilesets carry tileColors like backgrounds, with the project's default background palettes as their slots.
    expect([tileset.tileColors, tileset.slots]).toEqual([[2], ["pal-default", "pal-default", "pal-default", "pal-default", "pal-default", "pal-default", "pal-default", "pal-ui"]]);
    expect(tileset.metaMtime).toBeGreaterThan(0);
    for (const query of ["kind=backgrounds&file=..%2F..%2Fproject%2Fsettings.gbsres", "kind=scenes&file=town.png", "kind=tilesets&file=notes.txt", "kind=backgrounds&file=missing.png"]) {
      expect((await fetch(`${base}/gbstudio-asset?${query}`)).status).toBe(404);
    }
  });

  it("renders a colored preview: a background's tiles in their slot palettes, a sprite's key green see-through", async () => {
    const { decodePng } = await import("../src/gb/png");
    const { inflateSync } = await import("node:zlib");
    const preview = decodePng(new Uint8Array(await (await fetch(`${base}/gbstudio-asset-preview?kind=backgrounds&file=town.png`)).arrayBuffer()), (bytes) => inflateSync(bytes));
    expect([preview.width, preview.height]).toEqual([160, 144]);
    // Cell 0 is slot 1 = pal-town, whose lightest color is #E6FFCE; the rest are slot 0 = pal-default, unknown, so GB green.
    expect([...preview.pixels.slice(0, 3)]).toEqual([0xe6, 0xff, 0xce]);
    expect([...preview.pixels.slice(8 * 4, 8 * 4 + 3)]).toEqual([0xe0, 0xf8, 0xcf]);
    // A sprite's preview is its first frame (two 8 x 16 slices), key green see-through.
    const sprite = decodePng(new Uint8Array(await (await fetch(`${base}/gbstudio-asset-preview?kind=sprites&file=hero.png`)).arrayBuffer()), (bytes) => inflateSync(bytes));
    expect([sprite.width, sprite.height]).toEqual([16, 16]);
    expect(sprite.pixels[3]).toBe(0);
    expect((await fetch(`${base}/gbstudio-asset-preview?kind=backgrounds&file=missing.png`)).status).toBe(404);
    expect((await fetch(`${base}/reveal?kind=backgrounds&file=missing.png`, { method: "POST" })).status).toBe(404);
    expect((await fetch(`${base}/reveal?kind=backgrounds&file=..%2F..%2Fsecret.png`, { method: "POST" })).status).toBe(404);
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
    expect(written.backup.startsWith(join(projectBackupDir(join(root, "backups"), project), "assets/sprites/hero.png"))).toBe(true);
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
    const listedMtime = (await json<{ palettes: { id: string; mtime: number }[] }>(await fetch(`${base}/gbstudio-assets`))).palettes.find((palette) => palette.id === made.id)!.mtime;
    expect((await post({ id: made.id, name: "Cave Dusk", colors: ["#FFFFFF", "#AAAAAA", "#555555", "#000000"], mtime: listedMtime - 5000 })).status).toBe(409);
    const edited = await json<{ ok: boolean; id: string; file: string }>(await post({ id: made.id, name: "Cave Dusk", colors: ["#FFFFFF", "#AAAAAA", "#555555", "#000000"], mtime: listedMtime }));
    expect(edited).toMatchObject({ ok: true, id: made.id, file: "cave_night.gbsres" });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ _resourceType: "palette", id: made.id, name: "Cave Dusk", colors: ["ffffff", "aaaaaa", "555555", "000000"], extra: 1 });
    expect(latestBackup("project/palettes/cave_night.gbsres")).toContain("Cave Night");
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
    expect(latestBackup("assets/backgrounds/town.png.gbsres")).toContain("81!00167+");
    expect((await post({ slots: [0] }, `&metaMtime=${metaMtime}`)).status).toBe(409);
    expect((await post({ slots: [0] }, `&metaMtime=${metaMtime}&force=1`)).status).toBe(200);
    expect((await fetch(`${base}/gbstudio-tile-colors?kind=fonts&file=props.png`, { method: "POST", body: "{}" })).status).toBe(404);
    // A tileset's tile colors are written the same way, backed up under tilesets.
    const ts = await json<{ changed: boolean }>(await fetch(`${base}/gbstudio-tile-colors?kind=tilesets&file=props.png`, { method: "POST", body: JSON.stringify({ slots: [5] }) }));
    expect(ts.changed).toBe(true);
    expect(JSON.parse(readFileSync(join(project, "assets/tilesets/props.png.gbsres"), "utf8")).tileColors).toBe("05!");
    expect(latestBackup("assets/tilesets/props.png.gbsres")).toContain("02!");
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
    expect(latestBackup("assets/sprites/hero.png.gbsres")).toBe(before);
    expect((await post({ slots: [1] }, `&metaMtime=${metaMtime}`)).status).toBe(409);
  });

  it("puts a palette in a slot: the scene's list for a background, the project defaults for tilesets and unclaimed sprites", async () => {
    const put = (kind: string, file: string, body: object) => fetch(`${base}/gbstudio-palette-slot?kind=${kind}&file=${file}`, { method: "POST", body: JSON.stringify(body) });
    expect((await json<{ slotScene: string | null }>(await fetch(`${base}/gbstudio-asset-info?kind=backgrounds&file=town.png`))).slotScene).toBe("Town");
    const sceneFile = join(project, "project/scenes/town/scene.gbsres");
    const sceneBefore = readFileSync(sceneFile, "utf8");
    const bg = await json<{ slots: string[]; scene: string | null }>(await put("backgrounds", "town.png", { slot: 3, paletteId: "pal-town" }));
    expect(bg).toMatchObject({ scene: "Town", slots: ["pal-default", "pal-town", "pal-default", "pal-town", "pal-default", "pal-default", "pal-default", "pal-ui"] });
    const scene = JSON.parse(readFileSync(sceneFile, "utf8")) as { name: string; backgroundId: string; paletteIds: string[] };
    expect(scene).toMatchObject({ name: "Town", backgroundId: "bg-town", paletteIds: ["", "pal-town", "", "pal-town", "", "", "", ""] });
    expect(latestBackup("project/scenes/town/scene.gbsres")).toBe(sceneBefore);
    const settingsFile = join(project, "project/settings.gbsres");
    const ts = await json<{ slots: string[]; scene: string | null }>(await put("tilesets", "props.png", { slot: 0, paletteId: "pal-town" }));
    expect(ts).toMatchObject({ scene: null, slots: ["pal-town", "pal-default", "pal-default", "pal-default", "pal-default", "pal-default", "pal-default", "pal-ui"] });
    const sp = await json<{ slots: string[]; scene: string | null }>(await put("sprites", "hero.png", { slot: 7, paletteId: "pal-town" }));
    expect(sp).toMatchObject({ scene: null, slots: ["spr-a", "spr-b", "spr-c", "spr-d", "spr-e", "spr-f", "spr-g", "pal-town"] });
    const settings = JSON.parse(readFileSync(settingsFile, "utf8")) as { defaultBackgroundPaletteIds: string[]; defaultSpritePaletteIds: string[] };
    expect(settings.defaultBackgroundPaletteIds[0]).toBe("pal-town");
    expect(settings.defaultSpritePaletteIds[7]).toBe("pal-town");
    expect((await put("backgrounds", "town.png", { slot: 2, paletteId: "nope" })).status).toBe(404);
    expect((await put("backgrounds", "town.png", { slot: 8, paletteId: "pal-town" })).status).toBe(400);
    expect((await put("fonts", "tiny.png", { slot: 0, paletteId: "pal-town" })).status).toBe(404);
    // A slot that changed since the user saw it is refused with what is there now.
    const stale = await put("backgrounds", "town.png", { slot: 3, paletteId: "pal-town", expected: "pal-default" });
    expect(stale.status).toBe(409);
    expect((await json<{ current: string }>(stale)).current).toBe("pal-town");
  });
});

describe("thumbnails", () => {
  it("puts every picture of a kind on one sheet, and the sheet changes when a picture does", async () => {
    const first = await json<{ stamp: string; width: number; height: number; cells: { file: string; x: number; y: number; w: number; h: number }[] }>(await fetch(`${base}/gbstudio-preview-sheet?kind=backgrounds`));
    expect(first.cells.map((cell) => cell.file)).toContain("town.png");
    const town = first.cells.find((cell) => cell.file === "town.png")!;
    // 160 × 144 shrinks to fit a 128 px cell.
    expect([town.w, town.h]).toEqual([128, 115]);
    const png = new Uint8Array(await (await fetch(`${base}/gbstudio-preview-sheet.png?kind=backgrounds&stamp=${first.stamp}`)).arrayBuffer());
    expect(Buffer.from(png).readUInt32BE(16)).toBe(first.width);
    // Repainting a picture gives a new stamp.
    const file = join(project, "assets/backgrounds/town.png");
    writeFileSync(file, readFileSync(file));
    const again = await json<{ stamp: string }>(await fetch(`${base}/gbstudio-preview-sheet?kind=backgrounds`));
    expect(again.stamp).not.toBe(first.stamp);
    // So does an actor changing (it decides a sprite sheet's palettes).
    const actor = join(project, "project/scenes/town/actors/shopkeeper.gbsres");
    const sprites = await json<{ stamp: string }>(await fetch(`${base}/gbstudio-preview-sheet?kind=sprites`));
    writeFileSync(actor, readFileSync(actor));
    expect((await json<{ stamp: string }>(await fetch(`${base}/gbstudio-preview-sheet?kind=sprites`))).stamp).not.toBe(sprites.stamp);
    expect((await fetch(`${base}/gbstudio-preview-sheet?kind=music`)).status).toBe(400);
  });
});

describe("new pictures and resizing", () => {
  it("adds a new picture in whole tiles without replacing anything, and resizes only when asked", async () => {
    const blank = (w: number, h: number) => encodePng(new Uint8ClampedArray(w * h * 4).fill(255), w, h, deflateSync);
    const make = (name: string, bytes: Uint8Array, kind = "backgrounds") => fetch(`${base}/gbstudio-new-asset?kind=${kind}&name=${encodeURIComponent(name)}`, { method: "POST", body: bytes });
    expect(await json(await make("Cave Entrance", blank(160, 144)))).toMatchObject({ ok: true, file: "Cave Entrance.png" });
    expect(readFileSync(join(project, "assets/backgrounds/Cave Entrance.png")).length).toBeGreaterThan(0);
    expect((await make("Cave Entrance", blank(160, 144))).status).toBe(409);
    expect((await make("../escape", blank(8, 8))).status).toBe(400);
    expect((await make("odd", blank(10, 8))).status).toBe(400);
    expect((await make("x", blank(8, 8), "music")).status).toBe(400);
    const { mtime } = await json<{ mtime: number }>(await fetch(`${base}/gbstudio-asset-info?kind=backgrounds&file=Cave%20Entrance.png`));
    const post = (query: string) => fetch(`${base}/gbstudio-asset?kind=backgrounds&file=Cave%20Entrance.png&mtime=${mtime}${query}`, { method: "POST", body: blank(320, 144) });
    expect((await post("")).status).toBe(400);
    expect((await post("&resize=1")).status).toBe(200);
    const size = readFileSync(join(project, "assets/backgrounds/Cave Entrance.png"));
    expect(size.readUInt32BE(16)).toBe(320);
  });
});

describe("palette usage", () => {
  it("lists each palette's uses by scene and default, inherited blanks, and palettes with the same colors", async () => {
    const result = await json<{ palettes: { id: string; uses: { kind: string; slot: number; scene: string | null; inherited?: boolean }[]; sameColors: string[] }[] }>(await fetch(`${base}/palette-usage`));
    const town = result.palettes.find((palette) => palette.id === "pal-town")!;
    // By now the tests put pal-town in Town's slots 2 and 4, in the default background slot 1 (so Town's blank slot 1
    // inherits it) and in the default sprite slot 8 (Town has no sprite palettes of its own).
    expect(town.uses).toEqual(expect.arrayContaining([
      { kind: "background", slot: 0, scene: null },
      { kind: "sprite", slot: 7, scene: null },
      { kind: "background", slot: 0, scene: "Town", inherited: true },
      { kind: "background", slot: 1, scene: "Town" },
      { kind: "background", slot: 3, scene: "Town" },
      { kind: "sprite", slot: 7, scene: "Town", inherited: true },
    ]));
    const dusk = result.palettes.find((palette) => palette.sameColors.length);
    expect(dusk === undefined || dusk.sameColors.every((id) => typeof id === "string")).toBe(true);
    expect(result.palettes.filter((palette) => !palette.uses.length).length).toBeGreaterThan(0);
  });
});

describe("GB Studio versions", () => {
  it("explains a GB Studio 3 project, notes untested versions, and leaves files of an unexpected type alone", async () => {
    const gb3 = join(root, "old-game");
    mkdirSync(join(gb3, "assets/backgrounds"), { recursive: true });
    writeFileSync(join(gb3, "old.gbsproj"), JSON.stringify({ name: "Old", _version: "3.1.0", scenes: [] }));
    const refused = await fetch(`${base}/project`, { method: "POST", body: JSON.stringify({ path: gb3 }) });
    expect(refused.status).toBe(400);
    expect((await json<{ error: string }>(refused)).error).toContain("GB Studio 3 project (3.1.0)");
    expect(versionNote(project)).toBeNull();
    const newer = join(root, "newer");
    mkdirSync(newer);
    writeFileSync(join(newer, "n.gbsproj"), JSON.stringify({ _version: "4.3.1" }));
    expect(versionNote(newer)).toContain("GB Studio 4.3.1");
    writeFileSync(join(newer, "n.gbsproj"), JSON.stringify({ _version: "4.2.7" }));
    expect(versionNote(newer)).toBeNull();
    // A sidecar that says it is something else is not rewritten.
    const sidecar = join(project, "assets/tilesets/props.png.gbsres");
    const before = readFileSync(sidecar, "utf8");
    writeFileSync(sidecar, JSON.stringify({ ...JSON.parse(before), _resourceType: "mystery" }));
    const odd = await fetch(`${base}/gbstudio-tile-colors?kind=tilesets&file=props.png&force=1`, { method: "POST", body: JSON.stringify({ slots: [6] }) });
    expect(odd.status).toBe(400);
    writeFileSync(sidecar, before);
  });
});

describe("backups and the local address", () => {
  it("keeps the newest versions of each file per project, lists them, serves one, and restores it (undoably)", async () => {
    const file = join(project, "assets/tilesets/props.png.gbsres");
    const post = (slots: number[]) => fetch(`${base}/gbstudio-tile-colors?kind=tilesets&file=props.png&force=1`, { method: "POST", body: JSON.stringify({ slots }) });
    for (let n = 0; n < KEEP + 3; n += 1) expect((await post([n % 8])).status).toBe(200);
    const listed = await json<{ files: { file: string; versions: { id: string; time: number }[] }[] }>(await fetch(`${base}/backups?file=assets/tilesets/props.png.gbsres`));
    expect(listed.files[0].versions).toHaveLength(KEEP);
    const all = await json<{ files: { file: string }[] }>(await fetch(`${base}/backups`));
    expect(all.files.map((entry) => entry.file)).toEqual(expect.arrayContaining(["assets/tilesets/props.png.gbsres", "assets/sprites/hero.png", "project/scenes/town/scene.gbsres"]));
    const oldest = listed.files[0].versions[KEEP - 1];
    const served = await (await fetch(`${base}/backup?file=assets/tilesets/props.png.gbsres&version=${oldest.id}`)).text();
    const now = readFileSync(file, "utf8");
    const restored = await fetch(`${base}/backup-restore`, { method: "POST", body: JSON.stringify({ file: "assets/tilesets/props.png.gbsres", version: oldest.id }) });
    expect(restored.status).toBe(200);
    expect(readFileSync(file, "utf8")).toBe(served);
    expect(latestBackup("assets/tilesets/props.png.gbsres")).toBe(now);
    expect((await fetch(`${base}/backup?file=../../etc&version=x`)).status).toBe(404);
    expect((await fetch(`${base}/backup-restore`, { method: "POST", body: JSON.stringify({ file: "assets/tilesets/props.png.gbsres", version: "nope" }) })).status).toBe(404);
  });

  it("answers only on this machine's own address (a rebound DNS name is refused)", async () => {
    const port = new URL(base).port;
    const status = (host: string) => new Promise<number>((resolve) => {
      request({ host: "127.0.0.1", port, path: "/__cartographer/ping", headers: { host } }, (response) => { response.resume(); resolve(response.statusCode ?? 0); }).end();
    });
    expect(await status(`127.0.0.1:${port}`)).toBe(200);
    expect(await status(`localhost:${port}`)).toBe(200);
    expect(await status(`evil.example:${port}`)).toBe(403);
    expect(await status(`127.0.0.1:1`)).toBe(403);
  });
});
