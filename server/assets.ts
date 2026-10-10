/**
 * GB Cartographer's window into a GB Studio project: the PNGs under assets/ (backgrounds, sprites, tilesets,
 * fonts), the project's palettes and palette slots, and the writes the tool is allowed: an existing asset PNG (same
 * size), a background's or tileset's `tileColors`, a sprite sheet's slice `paletteIndex`, palette files, and one
 * slot of a scene's palette list or of the project's default palettes. Each write backs up the old file first
 * (backups.ts) and goes through a temporary file. Everything else is only ever read.
 */
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { backupFile } from "./backups";
import { decodeTileColors, encodeTileColors, resolveScenePaletteIds } from "../src/gb/gbstudio";
import { decodePng, encodePng } from "../src/gb/png";
import { KEY_GREEN, assignSlots, closeShades, countUniqueTiles, quantize, spriteShades, toRgba } from "../src/paint";

/** The picture folders under assets/. Emotes are read like sprites (key green see-through); avatars and the UI
 * frame and cursor (assets/ui, no sidecars) like background tiles. Only backgrounds, sprites and tilesets carry palettes. */
export const ASSET_KINDS = ["backgrounds", "sprites", "tilesets", "fonts", "emotes", "avatars", "ui"] as const;
/** Kinds GB Studio draws as sprites: their key green is see-through. */
export const KEYED_KINDS: readonly AssetKind[] = ["sprites", "emotes"];
export type AssetKind = typeof ASSET_KINDS[number];

/** Where backups go: the backups folder and the project the written file belongs to (see backups.ts). */
export interface Backup { dir: string; project: string }

export interface AssetEntry { kind: AssetKind; file: string; name: string; width: number; height: number; mtime: number }
export interface ProjectPalette { id: string; name: string; colors: string[]; /** The palette file's modification time (for the changed-on-disk check). */ mtime: number }
/**
 * What GB Cartographer needs besides the pixels. `tileColors`: one attribute per 8 × 8 cell whose low three bits are the
 * palette slot (a background's sidecar `tileColors`; for a sprite sheet, each 8 × 16 slice's `paletteIndex` on
 * the two cells it covers, -1 on cells no slice uses). `slots`: the eight palette ids those slots mean (the
 * scene's background palettes, or the project's sprite palettes). `metaMtime`: the sidecar's time, or null.
 */
export interface AssetInfo { mtime: number; width: number; height: number; tileColors: number[]; slots: string[]; /** A sprite sheet's GB Studio animation speed: 60 / (animSpeed + 1) frames a second; 255 none. */ animSpeed: number | null; /** The scene whose palette list the slots are (null: the project's defaults). */ slotScene: string | null; /** GB Studio's Automatic color (backgrounds): it reads the colors from the PNG itself. */ autoColor: boolean; metaMtime: number | null; /** A sprite sheet's animations (every state's), each a list of frames made of 8 × 16 slices. */ animations: SpriteAnimation[] }
export interface SpriteFrame { tiles: { x: number; y: number; sliceX: number; sliceY: number; flipX: boolean; flipY: boolean }[] }
export interface SpriteAnimation { name: string; frames: SpriteFrame[] }

/** A sprite sheet's animations, flattened across states: "<state> · <n>" (GB Studio keeps up to eight per state). */
function spriteAnimations(meta: Record<string, unknown>): SpriteAnimation[] {
  const out: SpriteAnimation[] = [];
  const states = Array.isArray(meta.states) ? meta.states as Record<string, unknown>[] : [];
  states.forEach((state, stateIndex) => {
    const animations = Array.isArray(state.animations) ? state.animations as Record<string, unknown>[] : [];
    animations.forEach((animation, index) => {
      const frames = (Array.isArray(animation.frames) ? animation.frames as Record<string, unknown>[] : []).map((frame) => ({
        tiles: (Array.isArray(frame.tiles) ? frame.tiles as SpriteTile[] : []).map((tile) => ({ x: Number(tile.x) || 0, y: Number(tile.y) || 0, sliceX: Number(tile.sliceX) || 0, sliceY: Number(tile.sliceY) || 0, flipX: Boolean(tile.flipX), flipY: Boolean(tile.flipY) })),
      })).filter((frame) => frame.tiles.length);
      if (!frames.length) return;
      const stateName = typeof state.name === "string" && state.name ? state.name : states.length > 1 ? `State ${stateIndex + 1}` : "";
      out.push({ name: [stateName, animations.length > 1 ? `Animation ${index + 1}` : ""].filter(Boolean).join(" · ") || "Animation", frames });
    });
  });
  return out;
}

type SpriteTile = { sliceX?: number; sliceY?: number; paletteIndex?: number } & Record<string, unknown>;

/** Every metasprite tile of a sprite sheet's sidecar (states → animations → frames → tiles), in file order. */
function spriteTiles(meta: Record<string, unknown>): SpriteTile[] {
  const tiles: SpriteTile[] = [];
  for (const state of Array.isArray(meta.states) ? meta.states as Record<string, unknown>[] : []) {
    for (const animation of Array.isArray(state.animations) ? state.animations as Record<string, unknown>[] : []) {
      for (const frame of Array.isArray(animation.frames) ? animation.frames as Record<string, unknown>[] : []) {
        for (const tile of Array.isArray(frame.tiles) ? frame.tiles as SpriteTile[] : []) tiles.push(tile);
      }
    }
  }
  return tiles;
}

/** The top cell of a slice and the cell under it (a sprite tile is 8 × 16), or null when the slice is off the sheet. */
function sliceCells(tile: SpriteTile, cw: number, ch: number): [number, number] | null {
  const cx = Math.floor((tile.sliceX ?? 0) / 8), cy = Math.floor((tile.sliceY ?? 0) / 8);
  if (cx < 0 || cy < 0 || cx >= cw || cy >= ch) return null;
  return [cy * cw + cx, cy + 1 < ch ? (cy + 1) * cw + cx : -1];
}

/** A sprite sheet's per-cell palette slots from its slices (-1 where no slice is). */
function spriteCellColors(meta: Record<string, unknown>, cw: number, ch: number): number[] {
  const values = new Array<number>(cw * ch).fill(-1);
  for (const tile of spriteTiles(meta)) {
    const cells = sliceCells(tile, cw, ch);
    if (!cells) continue;
    for (const cell of cells) if (cell >= 0) values[cell] = (tile.paletteIndex ?? 0) & 7;
  }
  return values;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Project JSON read through a cache keyed by the file's time: a big project's thumbnails look up every scene for
 * every picture, and the scenes rarely change. Reads only; writes always read the file afresh.
 */
const jsonCache = new Map<string, { mtime: number; data: Record<string, unknown> | null }>();
function readJsonCached(path: string): Record<string, unknown> | null {
  let mtime: number;
  try { mtime = statSync(path).mtimeMs; } catch { return null; }
  const hit = jsonCache.get(path);
  if (hit && hit.mtime === mtime) return hit.data;
  const data = readJson(path);
  jsonCache.set(path, { mtime, data });
  return data;
}

/** Width and height from a PNG's IHDR chunk, or null when the bytes are not a PNG. */
export function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function pngSizeOfFile(path: string): { width: number; height: number } | null {
  const header = Buffer.alloc(24);
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const read = readSync(fd, header, 0, 24, 0);
    return pngSize(header.subarray(0, read));
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/** The project's display name (from the .gbsproj file) or the folder's name. */
export function projectName(project: string): string {
  const gbsproj = existsSync(project) ? readdirSync(project).find((file) => file.endsWith(".gbsproj")) : undefined;
  const name = gbsproj ? readJson(join(project, gbsproj))?.name : undefined;
  return typeof name === "string" && name ? name : basename(project);
}

/**
 * The full path of one asset PNG, or null when `file` is not a plain PNG file name inside that assets folder.
 * Only files that already exist count: GB Cartographer never adds assets to a project.
 */
export function assetPath(project: string, kind: string, file: string): string | null {
  if (!(ASSET_KINDS as readonly string[]).includes(kind)) return null;
  if (!/^[^/\\]+\.png$/i.test(file) || file === "." || file === "..") return null;
  const folder = resolve(project, "assets", kind);
  const path = resolve(folder, file);
  if (basename(path) !== file || resolve(path, "..") !== folder || !existsSync(path)) return null;
  return path;
}

/** Every PNG under assets/backgrounds, sprites, tilesets and fonts, with its sidecar's name and the PNG's size. */
export function listAssets(project: string): AssetEntry[] {
  const entries: AssetEntry[] = [];
  for (const kind of ASSET_KINDS) {
    const folder = join(project, "assets", kind);
    if (!existsSync(folder)) continue;
    for (const file of readdirSync(folder).filter((name) => /\.png$/i.test(name)).sort((a, b) => a.localeCompare(b))) {
      const path = join(folder, file);
      const size = pngSizeOfFile(path);
      if (!size) continue;
      const sidecar = readJson(`${path}.gbsres`);
      const name = typeof sidecar?.name === "string" && sidecar.name ? sidecar.name : file.replace(/\.png$/i, "");
      entries.push({ kind, file, name, width: size.width, height: size.height, mtime: statSync(path).mtimeMs });
    }
  }
  return entries;
}

/** The project's palettes (project/palettes/*.gbsres), colors as "#RRGGBB", sorted by name. */
export function listPalettes(project: string): ProjectPalette[] {
  const folder = join(project, "project/palettes");
  if (!existsSync(folder)) return [];
  const palettes: ProjectPalette[] = [];
  for (const file of readdirSync(folder).filter((name) => name.endsWith(".gbsres"))) {
    const palette = readJson(join(folder, file));
    const colors = Array.isArray(palette?.colors) ? palette.colors.filter((color): color is string => typeof color === "string") : [];
    if (typeof palette?.id !== "string" || colors.length !== 4) continue;
    palettes.push({ id: palette.id, name: typeof palette.name === "string" ? palette.name : file.replace(/\.gbsres$/, ""), colors: colors.map((color) => `#${color.replace(/^#/, "").toUpperCase()}`), mtime: statSync(join(folder, file)).mtimeMs });
  }
  return palettes.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Where an asset's eight palette slots come from. A background: the first scene (by folder name) that shows it.
 * A sprite sheet: the first scene with an actor using it that overrides sprite palettes. Otherwise, and always for
 * tilesets (they belong to no scene), the project's default palettes in settings.gbsres. GB Studio 3 keeps actors
 * in the scene file, GB Studio 4 in the scene folder's actors/.
 */
interface SlotSource { file: string; field: string; scene: string | null; ids: string[]; defaults: string[] }

const idList = (value: unknown): string[] => Array.isArray(value) ? value.map((id) => typeof id === "string" ? id : "") : [];

function slotSource(project: string, kind: AssetKind, assetId: string | undefined): SlotSource {
  const settingsFile = join(project, "project/settings.gbsres");
  const sprite = kind === "sprites";
  const defaultsField = sprite ? "defaultSpritePaletteIds" : "defaultBackgroundPaletteIds";
  const defaults = idList(readJsonCached(settingsFile)?.[defaultsField]);
  const scenesDir = join(project, "project/scenes");
  if (assetId && kind !== "tilesets" && existsSync(scenesDir)) {
    for (const folder of readdirSync(scenesDir).sort()) {
      const file = join(scenesDir, folder, "scene.gbsres");
      const scene = readJsonCached(file);
      if (!scene) continue;
      const name = typeof scene.name === "string" && scene.name ? scene.name : folder;
      if (!sprite) {
        if (scene.backgroundId === assetId) return { file, field: "paletteIds", scene: name, ids: idList(scene.paletteIds), defaults };
        continue;
      }
      const overrides = idList(scene.spritePaletteIds);
      if (!overrides.some(Boolean)) continue;
      const actors: Record<string, unknown>[] = Array.isArray(scene.actors) ? scene.actors as Record<string, unknown>[] : [];
      const actorsDir = join(scenesDir, folder, "actors");
      if (existsSync(actorsDir)) for (const entry of readdirSync(actorsDir)) { const actor = readJsonCached(join(actorsDir, entry)); if (actor) actors.push(actor); }
      if (actors.some((actor) => actor.spriteSheetId === assetId)) return { file, field: "spritePaletteIds", scene: name, ids: overrides, defaults };
    }
  }
  return { file: settingsFile, field: defaultsField, scene: null, ids: [], defaults };
}

function assetId(path: string): string | undefined {
  const id = readJson(`${path}.gbsres`)?.id;
  return typeof id === "string" ? id : undefined;
}

export interface PaletteUse { kind: "background" | "sprite"; slot: number; /** The scene's name, or null for the project's defaults. */ scene: string | null; /** A scene slot left blank that takes this default. */ inherited?: boolean }
export interface PaletteUsage { id: string; uses: PaletteUse[]; /** Other project palettes with the same four colors. */ sameColors: string[] }

/**
 * Which scenes use each project palette, slot by slot: the project's default background and sprite palettes,
 * every scene that sets its own, and the scenes whose blank slots take a default. Also palettes with the same
 * four colors as another. A palette with no use is unused by every scene (it may still be picked in events).
 */
export function paletteUsage(project: string): PaletteUsage[] {
  const palettes = listPalettes(project);
  const usage = new Map(palettes.map((palette) => [palette.id, { id: palette.id, uses: [] as PaletteUse[], sameColors: [] as string[] }]));
  const settings = readJson(join(project, "project/settings.gbsres"));
  const defaults = { background: idList(settings?.defaultBackgroundPaletteIds), sprite: idList(settings?.defaultSpritePaletteIds) };
  for (const kind of ["background", "sprite"] as const) defaults[kind].forEach((id, slot) => usage.get(id)?.uses.push({ kind, slot, scene: null }));
  const scenesDir = join(project, "project/scenes");
  if (existsSync(scenesDir)) {
    for (const folder of readdirSync(scenesDir).sort()) {
      const scene = readJson(join(scenesDir, folder, "scene.gbsres"));
      if (!scene) continue;
      const name = typeof scene.name === "string" && scene.name ? scene.name : folder;
      for (const [kind, field] of [["background", "paletteIds"], ["sprite", "spritePaletteIds"]] as const) {
        const own = idList(scene[field]);
        for (let slot = 0; slot < 8; slot += 1) {
          const id = own[slot] || defaults[kind][slot];
          if (id) usage.get(id)?.uses.push({ kind, slot, scene: name, ...(own[slot] ? {} : { inherited: true }) });
        }
      }
    }
  }
  for (const palette of palettes) {
    usage.get(palette.id)!.sameColors = palettes.filter((other) => other.id !== palette.id && other.colors.join() === palette.colors.join()).map((other) => other.id);
  }
  return [...usage.values()];
}

/** What GB Cartographer needs besides the pixels: the file's time and size, and for backgrounds and sprites their palette slots. */
export function assetInfo(project: string, kind: AssetKind, path: string): AssetInfo {
  const size = pngSizeOfFile(path) ?? { width: 0, height: 0 };
  const hasSidecar = kind !== "fonts" && kind !== "ui" && existsSync(`${path}.gbsres`);
  const sidecar = hasSidecar ? readJson(`${path}.gbsres`) : null;
  const id = typeof sidecar?.id === "string" ? sidecar.id : undefined;
  let tileColors: number[] = [];
  let source: SlotSource | null = null;
  if (kind === "backgrounds" || kind === "tilesets") {
    // GB Studio 4 tilesets carry tileColors like backgrounds; they belong to no scene, so the slots are the project's defaults.
    if (typeof sidecar?.tileColors === "string" && sidecar.tileColors) {
      try {
        tileColors = decodeTileColors(sidecar.tileColors);
      } catch {
        tileColors = [];
      }
    }
    source = slotSource(project, kind, id);
  } else if (kind === "sprites") {
    if (sidecar) tileColors = spriteCellColors(sidecar, Math.ceil(size.width / 8), Math.ceil(size.height / 8));
    source = slotSource(project, kind, id);
  }
  const slots = source ? resolveScenePaletteIds(source.ids, source.defaults) : [];
  return { mtime: statSync(path).mtimeMs, width: size.width, height: size.height, tileColors, slots, animSpeed: kind === "sprites" && typeof sidecar?.animSpeed === "number" ? sidecar.animSpeed : null, slotScene: source?.scene ?? null, autoColor: sidecar?.autoColor === true, metaMtime: hasSidecar ? statSync(`${path}.gbsres`).mtimeMs : null, animations: kind === "sprites" && sidecar ? spriteAnimations(sidecar) : [] };
}

/** Reads a sidecar for writing: it must exist and be unchanged since `expectedMtime` (unless forced). */
function openSidecar(path: string, what: string, expectedMtime: number | null, force: boolean): { sidecar: string; meta: Record<string, unknown>; mtime: number } {
  const sidecar = `${path}.gbsres`;
  if (!existsSync(sidecar)) throw new AssetWriteError(`This ${what} has no .gbsres file to hold its palettes.`, 400);
  const meta = readJson(sidecar);
  if (!meta) throw new AssetWriteError(`The ${what}'s .gbsres file could not be read.`, 400);
  expectType(meta, what === "sprite sheet" ? "sprite" : what, sidecar);
  const mtime = statSync(sidecar).mtimeMs;
  if (!force && expectedMtime !== null && Math.abs(mtime - expectedMtime) > 1) throw new AssetWriteError(`The ${what}'s palettes changed on disk since it was opened.`, 409, mtime);
  return { sidecar, meta, mtime };
}

/**
 * Refuses to write a file whose `_resourceType` is not the one expected (a GB Studio version that changed its
 * formats, or the wrong file): GB Cartographer only rewrites files it understands. A file without the field passes.
 */
function expectType(meta: Record<string, unknown>, type: string, file: string) {
  const found = meta._resourceType;
  if (found !== undefined && found !== type) throw new AssetWriteError(`${basename(file)} is a "${String(found)}" file, not a "${type}": GB Cartographer leaves it alone.`, 400);
}

/** Writes a sidecar back as GB Studio writes it (two-space JSON, no trailing newline), after copying the old one to the backup folder. */
function writeSidecar(sidecar: string, meta: Record<string, unknown>, backup: Backup): number {
  backupFile(backup.dir, backup.project, sidecar);
  const text = JSON.stringify(meta, null, 2);
  const temp = `${sidecar}.saving`;
  try {
    writeFileSync(temp, text);
    renameSync(temp, sidecar);
  } catch {
    try { if (existsSync(temp)) unlinkSync(temp); } catch { /* nothing more to do */ }
    writeFileSync(sidecar, text);
  }
  return statSync(sidecar).mtimeMs;
}

/**
 * Writes a sprite sheet's per-cell palette slots into its sidecar: every 8 × 16 slice whose top cell (or, failing
 * that, bottom cell) has a slot gets that `paletteIndex`; other tiles and every other field are kept. Returns
 * whether anything changed and how many tiles did.
 */
export function writeSpritePalettes(path: string, slots: readonly (number | null)[], backup: Backup, expectedMtime: number | null, force: boolean): { mtime: number; changed: boolean; cells: number } {
  const { sidecar, meta, mtime } = openSidecar(path, "sprite sheet", expectedMtime, force);
  const size = pngSizeOfFile(path) ?? { width: 0, height: 0 };
  const cw = Math.ceil(size.width / 8), ch = Math.ceil(size.height / 8);
  let cells = 0;
  for (const tile of spriteTiles(meta)) {
    const covered = sliceCells(tile, cw, ch);
    if (!covered) continue;
    const slot = slots[covered[0]] ?? (covered[1] >= 0 ? slots[covered[1]] : null) ?? null;
    if (slot === null || slot === (tile.paletteIndex ?? 0)) continue;
    tile.paletteIndex = slot;
    cells += 1;
  }
  if (!cells) return { mtime, changed: false, cells: 0 };
  return { mtime: writeSidecar(sidecar, meta, backup), changed: true, cells };
}

/**
 * Every project file (under project/, other than the palette's own) that mentions a palette id: scene slots, the
 * defaults, and events that switch palettes. Paths inside the project.
 */
export function paletteMentions(project: string, id: string): string[] {
  const found: string[] = [];
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".gbsres") || entry.name.endsWith(".gbsproj")) {
        const text = readFileSync(path, "utf8");
        if (text.includes(id) && !(readJsonCached(path)?.id === id && readJsonCached(path)?._resourceType === "palette")) found.push(path.slice(project.length + 1).split("\\").join("/"));
      }
    }
  };
  if (existsSync(join(project, "project"))) walk(join(project, "project"));
  return found;
}

/**
 * Takes an unused palette out of the project: refused (409, with where it is used) when any scene, default or
 * event mentions it. The file goes to the backups folder (Backups… can put it back) and is then removed.
 */
export function removePalette(project: string, id: string, backup: Backup): { file: string } {
  const folder = join(project, "project", "palettes");
  const file = existsSync(folder) ? readdirSync(folder).find((entry) => entry.endsWith(".gbsres") && readJson(join(folder, entry))?.id === id) : undefined;
  if (!file) throw new AssetWriteError("No palette with that id in the project.", 404);
  expectType(readJson(join(folder, file))!, "palette", join(folder, file));
  const uses = paletteMentions(project, id);
  if (uses.length) throw new AssetWriteError(`It is still used by ${uses.slice(0, 3).join(", ")}${uses.length > 3 ? ` and ${uses.length - 3} more` : ""}.`, 409);
  backupFile(backup.dir, backup.project, join(folder, file));
  unlinkSync(join(folder, file));
  return { file };
}

/**
 * Puts a project palette into one of an asset's eight slots (`slot` 0–7): the scene's palette list
 * (`paletteIds` / `spritePaletteIds`) when a scene shows the asset, else the project's default palettes in
 * settings.gbsres. Every other field is kept; the old file is copied to the backup folder first. Returns the
 * asset's new slots and the scene written (null: the defaults).
 */
export function writePaletteSlot(project: string, kind: AssetKind, path: string, slot: number, paletteId: string, backup: Backup, expected?: string): { slots: string[]; scene: string | null } {
  if (kind === "fonts") throw new AssetWriteError("Fonts have no palette slots.", 400);
  if (!Number.isInteger(slot) || slot < 0 || slot > 7) throw new AssetWriteError("slot must be 0–7", 400);
  if (!listPalettes(project).some((palette) => palette.id === paletteId)) throw new AssetWriteError("No palette with that id in the project.", 404);
  const source = slotSource(project, kind, assetId(path));
  const meta = readJson(source.file);
  if (!meta) throw new AssetWriteError(source.scene ? `The scene file of ${source.scene} could not be read.` : "The project's settings.gbsres could not be read.", 400);
  expectType(meta, source.scene ? "scene" : "settings", source.file);
  // `expected` is the palette the user saw in that slot: if GB Studio (or another window) changed it since, ask first.
  const shown = resolveScenePaletteIds(source.ids, source.defaults)[slot];
  if (expected !== undefined && expected !== shown) throw new AssetWriteError(`Slot ${slot + 1} changed on disk since it was shown.`, 409, undefined, shown);
  const ids = Array.from({ length: 8 }, (_, at) => source.ids[at] ?? (source.scene ? "" : source.defaults[at] ?? ""));
  if (ids[slot] !== paletteId) {
    ids[slot] = paletteId;
    writeSidecar(source.file, { ...meta, [source.field]: ids }, backup);
  }
  const after = slotSource(project, kind, assetId(path));
  return { slots: resolveScenePaletteIds(after.ids, after.defaults), scene: after.scene };
}

/** A GB Studio palette file name: lowercase, spaces as "_", other odd characters dropped (like GB Studio's own). */
export function paletteFileName(name: string): string {
  const base = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
  return base || "palette";
}

/**
 * Adds a palette to the project as project/palettes/<name>.gbsres with a fresh id (a numbered file name when the
 * name is taken), or, with `id`, rewrites that palette's name and colors in place (other fields kept, the old
 * file copied to the backup folder first). Colors are four "#RRGGBB" strings, lightest first.
 */
export function writePalette(project: string, palette: { id?: string; name: string; colors: string[] }, backup: Backup, expectedMtime: number | null = null, force = false): { id: string; file: string; mtime: number } {
  const folder = join(project, "project", "palettes");
  const colors = palette.colors.map((color) => color.replace(/^#/, "").toLowerCase());
  if (colors.length !== 4 || colors.some((color) => !/^[0-9a-f]{6}$/.test(color))) throw new AssetWriteError("A palette needs four #RRGGBB colors.", 400);
  const name = palette.name.trim();
  if (!name) throw new AssetWriteError("A palette needs a name.", 400);
  mkdirSync(folder, { recursive: true });
  if (palette.id) {
    for (const file of readdirSync(folder).filter((entry) => entry.endsWith(".gbsres"))) {
      const meta = readJson(join(folder, file));
      if (meta?.id !== palette.id) continue;
      expectType(meta, "palette", join(folder, file));
      const mtime = statSync(join(folder, file)).mtimeMs;
      if (!force && expectedMtime !== null && Math.abs(mtime - expectedMtime) > 1) throw new AssetWriteError(`${typeof meta.name === "string" ? meta.name : "The palette"} changed on disk since the project was read.`, 409, mtime);
      return { id: palette.id, file, mtime: writeSidecar(join(folder, file), { ...meta, name, colors }, backup) };
    }
    throw new AssetWriteError("No palette with that id in the project.", 404);
  }
  const base = paletteFileName(name);
  let file = `${base}.gbsres`;
  for (let n = 2; existsSync(join(folder, file)); n += 1) file = `${base}_${n}.gbsres`;
  const id = randomUUID();
  writeFileSync(join(folder, file), JSON.stringify({ _resourceType: "palette", id, name, colors }, null, 2), { flag: "wx" });
  return { id, file, mtime: statSync(join(folder, file)).mtimeMs };
}

/**
 * The asset as GB Studio would show it: each tile in the palette its slot gives it (backgrounds and sprite
 * sheets; sprites through colors 1–3 with key green see-through), plain greens otherwise. A small PNG for the
 * project panel's thumbnails.
 */
export function renderPreview(project: string, kind: AssetKind, path: string): Uint8Array {
  const { rgba, width, height } = previewPixels(project, kind, path);
  return encodePng(rgba, width, height, (bytes) => deflateSync(bytes));
}

/** What the project's palettes and slots look like now: changes when any palette, scene or the settings change. */
function projectStamp(project: string): string {
  const times: number[] = [];
  const add = (path: string) => { try { times.push(statSync(path).mtimeMs); } catch { /* gone */ } };
  add(join(project, "project/settings.gbsres"));
  for (const sub of ["project/palettes", "project/scenes"]) {
    const folder = join(project, sub);
    if (!existsSync(folder)) continue;
    for (const entry of readdirSync(folder)) {
      if (!sub.endsWith("scenes")) { add(join(folder, entry)); continue; }
      add(join(folder, entry, "scene.gbsres"));
      // A scene's actors decide which sprite palettes a sheet is shown with.
      const actors = join(folder, entry, "actors");
      if (existsSync(actors)) for (const actor of readdirSync(actors)) add(join(actors, actor));
    }
  }
  return createHash("sha1").update(times.join(",")).digest("hex").slice(0, 12);
}

/** Rendered previews, by file, file times and project stamp (a big project's thumbnails are drawn once). */
const previewCache = new Map<string, { rgba: Uint8ClampedArray; width: number; height: number }>();
function previewPixels(project: string, kind: AssetKind, path: string, stamp = projectStamp(project)): { rgba: Uint8ClampedArray; width: number; height: number } {
  const sidecar = `${path}.gbsres`;
  const key = `${path}|${statSync(path).mtimeMs}|${existsSync(sidecar) ? statSync(sidecar).mtimeMs : 0}|${stamp}`;
  const hit = previewCache.get(key);
  if (hit) return hit;
  const made = drawPreview(project, kind, path);
  if (previewCache.size > 4000) previewCache.clear();
  previewCache.set(key, made);
  return made;
}

export interface SheetCell { file: string; x: number; y: number; w: number; h: number }
const sheetCache = new Map<string, { stamp: string; cells: SheetCell[]; width: number; height: number; png: Uint8Array }>();

/**
 * Every picture of one kind on one sheet (one request for a whole folder of thumbnails): each preview is shrunk to
 * fit a 128 × 128 square (never enlarged), in a grid. `stamp` changes whenever any picture, palette or scene does.
 */
export function previewSheet(project: string, kind: AssetKind): { stamp: string; cells: SheetCell[]; width: number; height: number; png: Uint8Array } {
  const CELL = 128, COLUMNS = 16;
  const assets = listAssets(project).filter((asset) => asset.kind === kind);
  const projectTimes = projectStamp(project);
  // The layout is part of the stamp: a sheet cached by the browser under an old layout is never reused.
  const stamp = createHash("sha1").update(`sheet-v1-${CELL}-${COLUMNS}|${projectTimes}|${assets.map((asset) => `${asset.file}:${asset.mtime}:${existsSync(`${join(project, "assets", kind, asset.file)}.gbsres`) ? statSync(`${join(project, "assets", kind, asset.file)}.gbsres`).mtimeMs : 0}`).join("|")}`).digest("hex").slice(0, 16);
  const cached = sheetCache.get(`${project}|${kind}`);
  if (cached?.stamp === stamp) return cached;
  const columns = Math.max(1, Math.min(COLUMNS, assets.length)), rows = Math.max(1, Math.ceil(assets.length / COLUMNS));
  const width = columns * CELL, height = rows * CELL;
  const out = new Uint8ClampedArray(width * height * 4);
  const cells: SheetCell[] = [];
  assets.forEach((asset, index) => {
    const path = join(project, "assets", kind, asset.file);
    let preview: { rgba: Uint8ClampedArray; width: number; height: number };
    try { preview = previewPixels(project, kind, path, projectTimes); } catch { return; }
    const scale = Math.min(1, CELL / preview.width, CELL / preview.height);
    const w = Math.max(1, Math.round(preview.width * scale)), h = Math.max(1, Math.round(preview.height * scale));
    const ox = (index % COLUMNS) * CELL, oy = Math.floor(index / COLUMNS) * CELL;
    for (let y = 0; y < h; y += 1) {
      const sy = Math.min(preview.height - 1, Math.floor(y / scale));
      for (let x = 0; x < w; x += 1) {
        const sx = Math.min(preview.width - 1, Math.floor(x / scale));
        const from = (sy * preview.width + sx) * 4;
        out.set(preview.rgba.subarray(from, from + 4), ((oy + y) * width + ox + x) * 4);
      }
    }
    cells.push({ file: asset.file, x: ox, y: oy, w, h });
  });
  const sheet = { stamp, cells, width, height, png: encodePng(out, width, height, (bytes) => deflateSync(bytes)) };
  sheetCache.set(`${project}|${kind}`, sheet);
  return sheet;
}

function drawPreview(project: string, kind: AssetKind, path: string): { rgba: Uint8ClampedArray; width: number; height: number } {
  const image = decodePng(readFileSync(path), (bytes) => inflateSync(bytes));
  const info = assetInfo(project, kind, path);
  const palettes = listPalettes(project).map(({ id, name, colors }) => ({ id, name, colors }));
  const sprite = kind === "sprites", keyed = KEYED_KINDS.includes(kind);
  const picture = quantize(image.pixels, image.width, image.height, palettes, keyed, kind === "fonts");
  if (info.tileColors.length) assignSlots(picture.cells, info.tileColors, info.slots, picture.palettes);
  const shown = picture.palettes.map((palette) => ({ ...palette, colors: sprite ? spriteShades(palette.colors) : palette.colors }));
  const rgba = toRgba(picture.pixels, picture.cells, image.width, shown, sprite && !picture.hasAlpha ? KEY_GREEN : undefined);
  if (sprite) {
    // A sprite sheet's thumbnail is its first frame, put together from its slices (or the sheet's first square).
    const frame = info.animations[0]?.frames[0];
    const tiles = frame?.tiles.length ? frame.tiles : [{ x: 0, y: 0, sliceX: 0, sliceY: 0, flipX: false, flipY: false }, { x: 8, y: 0, sliceX: 8, sliceY: 0, flipX: false, flipY: false }];
    const width = Math.max(8, ...tiles.map((tile) => tile.x + 8)), height = Math.max(16, ...tiles.map((tile) => tile.y + 16));
    const out = new Uint8ClampedArray(width * height * 4);
    for (const tile of tiles) {
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const sx = tile.sliceX + (tile.flipX ? 7 - x : x), sy = tile.sliceY + (tile.flipY ? 15 - y : y);
          const dx = tile.x + x, dy = tile.y + y;
          if (sx >= image.width || sy >= image.height || dx < 0 || dy < 0 || dx >= width || dy >= height) continue;
          const from = (sy * image.width + sx) * 4, to = (dy * width + dx) * 4;
          if (rgba[from + 3] === 0) continue;
          out.set(rgba.subarray(from, from + 4), to);
        }
      }
    }
    return { rgba: out, width, height };
  }
  return { rgba, width: image.width, height: image.height };
}

export class AssetWriteError extends Error {
  constructor(message: string, public status: number, public mtime?: number, public current?: string) {
    super(message);
  }
}

/**
 * Writes a background's per-tile palette slots into its sidecar's `tileColors`: each entry of `slots` is the
 * slot (0–7) for that cell, or null to leave the cell as it is. Every other attribute bit (priority, flips) and
 * every other field of the sidecar are kept; the file is written back as GB Studio writes it (two-space JSON, no
 * trailing newline). The old sidecar is copied to the backup folder first. Returns whether anything changed.
 */
export function writeTileColors(path: string, slots: readonly (number | null)[], backup: Backup, expectedMtime: number | null, force: boolean, kind: "backgrounds" | "tilesets" = "backgrounds", priority: readonly (boolean | null)[] = []): { mtime: number; changed: boolean; cells: number } {
  const { sidecar, meta, mtime } = openSidecar(path, kind === "tilesets" ? "tileset" : "background", expectedMtime, force);
  const size = pngSizeOfFile(path) ?? { width: 0, height: 0 };
  const count = Math.ceil(size.width / 8) * Math.ceil(size.height / 8);
  const current = typeof meta.tileColors === "string" && meta.tileColors ? decodeTileColors(meta.tileColors) : [];
  const values = Array.from({ length: count }, (_, cell) => current[cell] ?? 0);
  let cells = 0;
  slots.slice(0, count).forEach((slot, cell) => {
    if (slot === null || slot === undefined) return;
    const next = (values[cell] & ~7) | (slot & 7);
    if (next !== values[cell]) cells += 1;
    values[cell] = next;
  });
  // Bit 7: the tile draws over sprites (GB Studio's priority flag). null leaves it as it is.
  priority.slice(0, count).forEach((on, cell) => {
    if (on === null || on === undefined) return;
    const next = on ? values[cell] | 0x80 : values[cell] & ~0x80;
    if (next !== values[cell]) cells += 1;
    values[cell] = next;
  });
  const encoded = encodeTileColors(values);
  if (encoded === (typeof meta.tileColors === "string" ? meta.tileColors : "")) return { mtime, changed: false, cells: 0 };
  return { mtime: writeSidecar(sidecar, { ...meta, tileColors: encoded }, backup), changed: true, cells };
}

/**
 * Adds a new picture to the project: `assets/<kind>/<name>.png`, `bytes` a PNG in whole 8 × 8 tiles. The name is
 * a plain file name (letters, digits, spaces, - _ ( ) .); an existing file is never replaced. No sidecar is
 * written: GB Studio makes one when it next reads the folder. Returns the file name.
 */
export function createAsset(project: string, kind: AssetKind, name: string, bytes: Buffer): { file: string } {
  const size = pngSize(bytes);
  if (!size) throw new AssetWriteError("Not a PNG", 400);
  if (size.width % 8 || size.height % 8 || !size.width || !size.height) throw new AssetWriteError("A new picture must be whole 8 × 8 tiles.", 400);
  const base = name.trim().replace(/\.png$/i, "");
  if (!base || !/^[\w ()\-.]+$/.test(base) || base.startsWith(".")) throw new AssetWriteError("Use a plain name: letters, digits, spaces, - _ ( ) and dots.", 400);
  const folder = join(project, "assets", kind);
  const file = `${base}.png`;
  mkdirSync(folder, { recursive: true });
  try {
    writeFileSync(join(folder, file), bytes, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new AssetWriteError(`assets/${kind}/${file} already exists.`, 409);
    throw error;
  }
  return { file };
}

/**
 * Overwrites an asset PNG with `bytes`: same size as the file it replaces (sprite frames and scene sizes are
 * indexed by position), unchanged on disk since `expectedMtime` unless `force`, and the old file backed up first
 * (backups.ts). Returns the new modification time and the backup's path.
 */
export function writeAsset(path: string, bytes: Buffer, backup: Backup, expectedMtime: number | null, force: boolean, resize = false): { mtime: number; backup: string | null } {
  const size = pngSize(bytes);
  if (!size) throw new AssetWriteError("Not a PNG", 400);
  const current = pngSizeOfFile(path);
  // A new size only when the user resized on purpose (`resize`), in whole tiles.
  if (resize && (size.width % 8 || size.height % 8)) throw new AssetWriteError("A resized picture must be whole 8 × 8 tiles.", 400);
  if (!resize && current && (current.width !== size.width || current.height !== size.height)) throw new AssetWriteError(`The file on disk is ${current.width} × ${current.height} px; a GB Studio asset keeps its size (this picture is ${size.width} × ${size.height}).`, 400);
  const mtime = statSync(path).mtimeMs;
  if (!force && expectedMtime !== null && Math.abs(mtime - expectedMtime) > 1) throw new AssetWriteError("The file changed on disk since it was opened.", 409, mtime);
  const copy = backupFile(backup.dir, backup.project, path);
  const temp = `${path}.saving`;
  try {
    writeFileSync(temp, bytes);
    renameSync(temp, path);
  } catch {
    try { if (existsSync(temp)) unlinkSync(temp); } catch { /* nothing more to do */ }
    writeFileSync(path, bytes);
  }
  return { mtime: statSync(path).mtimeMs, backup: copy };
}

export interface HealthIssue { level: "problem" | "warning" | "note"; kind: AssetKind | "palettes" | "project"; file?: string; title: string; detail: string }

/** Unique tile counts by file time (decoding every background is the slow part of a health check). */
const tileCountCache = new Map<string, number>();

/**
 * A project health check: what GB Studio will complain about or quietly do differently. Backgrounds over the tile
 * budget of the project's color mode, pictures that are not whole tiles (or the size GB Studio expects), tiles in
 * slot 8 (the UI palette), pictures GB Studio hasn't read yet (no sidecar), and palettes that are unused, twins or
 * low in contrast. Read only.
 */
export function projectHealth(project: string): { colorMode: string; issues: HealthIssue[] } {
  const settings = readJson(join(project, "project/settings.gbsres")) ?? {};
  const colorMode = typeof settings.colorMode === "string" ? settings.colorMode : "mono";
  const spriteMode = settings.spriteMode === "8x8" ? "8x8" : "8x16";
  const colorOnly = colorMode === "color", limit = colorOnly ? 384 : 192;
  const issues: HealthIssue[] = [];
  const palettes = listPalettes(project);
  if (colorMode === "mono" && palettes.length) issues.push({ level: "warning", kind: "project", title: "Color mode is off", detail: `The project is monochrome${typeof settings.colorMode === "string" ? "" : " (settings.gbsres has no colorMode, so GB Studio uses mono)"}: GB Studio shows the greens and none of the ${palettes.length} palettes. Turn on color in GB Studio's settings (Color only or GB + Color).` });
  const assets = listAssets(project);
  for (const asset of assets) {
    const path = join(project, "assets", asset.kind, asset.file);
    const where = { kind: asset.kind, file: asset.file };
    if (asset.kind !== "ui" && !existsSync(`${path}.gbsres`)) issues.push({ level: "note", ...where, title: "Not read by GB Studio yet", detail: "There is no .gbsres beside it: GB Studio adds one when it next opens the project." });
    const tall = asset.kind === "sprites" && spriteMode === "8x16" ? 16 : 8;
    if (asset.width % 8 || asset.height % tall) issues.push({ level: "problem", ...where, title: "Not whole tiles", detail: `${asset.width} × ${asset.height} px is not a whole number of 8 × ${tall} tiles; GB Studio cuts or pads the edge.` });
    if ((asset.kind === "emotes" || asset.kind === "avatars") && (asset.width !== 16 || asset.height !== 16)) issues.push({ level: "problem", ...where, title: "Should be 16 × 16", detail: `GB Studio expects ${asset.kind === "emotes" ? "emotes" : "avatars"} of 16 × 16 px; this one is ${asset.width} × ${asset.height}.` });
    if (asset.kind === "ui") {
      const want = asset.file === "frame.png" ? [24, 24] : asset.file === "cursor.png" ? [8, 8] : null;
      if (want && (asset.width !== want[0] || asset.height !== want[1])) issues.push({ level: "problem", ...where, title: `Should be ${want[0]} × ${want[1]}`, detail: `GB Studio reads ${asset.file} as ${want[0]} × ${want[1]} px; this one is ${asset.width} × ${asset.height}.` });
    }
    if (asset.kind !== "backgrounds") continue;
    if (asset.width < 160 || asset.height < 144) issues.push({ level: "warning", ...where, title: "Smaller than the screen", detail: `${asset.width} × ${asset.height} px is smaller than one 160 × 144 screen; GB Studio fills the rest of the scene.` });
    const key = `${path}|${asset.mtime}|${colorOnly}`;
    let tiles = tileCountCache.get(key);
    if (tiles === undefined) {
      try {
        const image = decodePng(readFileSync(path), (bytes) => inflateSync(bytes));
        tiles = countUniqueTiles(quantize(image.pixels, image.width, image.height).pixels, image.width, image.height, colorOnly);
        tileCountCache.set(key, tiles);
      } catch {
        tiles = -1;
      }
    }
    if (tiles > limit) issues.push({ level: "problem", ...where, title: `${tiles} tiles, over ${limit}`, detail: `GB Studio allows ${limit} different tiles per background in ${colorOnly ? "Color only" : colorMode === "mixed" ? "GB + Color" : "monochrome"} mode; this one has ${tiles - limit} too many.` });
    else if (tiles > limit * 0.9) issues.push({ level: "note", ...where, title: `${tiles} of ${limit} tiles`, detail: "Close to the tile budget." });
    const sidecar = readJson(`${path}.gbsres`);
    if (colorMode !== "mono" && typeof sidecar?.tileColors === "string" && sidecar.tileColors) {
      let ui = 0;
      try { ui = decodeTileColors(sidecar.tileColors).filter((value) => value >= 0 && (value & 7) === 7).length; } catch { ui = 0; }
      if (ui) issues.push({ level: "warning", ...where, title: `${ui} tile${ui === 1 ? "" : "s"} in slot 8`, detail: "Slot 8 is the UI palette (dialogue and menus); tiles there change when it does." });
    }
  }
  const usage = paletteUsage(project);
  const byId = new Map(palettes.map((palette) => [palette.id, palette]));
  for (const entry of usage) {
    const palette = byId.get(entry.id);
    if (!palette) continue;
    if (!entry.uses.length) issues.push({ level: "note", kind: "palettes", file: palette.name, title: "Unused palette", detail: "No scene or default uses it (an event may still switch to it)." });
    const twin = entry.sameColors.map((id) => byId.get(id)?.name).filter(Boolean);
    if (twin.length && palette.name.localeCompare(String(twin[0])) < 0) issues.push({ level: "note", kind: "palettes", file: palette.name, title: "Same colors as another", detail: `The same four colors as ${twin.join(", ")}.` });
    // A palette used only for sprites shows colors 1–3 (color 0 is see-through), so only those are compared.
    const spriteOnly = entry.uses.length > 0 && entry.uses.every((use) => use.kind === "sprite");
    const close = closeShades(palette.colors, spriteOnly);
    if (close.length) issues.push({ level: "warning", kind: "palettes", file: palette.name, title: "Low contrast", detail: close.map(({ a, b, delta }) => delta === 0 ? `colors ${a + 1} and ${b + 1} are the same color` : `colors ${a + 1} and ${b + 1} differ by ${delta}`).join("; ") + " (aim for a difference of 12 or more)." });
  }
  const order = { problem: 0, warning: 1, note: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  return { colorMode, issues };
}

/**
 * What a dialogue preview needs from the project: the color mode, the UI palette (background slot 8 of the
 * defaults) and the default font, with every font's id. Read only.
 */
export function dialogueSettings(project: string): { colorMode: string; uiPalette: string[] | null; defaultFont: string | null; fonts: { file: string; name: string; id: string | null }[] } {
  const settings = readJson(join(project, "project/settings.gbsres")) ?? {};
  const colorMode = typeof settings.colorMode === "string" ? settings.colorMode : "mono";
  const ui = idList(settings.defaultBackgroundPaletteIds)[7];
  const uiPalette = colorMode !== "mono" && ui ? listPalettes(project).find((palette) => palette.id === ui)?.colors ?? null : null;
  const fonts = listAssets(project).filter((asset) => asset.kind === "fonts").map((asset) => {
    const id = readJson(join(project, "assets", "fonts", `${asset.file}.gbsres`))?.id;
    return { file: asset.file, name: asset.name, id: typeof id === "string" ? id : null };
  });
  const defaultFont = fonts.find((font) => font.id && font.id === settings.defaultFontId)?.file ?? fonts[0]?.file ?? null;
  return { colorMode, uiPalette, defaultFont, fonts };
}
