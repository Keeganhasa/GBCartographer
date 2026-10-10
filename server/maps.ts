/**
 * Map Room layouts: grids of screens (each a project background) for Zelda-style maps. GB Cartographer keeps them
 * in its own data folder, one JSON file per project (keyed like the backups), never inside the GB Studio project.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { projectBackupDir } from "./backups";

export interface MapCell { x: number; y: number; file: string }
export interface MapLayout { id: string; name: string; screen: { width: number; height: number }; /** Tiles neighbouring screens share at each edge (1 or 2). */ overlap?: number; cells: MapCell[] }

/** Where a project's maps are kept: <data>/maps/<project key>.json. */
export function mapsFile(dataDir: string, project: string): string {
  return join(dataDir, "maps", `${basename(projectBackupDir("", project))}.json`);
}

export function readMaps(dataDir: string, project: string): MapLayout[] {
  const file = mapsFile(dataDir, project);
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as { maps?: unknown };
    return Array.isArray(data.maps) ? data.maps.filter(isMap) : [];
  } catch {
    return [];
  }
}

function isMap(value: unknown): value is MapLayout {
  const map = value as MapLayout;
  return Boolean(map) && typeof map.id === "string" && typeof map.name === "string" && Array.isArray(map.cells)
    && map.cells.every((cell) => Number.isInteger(cell?.x) && Number.isInteger(cell?.y) && typeof cell?.file === "string" && /^[^/\\]+\.png$/i.test(cell.file));
}

/** Saves all of a project's maps (through a temporary file). Refuses anything that isn't a list of maps. */
export function writeMaps(dataDir: string, project: string, maps: unknown): MapLayout[] {
  if (!Array.isArray(maps) || !maps.every(isMap)) throw new Error("Not a list of maps");
  const clean = maps.map((map) => ({ id: map.id, name: map.name.trim() || "Map", screen: { width: 160, height: 144 }, overlap: map.overlap === 2 ? 2 : 1, cells: map.cells.map(({ x, y, file }) => ({ x, y, file })) }));
  const file = mapsFile(dataDir, project);
  mkdirSync(join(dataDir, "maps"), { recursive: true });
  writeFileSync(`${file}.saving`, JSON.stringify({ maps: clean }, null, 2));
  renameSync(`${file}.saving`, file);
  return clean;
}
