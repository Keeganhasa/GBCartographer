/**
 * Map Room layouts: grids of screens (each a project background) for Zelda-style maps. They live in the project, in
 * GB Cartographer's own folder (Cartographer/maps.json, approved by the author 2026-10-10), so they travel with it;
 * GB Studio doesn't read that folder. Layouts kept in the app's data folder before then move there on first read.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { OWN_FOLDER, ownFolderReadme } from "./assets";
import { backupFile, projectBackupDir } from "./backups";

export interface MapCell { x: number; y: number; file: string }
export interface MapLayout { id: string; name: string; screen: { width: number; height: number }; /** Tiles neighbouring screens share at each edge (1 or 2). */ overlap?: number; cells: MapCell[] }

/** Where a project's maps are kept: <project>/Cartographer/maps.json. */
export function mapsFile(project: string): string {
  return join(project, OWN_FOLDER, "maps.json");
}

/** Where they were kept before (the app's data folder, one file per project, keyed like the backups). */
function oldMapsFile(dataDir: string, project: string): string {
  return join(dataDir, "maps", `${basename(projectBackupDir("", project))}.json`);
}

function parseMaps(file: string): MapLayout[] {
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as { maps?: unknown };
    return Array.isArray(data.maps) ? data.maps.filter(isMap) : [];
  } catch {
    return [];
  }
}

export function readMaps(dataDir: string, project: string): MapLayout[] {
  const file = mapsFile(project);
  if (existsSync(file)) return parseMaps(file);
  // Layouts from before maps moved into the project: write them there once, and set the old file aside.
  const old = oldMapsFile(dataDir, project);
  if (!existsSync(old)) return [];
  const maps = parseMaps(old);
  if (maps.length) save(project, maps);
  renameSync(old, `${old}.moved-to-project`);
  return maps;
}

function isMap(value: unknown): value is MapLayout {
  const map = value as MapLayout;
  return Boolean(map) && typeof map.id === "string" && typeof map.name === "string" && Array.isArray(map.cells)
    && map.cells.every((cell) => Number.isInteger(cell?.x) && Number.isInteger(cell?.y) && typeof cell?.file === "string" && /^[^/\\]+\.png$/i.test(cell.file));
}

function save(project: string, maps: MapLayout[]) {
  const file = mapsFile(project);
  mkdirSync(join(project, OWN_FOLDER), { recursive: true });
  ownFolderReadme(project);
  writeFileSync(`${file}.saving`, `${JSON.stringify({ maps }, null, 2)}\n`);
  renameSync(`${file}.saving`, file);
}

/**
 * Saves all of a project's maps (through a temporary file), the previous maps.json backed up first. Refuses
 * anything that isn't a list of maps.
 */
export function writeMaps(project: string, maps: unknown, backup: { dir: string; project: string }): MapLayout[] {
  if (!Array.isArray(maps) || !maps.every(isMap)) throw new Error("Not a list of maps");
  const clean = maps.map((map) => ({ id: map.id, name: map.name.trim() || "Map", screen: { width: 160, height: 144 }, overlap: map.overlap === 2 ? 2 : 1, cells: map.cells.map(({ x, y, file }) => ({ x, y, file })) }));
  if (existsSync(mapsFile(project))) backupFile(backup.dir, backup.project, mapsFile(project));
  save(project, clean);
  return clean;
}
