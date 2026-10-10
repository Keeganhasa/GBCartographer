/**
 * Map generators (the author's ask, 2026-10-10): a cave or dungeon, and an RPG-style overworld (water, shore,
 * grass, forest, mountains, towns and roads). Each makes a grid of map cells from its settings and a seed (the same
 * settings always give the same map), then draws every cell with simple wireframe primitives in the four GB shades
 * (0 lightest … 3 darkest): placeholder art to paint over. Few distinct cells, so the tile count stays low.
 */

import { Pen } from "../wireframes/pen";
import { CAVE_THEMES, WORLD_THEMES, themeOf } from "./mapThemes";

export { OVERWORLD_PALETTES } from "./mapThemes";

/** A small seeded random generator (mulberry32): numbers in [0, 1). */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A picture in GB shades, one byte per pixel; with colors, each 8 × 8 tile's palette (1-based, 0 the greens) and those palettes. */
export interface Generated { width: number; height: number; pixels: Uint8Array; cells?: Uint8Array; palettes?: { name: string; colors: string[] }[] }

const SCREEN_W = 160, SCREEN_H = 144;
const SIDES: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** A stable per-cell number, for picking a cell's variant without moving every other cell when a setting changes. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// ---- cave and dungeon -------------------------------------------------------------------------------------------------

export interface CaveSettings {
  style: "cave" | "dungeon";
  /** Size in GB screens (160 × 144 each). */
  columns: number; rows: number;
  /** Pixels per map cell: 16 (2 × 2 tiles) or 8 (one tile). */
  cell: 8 | 16;
  seed: number;
  /** Cave: how much starts as rock (percent). */
  fill: number;
  /** Cave: smoothing passes (more: rounder, fewer specks). */
  smooth: number;
  /** Dungeon: rooms to try for, and their typical size in cells. */
  rooms: number; roomSize: number;
  /** Cave: keep only the biggest open area, so every floor cell can be reached. */
  connected: boolean;
  /** Stairs at two far-apart floor cells (a way in and a way on). */
  stairs: boolean;
  /** The palette it wears: a CAVE_THEMES id ("" or unknown: the GB greens). */
  theme?: string;
}

export const CAVE_DEFAULTS: CaveSettings = { style: "cave", columns: 2, rows: 2, cell: 16, seed: 1, fill: 46, smooth: 4, rooms: 8, roomSize: 5, connected: true, stairs: true };

/** The cave's grid: 1 rock, 0 floor (2 stairs), the edge always rock. */
export function caveGrid(settings: CaveSettings): { w: number; h: number; grid: Uint8Array } {
  const w = Math.max(3, Math.floor(settings.columns * SCREEN_W / settings.cell)), h = Math.max(3, Math.floor(settings.rows * SCREEN_H / settings.cell));
  const random = seeded(settings.seed);
  const edge = (x: number, y: number) => x === 0 || y === 0 || x === w - 1 || y === h - 1;
  let grid = new Uint8Array(w * h).fill(1);
  if (settings.style === "cave") {
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) grid[y * w + x] = edge(x, y) || random() * 100 < settings.fill ? 1 : 0;
    for (let pass = 0; pass < settings.smooth; pass += 1) {
      const next = new Uint8Array(w * h);
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
        if (edge(x, y)) { next[y * w + x] = 1; continue; }
        let rock = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if ((dx || dy) && grid[(y + dy) * w + x + dx]) rock += 1;
        next[y * w + x] = rock > 4 ? 1 : rock < 4 ? 0 : grid[y * w + x];
      }
      grid = next;
    }
    if (settings.connected) keepBiggestArea(grid, w, h);
  } else {
    carveRooms(grid, w, h, settings, random);
  }
  if (settings.stairs) placeStairs(grid, w, h);
  return { w, h, grid };
}

/** Rooms that don't touch, each joined to the nearest room already joined by an L-shaped corridor. */
function carveRooms(grid: Uint8Array, w: number, h: number, settings: CaveSettings, random: () => number) {
  const rooms: { x: number; y: number; w: number; h: number }[] = [];
  for (let tries = 0; tries < settings.rooms * 30 && rooms.length < settings.rooms; tries += 1) {
    const rw = Math.max(2, Math.round(settings.roomSize * (0.6 + random() * 0.8))), rh = Math.max(2, Math.round(settings.roomSize * (0.5 + random() * 0.7)));
    if (rw > w - 2 || rh > h - 2) continue;
    const room = { x: 1 + Math.floor(random() * (w - 1 - rw)), y: 1 + Math.floor(random() * (h - 1 - rh)), w: rw, h: rh };
    if (rooms.some((other) => room.x <= other.x + other.w && other.x <= room.x + room.w && room.y <= other.y + other.h && other.y <= room.y + room.h)) continue;
    rooms.push(room);
  }
  for (const room of rooms) for (let y = room.y; y < room.y + room.h; y += 1) for (let x = room.x; x < room.x + room.w; x += 1) grid[y * w + x] = 0;
  const centre = (room: (typeof rooms)[number]) => [Math.floor(room.x + room.w / 2), Math.floor(room.y + room.h / 2)];
  for (let at = 1; at < rooms.length; at += 1) {
    const [x1, y1] = centre(rooms[at]);
    let best = 0, bestDistance = Infinity;
    for (let other = 0; other < at; other += 1) { const [x2, y2] = centre(rooms[other]); const d = Math.abs(x1 - x2) + Math.abs(y1 - y2); if (d < bestDistance) { bestDistance = d; best = other; } }
    const [x2, y2] = centre(rooms[best]);
    const bendFirst = random() < 0.5;
    const cornerX = bendFirst ? x2 : x1, cornerY = bendFirst ? y1 : y2;
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) grid[(bendFirst ? y1 : y2) * w + x] = 0;
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) grid[y * w + (bendFirst ? x2 : x1)] = 0;
    grid[cornerY * w + cornerX] = 0;
  }
}

/** Floor areas joined by sides; all but the biggest become rock. */
function keepBiggestArea(grid: Uint8Array, w: number, h: number) {
  const area = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < w * h; start += 1) {
    if (grid[start] || area[start] >= 0) continue;
    const id = sizes.length, stack = [start];
    area[start] = id; let size = 0;
    while (stack.length) {
      const at = stack.pop()!; size += 1;
      const x = at % w, y = Math.floor(at / w);
      for (const [dx, dy] of SIDES) {
        const nx = x + dx, ny = y + dy, next = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !grid[next] && area[next] < 0) { area[next] = id; stack.push(next); }
      }
    }
    sizes.push(size);
  }
  const keep = sizes.indexOf(Math.max(...sizes));
  for (let at = 0; at < w * h; at += 1) if (!grid[at] && area[at] !== keep) grid[at] = 1;
}

/** Steps from one floor cell to every other (-1 unreachable). */
function distances(grid: Uint8Array, w: number, h: number, from: number, passable: (cell: number) => boolean): Int32Array {
  const distance = new Int32Array(w * h).fill(-1);
  distance[from] = 0;
  const queue = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const at = queue[head], x = at % w, y = Math.floor(at / w);
    for (const [dx, dy] of SIDES) {
      const nx = x + dx, ny = y + dy, next = ny * w + nx;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && distance[next] < 0 && passable(grid[next])) { distance[next] = distance[at] + 1; queue.push(next); }
    }
  }
  return distance;
}

/** Stairs at the two floor cells farthest apart (found from any floor cell, then from the farthest one). */
function placeStairs(grid: Uint8Array, w: number, h: number) {
  const first = grid.indexOf(0);
  if (first < 0) return;
  const farthest = (distance: Int32Array) => distance.reduce((best, d, at) => d > distance[best] ? at : best, first);
  const a = farthest(distances(grid, w, h, first, (cell) => cell === 0));
  const fromA = distances(grid, w, h, a, (cell) => cell === 0);
  const b = farthest(fromA);
  if (a === b) return;
  grid[a] = 2; grid[b] = 2;
}

export function drawCave(settings: CaveSettings): Generated {
  const { w, h, grid } = caveGrid(settings);
  const size = settings.cell;
  const out: Generated = { width: w * size, height: h * size, pixels: new Uint8Array(w * size * h * size) };
  const theme = themeOf(CAVE_THEMES, settings.theme ?? "");
  if (theme) { out.cells = new Uint8Array(Math.ceil(out.width / 8) * Math.ceil(out.height / 8)).fill(1); out.palettes = theme.palettes.map(({ name, colors }) => ({ name, colors: [...colors] })); }
  const rock = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || grid[y * w + x] === 1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const pen = new Pen(out, x * size, y * size, size);
    const cell = grid[y * w + x];
    if (cell === 1) {
      const open = SIDES.map(([dx, dy]) => !rock(x + dx, y + dy));
      if (!open.some(Boolean)) { pen.fill(3); continue; }
      // Rock next to the floor: mid shade, its floor-facing sides outlined.
      pen.fill(2);
      open.forEach((isOpen, side) => { if (isOpen) pen.side(side, 3); });
      if (settings.style === "cave" && size === 16 && hash(x, y, settings.seed) % 3 === 0) { pen.rect(5, 6, 3, 1, 3); pen.rect(9, 10, 2, 1, 3); }
      continue;
    }
    pen.fill(0);
    if (settings.style === "dungeon") {
      // Flagstones: a light line on the top and left of each cell (one per tile on 16-pixel cells).
      pen.side(0, 1); pen.side(3, 1);
      if (size === 16) { pen.rect(0, 8, 16, 1, 1); pen.rect(8, 0, 1, 16, 1); }
    } else if (hash(x, y, settings.seed) % 4 === 0) {
      const at = size === 16 ? 4 + (hash(x, y, 7) % 6) : 2;
      pen.rect(at, at + 1, 2, 1, 1); pen.dot(at + 1, at, 1);
    }
    if (cell === 2) {
      // Stairs: a box of steps.
      const inset = size === 16 ? 2 : 1;
      pen.rect(inset, inset, size - inset * 2, size - inset * 2, 1);
      pen.box(inset, inset, size - inset * 2, size - inset * 2, 3);
      for (let step = inset + 2; step < size - inset - 1; step += size === 16 ? 3 : 2) pen.rect(inset, step, size - inset * 2, 1, 3);
    }
  }
  return out;
}

// ---- RPG-style overworld --------------------------------------------------------------------------------------------

export interface WorldSettings {
  columns: number; rows: number;
  seed: number;
  /** Percent of the map under water. */
  water: number;
  /** Percent of the land that is mountains (the highest land). */
  mountains: number;
  /** Percent of the remaining land that is forest (the dampest). */
  forest: number;
  /** Towns to place on open grass, spread apart. */
  towns: number;
  /** Feature size: bigger is broader land and seas. */
  scale: number;
  /** Water all round the edge. */
  island: boolean;
  /** Roads joining the towns (round water and mountains). */
  roads: boolean;
  /** The palettes it wears: a WORLD_THEMES id ("" or unknown: the GB greens). */
  theme: string;
}

export const WORLD_DEFAULTS: WorldSettings = { columns: 3, rows: 3, seed: 1, water: 35, mountains: 18, forest: 35, towns: 3, scale: 5, island: true, roads: true, theme: "overworld" };

export const WATER = 0, SHORE = 1, GRASS = 2, FOREST = 3, MOUNTAIN = 4, TOWN = 5, ROAD = 6;

/** Each terrain's palette in a seven-palette theme (1-based): grass 1, forest 2, mountain 3, water 4, shore 5, road 6, town 7. */
const TERRAIN_PALETTE: Record<number, number> = { [GRASS]: 1, [FOREST]: 2, [MOUNTAIN]: 3, [WATER]: 4, [SHORE]: 5, [ROAD]: 6, [TOWN]: 7 };

/** Smooth noise: random values on a lattice, blended (smoothstep) between them, a few octaves summed. */
function valueNoise(w: number, h: number, period: number, random: () => number): Float32Array {
  const out = new Float32Array(w * h);
  let amplitude = 1, total = 0;
  for (let octave = 0, step = period; octave < 4 && step >= 1; octave += 1, step /= 2, amplitude /= 2) {
    const gw = Math.ceil(w / step) + 2, gh = Math.ceil(h / step) + 2;
    const lattice = Float32Array.from({ length: gw * gh }, () => random());
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const fx = x / step, fy = y / step, ix = Math.floor(fx), iy = Math.floor(fy);
      const sx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix)), sy = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
      const at = (gx: number, gy: number) => lattice[gy * gw + gx];
      const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx, bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      out[y * w + x] += (top + (bottom - top) * sy) * amplitude;
    }
    total += amplitude;
  }
  for (let at = 0; at < out.length; at += 1) out[at] /= total;
  return out;
}

/** The value below which `percent` of the given values lie. */
function cut(values: ArrayLike<number>, percent: number): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (!sorted.length || percent <= 0) return -Infinity;
  if (percent >= 100) return Infinity;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percent / 100))];
}

/** The overworld's grid of terrain (WATER … ROAD), 16-pixel cells. */
export function worldGrid(settings: WorldSettings): { w: number; h: number; grid: Uint8Array } {
  const w = settings.columns * SCREEN_W / 16, h = Math.floor(settings.rows * SCREEN_H / 16);
  const random = seeded(settings.seed);
  const height = valueNoise(w, h, Math.max(1, settings.scale), random);
  const damp = valueNoise(w, h, Math.max(1, settings.scale * 0.7), random);
  if (settings.island) {
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const dx = (x + 0.5) / w * 2 - 1, dy = (y + 0.5) / h * 2 - 1;
      height[y * w + x] -= Math.max(0, Math.hypot(dx, dy) - 0.35) * 0.9;
    }
  }
  const grid = new Uint8Array(w * h).fill(GRASS);
  const sea = cut(height, settings.water);
  const land: number[] = [];
  for (let at = 0; at < w * h; at += 1) if (height[at] < sea || (settings.island && settings.water > 0 && edgeCell(at, w, h))) grid[at] = WATER; else land.push(at);
  const peak = cut(land.map((at) => height[at]), 100 - settings.mountains);
  for (const at of land) if (settings.mountains > 0 && height[at] >= peak) grid[at] = MOUNTAIN;
  const lowland = land.filter((at) => grid[at] === GRASS);
  const wet = cut(lowland.map((at) => damp[at]), 100 - settings.forest);
  for (const at of lowland) if (settings.forest > 0 && damp[at] >= wet) grid[at] = FOREST;
  // Shore: land (not mountain) beside water.
  for (let at = 0; at < w * h; at += 1) {
    if (grid[at] !== GRASS && grid[at] !== FOREST) continue;
    const x = at % w, y = Math.floor(at / w);
    if (SIDES.some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < w && ny < h && grid[ny * w + nx] === WATER; })) grid[at] = SHORE;
  }
  placeTowns(grid, w, h, settings, random);
  return { w, h, grid };
}

function edgeCell(at: number, w: number, h: number) {
  const x = at % w, y = Math.floor(at / w);
  return x === 0 || y === 0 || x === w - 1 || y === h - 1;
}

/** Towns on grass, each as far as it can be from the others; then roads from each to the nearest town before it. */
function placeTowns(grid: Uint8Array, w: number, h: number, settings: WorldSettings, random: () => number) {
  const open = Array.from(grid.keys()).filter((at) => grid[at] === GRASS && !edgeCell(at, w, h));
  const towns: number[] = [];
  for (let count = 0; count < settings.towns && open.length; count += 1) {
    let best = open[Math.floor(random() * open.length)], bestSpace = -1;
    if (towns.length) for (const at of open) {
      const x = at % w, y = Math.floor(at / w);
      const space = Math.min(...towns.map((town) => Math.hypot(town % w - x, Math.floor(town / w) - y))) + random() * 0.5;
      if (space > bestSpace) { bestSpace = space; best = at; }
    }
    towns.push(best);
    grid[best] = TOWN;
    open.splice(open.indexOf(best), 1);
  }
  if (!settings.roads) return;
  const walkable = (cell: number) => cell === GRASS || cell === FOREST || cell === SHORE || cell === ROAD || cell === TOWN;
  for (let at = 1; at < towns.length; at += 1) {
    const distance = distances(grid, w, h, towns[at], walkable);
    const reachable = towns.slice(0, at).filter((town) => distance[town] > 0);
    if (!reachable.length) continue;
    // Walk back from the nearest town along falling distances, laying road.
    let step = reachable.reduce((best, town) => distance[town] < distance[best] ? town : best);
    while (distance[step] > 1) {
      const x = step % w, y = Math.floor(step / w);
      const next = SIDES.map(([dx, dy]) => (y + dy) * w + x + dx).find((n, side) => { const nx = x + SIDES[side][0], ny = y + SIDES[side][1]; return nx >= 0 && ny >= 0 && nx < w && ny < h && distance[n] === distance[step] - 1; });
      if (next === undefined) break;
      step = next;
      if (grid[step] !== TOWN) grid[step] = ROAD;
    }
  }
}

export function drawWorld(settings: WorldSettings): Generated {
  const { w, h, grid } = worldGrid(settings);
  const out: Generated = { width: w * 16, height: h * 16, pixels: new Uint8Array(w * 16 * h * 16) };
  const theme = themeOf(WORLD_THEMES, settings.theme);
  if (theme) {
    // Each 16-pixel cell is 2 × 2 tiles, all in its terrain's palette (or the theme's one palette).
    const tilesWide = w * 2;
    out.cells = new Uint8Array(tilesWide * h * 2);
    for (let at = 0; at < out.cells.length; at += 1) out.cells[at] = theme.palettes.length === 7 ? TERRAIN_PALETTE[grid[Math.floor(Math.floor(at / tilesWide) / 2) * w + Math.floor((at % tilesWide) / 2)]] : 1;
    out.palettes = theme.palettes.map(({ name, colors }) => ({ name, colors: [...colors] }));
  }
  const at = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h ? -1 : grid[y * w + x];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const pen = new Pen(out, x * 16, y * 16, 16);
    const cell = grid[y * w + x];
    const variant = hash(x, y, settings.seed);
    if (cell === WATER) {
      pen.fill(1);
      // Waves: two short dashes, offset on alternate cells.
      const shift = (x + y) % 2 ? 6 : 0;
      pen.rect(2 + shift, 4, 4, 1, 2); pen.rect(8 - shift + 2, 11, 4, 1, 2);
      continue;
    }
    pen.fill(0);
    if (cell === SHORE) {
      pen.dot(3, 3, 1); pen.dot(11, 5, 1); pen.dot(6, 9, 1); pen.dot(13, 12, 1); pen.dot(2, 13, 1);
      SIDES.forEach(([dx, dy], side) => { if (at(x + dx, y + dy) === WATER) pen.side(side, 2); });
    } else if (cell === GRASS || cell === TOWN || cell === ROAD) {
      if (variant % 3 === 0) { pen.dot(4, 3, 1); pen.dot(3, 4, 1); pen.dot(5, 4, 1); pen.dot(11, 10, 1); pen.dot(10, 11, 1); pen.dot(12, 11, 1); }
    }
    if (cell === FOREST) {
      // A tree: a round crown outline on a trunk.
      pen.rect(5, 2, 6, 1, 3); pen.rect(5, 10, 6, 1, 3); pen.rect(3, 4, 1, 5, 3); pen.rect(12, 4, 1, 5, 3);
      pen.dot(4, 3, 3); pen.dot(11, 3, 3); pen.dot(4, 9, 3); pen.dot(11, 9, 3);
      pen.rect(5, 3, 6, 7, 1); pen.rect(4, 4, 8, 5, 1);
      pen.rect(7, 11, 2, 3, 3); pen.rect(5, 14, 6, 1, 2);
    } else if (cell === MOUNTAIN) {
      // A peak: a triangle outline, its lit side in rock (shade 1), its right side in shadow.
      for (let row = 0; row < 12; row += 1) {
        const half = Math.round(row * 7 / 11), y0 = 2 + row;
        pen.rect(8 - half, y0, half, 1, 1); pen.rect(8, y0, half, 1, 2);
        pen.dot(7 - half, y0, 3); pen.dot(8 + half, y0, 3);
      }
      pen.rect(1, 14, 15, 1, 3);
      pen.dot(7, 2, 3); pen.dot(8, 2, 3);
    } else if (cell === ROAD) {
      // A dirt band from the middle towards each neighbouring road or town.
      pen.rect(5, 5, 6, 6, 1);
      const links = SIDES.map(([dx, dy]) => { const n = at(x + dx, y + dy); return n === ROAD || n === TOWN; });
      if (links[0]) pen.rect(5, 0, 6, 5, 1);
      if (links[1]) pen.rect(11, 5, 5, 6, 1);
      if (links[2]) pen.rect(5, 11, 6, 5, 1);
      if (links[3]) pen.rect(0, 5, 5, 6, 1);
    } else if (cell === TOWN) {
      // Two houses: a pitched roof over walls with a door, one up on the left, one down on the right.
      for (const [hx, hy] of [[1, 0], [8, 6]]) {
        for (let row = 0; row < 4; row += 1) { pen.rect(hx + 3 - row, hy + 1 + row, row * 2 + 1, 1, 2); pen.dot(hx + 3 - row, hy + 1 + row, 3); pen.dot(hx + 3 + row, hy + 1 + row, 3); }
        pen.rect(hx, hy + 5, 7, 5, 1); pen.box(hx, hy + 5, 7, 5, 3);
        pen.rect(hx + 3, hy + 7, 1, 3, 3);
      }
    }
  }
  return out;
}
