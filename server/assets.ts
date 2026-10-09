/**
 * GB Cartographer's window into a GB Studio project: the PNGs under assets/ (backgrounds, sprites, tilesets), the
 * project's palettes, and the one write the tool is allowed: overwriting an existing asset PNG with one of the
 * same size, after copying the old file to the backup folder. Project JSON (.gbsres, .gbsproj) is only ever read.
 */
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { decodeTileColors, encodeTileColors, resolveScenePaletteIds } from "../src/gb/gbstudio";

export const ASSET_KINDS = ["backgrounds", "sprites", "tilesets"] as const;
export type AssetKind = typeof ASSET_KINDS[number];

export interface AssetEntry { kind: AssetKind; file: string; name: string; width: number; height: number; mtime: number }
export interface ProjectPalette { id: string; name: string; colors: string[] }
/**
 * What GB Cartographer needs besides the pixels. `tileColors`: one attribute per 8 × 8 cell whose low three bits are the
 * palette slot (a background's sidecar `tileColors`; for a sprite sheet, each 8 × 16 slice's `paletteIndex` on
 * the two cells it covers, -1 on cells no slice uses). `slots`: the eight palette ids those slots mean (the
 * scene's background palettes, or the project's sprite palettes). `metaMtime`: the sidecar's time, or null.
 */
export interface AssetInfo { mtime: number; width: number; height: number; tileColors: number[]; slots: string[]; metaMtime: number | null }

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

/** Every PNG under assets/backgrounds, sprites and tilesets, with its sidecar's name and the PNG's size. */
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
    palettes.push({ id: palette.id, name: typeof palette.name === "string" ? palette.name : file.replace(/\.gbsres$/, ""), colors: colors.map((color) => `#${color.replace(/^#/, "").toUpperCase()}`) });
  }
  return palettes.sort((a, b) => a.name.localeCompare(b.name));
}

/** The eight background palette ids of the first scene that shows this background, else the project defaults. */
function backgroundSlots(project: string, backgroundId: string | undefined): string[] {
  const settings = readJson(join(project, "project/settings.gbsres"));
  const defaults = Array.isArray(settings?.defaultBackgroundPaletteIds) ? settings.defaultBackgroundPaletteIds as string[] : [];
  const scenesDir = join(project, "project/scenes");
  if (backgroundId && existsSync(scenesDir)) {
    for (const folder of readdirSync(scenesDir).sort()) {
      const scene = readJson(join(scenesDir, folder, "scene.gbsres"));
      if (scene?.backgroundId === backgroundId) return resolveScenePaletteIds(Array.isArray(scene.paletteIds) ? scene.paletteIds as string[] : [], defaults);
    }
  }
  return resolveScenePaletteIds([], defaults);
}

/**
 * The eight sprite palette ids a sprite sheet is shown with: the first scene (by folder name) with an actor using
 * it that overrides sprite palettes, else the project's default sprite palettes. GB Studio 3 keeps actors in the
 * scene file, GB Studio 4 in the scene folder's actors/.
 */
function spriteSlots(project: string, spriteId: string | undefined): string[] {
  const settings = readJson(join(project, "project/settings.gbsres"));
  const defaults = Array.isArray(settings?.defaultSpritePaletteIds) ? settings.defaultSpritePaletteIds as string[] : [];
  const scenesDir = join(project, "project/scenes");
  if (spriteId && existsSync(scenesDir)) {
    for (const folder of readdirSync(scenesDir).sort()) {
      const scene = readJson(join(scenesDir, folder, "scene.gbsres"));
      const overrides = Array.isArray(scene?.spritePaletteIds) ? scene.spritePaletteIds as string[] : [];
      if (!overrides.some(Boolean)) continue;
      const actors: Record<string, unknown>[] = Array.isArray(scene?.actors) ? scene.actors as Record<string, unknown>[] : [];
      const actorsDir = join(scenesDir, folder, "actors");
      if (existsSync(actorsDir)) for (const file of readdirSync(actorsDir)) { const actor = readJson(join(actorsDir, file)); if (actor) actors.push(actor); }
      if (actors.some((actor) => actor.spriteSheetId === spriteId)) return resolveScenePaletteIds(overrides, defaults);
    }
  }
  return resolveScenePaletteIds([], defaults);
}

/** What GB Cartographer needs besides the pixels: the file's time and size, and for backgrounds and sprites their palette slots. */
export function assetInfo(project: string, kind: AssetKind, path: string): AssetInfo {
  const size = pngSizeOfFile(path) ?? { width: 0, height: 0 };
  const hasSidecar = kind !== "tilesets" && existsSync(`${path}.gbsres`);
  const sidecar = hasSidecar ? readJson(`${path}.gbsres`) : null;
  const id = typeof sidecar?.id === "string" ? sidecar.id : undefined;
  let tileColors: number[] = [];
  let slots: string[] = [];
  if (kind === "backgrounds") {
    if (typeof sidecar?.tileColors === "string" && sidecar.tileColors) {
      try {
        tileColors = decodeTileColors(sidecar.tileColors);
      } catch {
        tileColors = [];
      }
    }
    slots = backgroundSlots(project, id);
  } else if (kind === "sprites") {
    if (sidecar) tileColors = spriteCellColors(sidecar, Math.ceil(size.width / 8), Math.ceil(size.height / 8));
    slots = spriteSlots(project, id);
  }
  return { mtime: statSync(path).mtimeMs, width: size.width, height: size.height, tileColors, slots, metaMtime: hasSidecar ? statSync(`${path}.gbsres`).mtimeMs : null };
}

/** Reads a sidecar for writing: it must exist and be unchanged since `expectedMtime` (unless forced). */
function openSidecar(path: string, what: string, expectedMtime: number | null, force: boolean): { sidecar: string; meta: Record<string, unknown>; mtime: number } {
  const sidecar = `${path}.gbsres`;
  if (!existsSync(sidecar)) throw new AssetWriteError(`This ${what} has no .gbsres file to hold its palettes.`, 400);
  const meta = readJson(sidecar);
  if (!meta) throw new AssetWriteError(`The ${what}'s .gbsres file could not be read.`, 400);
  const mtime = statSync(sidecar).mtimeMs;
  if (!force && expectedMtime !== null && Math.abs(mtime - expectedMtime) > 1) throw new AssetWriteError(`The ${what}'s palettes changed on disk since it was opened.`, 409, mtime);
  return { sidecar, meta, mtime };
}

/** Writes a sidecar back as GB Studio writes it (two-space JSON, no trailing newline), after copying the old one to the backup folder. */
function writeSidecar(sidecar: string, kind: AssetKind, meta: Record<string, unknown>, backupDir: string): number {
  mkdirSync(join(backupDir, "gbstudio", kind), { recursive: true });
  copyFileSync(sidecar, join(backupDir, "gbstudio", kind, basename(sidecar)));
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
export function writeSpritePalettes(path: string, slots: readonly (number | null)[], backupDir: string, expectedMtime: number | null, force: boolean): { mtime: number; changed: boolean; cells: number } {
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
  return { mtime: writeSidecar(sidecar, "sprites", meta, backupDir), changed: true, cells };
}

export class AssetWriteError extends Error {
  constructor(message: string, public status: number, public mtime?: number) {
    super(message);
  }
}

/**
 * Writes a background's per-tile palette slots into its sidecar's `tileColors`: each entry of `slots` is the
 * slot (0–7) for that cell, or null to leave the cell as it is. Every other attribute bit (priority, flips) and
 * every other field of the sidecar are kept; the file is written back as GB Studio writes it (two-space JSON, no
 * trailing newline). The old sidecar is copied to the backup folder first. Returns whether anything changed.
 */
export function writeTileColors(path: string, slots: readonly (number | null)[], backupDir: string, expectedMtime: number | null, force: boolean): { mtime: number; changed: boolean; cells: number } {
  const { sidecar, meta, mtime } = openSidecar(path, "background", expectedMtime, force);
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
  const encoded = encodeTileColors(values);
  if (encoded === (typeof meta.tileColors === "string" ? meta.tileColors : "")) return { mtime, changed: false, cells: 0 };
  return { mtime: writeSidecar(sidecar, "backgrounds", { ...meta, tileColors: encoded }, backupDir), changed: true, cells };
}

/**
 * Overwrites an asset PNG with `bytes`: same size as the file it replaces (sprite frames and scene sizes are
 * indexed by position), unchanged on disk since `expectedMtime` unless `force`, and the old file copied to
 * `backupDir/gbstudio/<kind>/<file>` first. Returns the new modification time.
 */
export function writeAsset(path: string, kind: AssetKind, bytes: Buffer, backupDir: string, expectedMtime: number | null, force: boolean): { mtime: number; backup: string } {
  const size = pngSize(bytes);
  if (!size) throw new AssetWriteError("Not a PNG", 400);
  const current = pngSizeOfFile(path);
  if (current && (current.width !== size.width || current.height !== size.height)) throw new AssetWriteError(`The file on disk is ${current.width} × ${current.height} px; a GB Studio asset keeps its size (this picture is ${size.width} × ${size.height}).`, 400);
  const mtime = statSync(path).mtimeMs;
  if (!force && expectedMtime !== null && Math.abs(mtime - expectedMtime) > 1) throw new AssetWriteError("The file changed on disk since it was opened.", 409, mtime);
  const backup = join(backupDir, "gbstudio", kind, basename(path));
  mkdirSync(join(backupDir, "gbstudio", kind), { recursive: true });
  copyFileSync(path, backup);
  const temp = `${path}.saving`;
  try {
    writeFileSync(temp, bytes);
    renameSync(temp, path);
  } catch {
    try { if (existsSync(temp)) unlinkSync(temp); } catch { /* nothing more to do */ }
    writeFileSync(path, bytes);
  }
  return { mtime: statSync(path).mtimeMs, backup };
}
