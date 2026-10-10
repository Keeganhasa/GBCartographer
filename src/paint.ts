/**
 * GB Cartographer's pixel logic: a picture is one byte per pixel, a GB shade 0–3 (lightest to darkest) or CLEAR for a
 * see-through pixel. No palettes: the file is always written in the default GB greens, and a tint only changes
 * how the shades are shown while painting.
 */
import { MONOCHROME_PALETTE } from "./gb/limits";

export const CLEAR = 4;
export const GB_SHADES: readonly string[] = MONOCHROME_PALETTE;

export interface Rect { x: number; y: number; w: number; h: number }
/** A lifted piece of the picture that floats over it until it is dropped. */
export interface Floating {
  pixels: Uint8Array; w: number; h: number; x: number; y: number;
  /** Lifted on tile edges: each 8 × 8 tile's palette (a picture's `cells` value) moves with the pixels. */
  cells?: Uint8Array;
}
export type Mirror = "off" | "x" | "y" | "xy";

export function hexRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1, 7), 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
}

export const CELL = 8;
/** A four-color palette from the library; a cell (one 8 × 8 tile) may wear one. */
export interface Palette { name: string; colors: string[]; /** GB Studio's palette id, for palettes read from a project. */ id?: string }
export interface Picture { pixels: Uint8Array; cells: Uint8Array; hasAlpha: boolean; snapped: number; /** Colors within NEAR_SHADE_TOLERANCE of a GB green, read as that green. */ near: number; palettes: Palette[] }

export const cellsWide = (width: number) => Math.ceil(width / CELL);
/** Per channel: a color this close to a GB green is that green (the same tolerance as the main app's shadeIndex). */
export const NEAR_SHADE_TOLERANCE = 24;
/** Palettes made up for tiles whose colors are in no library palette, so saving never loses them. */
const FILE_PALETTE_LIMIT = 64;

/**
 * GB Studio's own rule for reading a color as a shade (`tileDataIndexFn` in GB Studio's source): the green channel
 * alone, below 65 the darkest, below 130 the next, below 205 the next, else the lightest. Sprites use the same
 * thresholds (their two dark shades draw alike), so a picture here shades exactly as GB Studio will.
 */
export function gbStudioShade(g: number): number {
  return g < 65 ? 3 : g < 130 ? 2 : g < 205 ? 1 : 0;
}

/**
 * GB Studio's see-through rule for sprite sheets (`spriteDataIndexFn`): alpha below 200, its key green (green
 * above 249 with red below 180 and blue below 20), or a strong blue / magenta with almost no green.
 */
export function gbStudioSpriteClear(r: number, g: number, b: number, a: number): boolean {
  return a < 200 || (g > 249 && r < 180 && b < 20) || (b >= 200 && g < 20);
}

/**
 * Turns RGBA pixels into shades, the way GB Studio reads them: the four GB greens map exactly, and any other color
 * takes GB Studio's shade for it (`gbStudioShade`). Palettes only decide how a tile looks here. A tile drawn in a
 * library palette's colors, each at the position GB Studio reads it as, wears that palette (`cells` holds its
 * position + 1, 0 for none). Any other tile of colors gets a palette made from them ("File 1", …), each color at
 * its shade, added after the library's in `palettes`; when two of a tile's colors read as the same shade, GB
 * Studio shows them alike and so does this (`snapped` counts such colors). Mostly see-through pixels become CLEAR
 * (sprites: GB Studio's rule, including its key green). Colors within NEAR_SHADE_TOLERANCE of a GB green leave a
 * tile plain green (`near` counts them); they still shade by GB Studio's rule.
 */
export function quantize(rgba: Uint8ClampedArray, width: number, height: number, library: readonly Palette[] = [], keyGreen = false): Picture {
  const rgbKey = ([r, g, b]: [number, number, number]) => (r << 16) | (g << 8) | b;
  const clear = keyGreen
    ? (p: number) => gbStudioSpriteClear(rgba[p], rgba[p + 1], rgba[p + 2], rgba[p + 3])
    : (p: number) => rgba[p + 3] < 128;
  const shades = GB_SHADES.map(hexRgb);
  const gb = new Map<number, number>(shades.map((shade, index) => [rgbKey(shade), index]));
  const shadeOf = (key: number) => gb.get(key) ?? gbStudioShade((key >> 8) & 255);
  const near = new Set<number>();
  const isGreen = (key: number) => {
    if (gb.has(key)) return true;
    const r = key >> 16, g = (key >> 8) & 255, b = key & 255;
    const close = shades.some(([sr, sg, sb]) => Math.abs(sr - r) <= NEAR_SHADE_TOLERANCE && Math.abs(sg - g) <= NEAR_SHADE_TOLERANCE && Math.abs(sb - b) <= NEAR_SHADE_TOLERANCE);
    if (close) near.add(key);
    return close;
  };
  const palettes: Palette[] = library.map(({ name, colors, id }) => ({ name, colors: [...colors], ...(id ? { id } : {}) }));
  const paletteKeys = palettes.map((palette) => palette.colors.map((color) => rgbKey(hexRgb(color))));
  const cw = cellsWide(width), ch = Math.ceil(height / CELL);
  const cells = new Uint8Array(cw * ch);
  const bounds = (cell: number) => {
    const x0 = (cell % cw) * CELL, y0 = Math.floor(cell / cw) * CELL;
    return { x0, y0, x1: Math.min(width, x0 + CELL), y1: Math.min(height, y0 + CELL) };
  };
  // A palette fits a tile when each of the tile's colors sits at the position GB Studio reads it as.
  const fits = (colors: number[], keys: number[]) => keys.every((key) => colors[shadeOf(key)] === key);
  const wearing = (keys: number[]) => paletteKeys.findIndex((colors) => fits(colors, keys));
  const snapped = new Set<number>();
  // First the tiles the GB greens or a library palette explain; the rest wait, biggest color sets first, so a tile
  // with fewer colors can share the palette made for a fuller one.
  const waiting: { cell: number; keys: number[] }[] = [];
  for (let cell = 0; cell < cells.length; cell += 1) {
    const { x0, y0, x1, y1 } = bounds(cell);
    const keys: number[] = [];
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const p = (y * width + x) * 4;
        const key = (rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2];
        if (!clear(p) && !keys.includes(key)) keys.push(key);
      }
    }
    if (keys.every(isGreen)) continue;
    const wears = wearing(keys);
    if (wears >= 0) cells[cell] = wears + 1;
    else waiting.push({ cell, keys });
  }
  waiting.sort((a, b) => b.keys.length - a.keys.length);
  for (const { cell, keys } of waiting) {
    let wears = wearing(keys);
    if (wears < 0 && palettes.length - library.length < FILE_PALETTE_LIMIT) {
      // Each color at its shade; a shade the tile doesn't use keeps its GB green.
      const colors = shades.map(rgbKey);
      const taken = new Set<number>();
      for (const key of keys) {
        const shade = shadeOf(key);
        if (taken.has(shade)) { snapped.add(key); continue; }
        taken.add(shade);
        colors[shade] = key;
      }
      wears = paletteKeys.findIndex((existing) => existing.every((key, at) => key === colors[at]));
      if (wears < 0) {
        wears = palettes.length;
        paletteKeys.push(colors);
        palettes.push({ name: `File ${palettes.length - library.length + 1}`, colors: colors.map((key) => `#${key.toString(16).padStart(6, "0").toUpperCase()}`) });
      }
    } else if (wears < 0) for (const key of keys) snapped.add(key);
    if (wears >= 0) cells[cell] = wears + 1;
  }
  const pixels = new Uint8Array(width * height);
  let hasAlpha = false;
  for (let i = 0; i < pixels.length; i += 1) {
    const p = i * 4;
    if (clear(p)) {
      pixels[i] = CLEAR;
      hasAlpha = true;
      continue;
    }
    pixels[i] = shadeOf((rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2]);
  }
  return { pixels, cells, hasAlpha, snapped: snapped.size, near: near.size, palettes };
}

/**
 * How a sprite palette colors the shades: color 0 of a GB sprite palette is never drawn (it is the see-through
 * color), so the lightest shade takes color 1, the mid shade color 2, and both dark shades color 3.
 */
export function spriteShades(colors: readonly string[]): string[] {
  return [colors[1] ?? colors[0], colors[2] ?? colors[0], colors[3] ?? colors[0], colors[3] ?? colors[0]];
}

/** GB Studio's key green: the see-through color of sprite sheets. */
export const KEY_GREEN = "#65FF00";

/** One 32-bit pixel per shade (CLEAR is see-through, or `clear` when given), in the byte order ImageData uses. */
export function shadeLut(colors: readonly string[], clear?: string): Uint32Array {
  const lut = new Uint32Array(5);
  [...colors.slice(0, 4), ...(clear ? [clear] : [])].forEach((color, index) => {
    const [r, g, b] = hexRgb(color);
    lut[index] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
  });
  return lut;
}

/**
 * Draws the picture as 32-bit pixels: `luts[0]` colors the cells without a palette (the GB greens, or a tint while
 * painting), `luts[n]` the cells wearing palette n.
 */
export function colorize(pixels: Uint8Array, cells: Uint8Array, width: number, luts: readonly Uint32Array[], out: Uint32Array = new Uint32Array(pixels.length)): Uint32Array {
  const cw = cellsWide(width);
  for (let i = 0; i < pixels.length; i += 1) {
    const x = i % width, y = (i - x) / width;
    out[i] = (luts[cells[(y >> 3) * cw + (x >> 3)]] ?? luts[0])[pixels[i]];
  }
  return out;
}

/**
 * The flat RGBA picture a file gets: GB greens, and each palette's own colors on the cells that wear one.
 * See-through pixels are written as alpha 0, or as `clear` (a sprite sheet's key green) when given.
 */
export function toRgba(pixels: Uint8Array, cells: Uint8Array, width: number, palettes: readonly Palette[] = [], clear?: string): Uint8ClampedArray {
  return new Uint8ClampedArray(colorize(pixels, cells, width, [GB_SHADES, ...palettes.map((palette) => palette.colors)].map((colors) => shadeLut(colors, clear))).buffer);
}

/**
 * The slot a palette saves as by its name, for palettes outside the eight: a Chorbi-style name
 * "<Set>-<n>-<Name>", with or without a D / N / S variant letter, takes the slot of its base palette when that is
 * in the slots, else slot n. Returns -1 for any other name. `slotNames` are the eight slot palettes' names.
 */
export function namedSlot(name: string, slotNames: readonly (string | undefined)[]): number {
  const match = /^(.+?-([1-8])-.+?)(?: [DNS])?$/.exec(name.trim());
  if (!match) return -1;
  const base = slotNames.indexOf(match[1]);
  return base >= 0 ? base : Number(match[2]) - 1;
}

/**
 * Gives each cell the palette of its GB Studio tile color: the low three bits of `tileColors[cell]` pick one of
 * the scene's eight `slots` (palette ids), found by id among `palettes` (cell value = position + 1, 0 when the
 * palette is not in the list). Cells beyond the tile colors, and cells whose value is negative (a sprite sheet's
 * cells no slice uses), are left as they are.
 */
export function assignSlots(cells: Uint8Array, tileColors: readonly number[], slots: readonly string[], palettes: readonly { id?: string }[]): number {
  const byId = new Map<string, number>();
  palettes.forEach((palette, index) => { if (palette.id && !byId.has(palette.id)) byId.set(palette.id, index + 1); });
  let assigned = 0;
  for (let cell = 0; cell < Math.min(cells.length, tileColors.length); cell += 1) {
    if (tileColors[cell] < 0) continue;
    const value = byId.get(slots[tileColors[cell] & 7] ?? "") ?? 0;
    cells[cell] = value;
    if (value) assigned += 1;
  }
  return assigned;
}

/** The points a brush at (x, y) paints with mirroring on (across the middle of the picture). */
export function mirrorPoints(x: number, y: number, width: number, height: number, mirror: Mirror): [number, number][] {
  const points: [number, number][] = [[x, y]];
  if (mirror === "x" || mirror === "xy") points.push([width - 1 - x, y]);
  if (mirror === "y" || mirror === "xy") points.push([x, height - 1 - y]);
  if (mirror === "xy") points.push([width - 1 - x, height - 1 - y]);
  return points;
}

/** A square brush mark, `size` pixels wide, around (x, y). */
export function dot(pixels: Uint8Array, width: number, height: number, x: number, y: number, size: number, shade: number) {
  const offset = Math.floor((size - 1) / 2);
  for (let py = Math.max(0, y - offset); py < Math.min(height, y - offset + size); py += 1) {
    for (let px = Math.max(0, x - offset); px < Math.min(width, x - offset + size); px += 1) pixels[py * width + px] = shade;
  }
}

export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const points: [number, number][] = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (let x = x0, y = y0; ;) {
    points.push([x, y]);
    if (x === x1 && y === y1) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
  return points;
}

export function rectFrom(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 };
}

/** The outline of the ellipse that fills the box between two corners. */
export function ellipsePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const box = rectFrom(x0, y0, x1, y1);
  const a = (box.w - 1) / 2, b = (box.h - 1) / 2;
  const cx = box.x + a, cy = box.y + b;
  const points: [number, number][] = [];
  for (let x = box.x; x < box.x + box.w; x += 1) {
    const t = a ? (x - cx) / a : 0;
    const dy = b * Math.sqrt(Math.max(0, 1 - t * t));
    points.push([x, Math.round(cy - dy)], [x, Math.round(cy + dy)]);
  }
  for (let y = box.y; y < box.y + box.h; y += 1) {
    const t = b ? (y - cy) / b : 0;
    const dx = a * Math.sqrt(Math.max(0, 1 - t * t));
    points.push([Math.round(cx - dx), y], [Math.round(cx + dx), y]);
  }
  return points;
}

/** Fill patterns: which pixels a fill paints (anchored to the picture, so neighbouring fills line up). */
export type Pattern = "solid" | "checker" | "quarter" | "threeQuarters" | "rows" | "columns";
export const PATTERNS: { id: Pattern; label: string }[] = [
  { id: "solid", label: "Solid" }, { id: "checker", label: "Checker 50%" }, { id: "quarter", label: "Dots 25%" },
  { id: "threeQuarters", label: "Dense 75%" }, { id: "rows", label: "Rows" }, { id: "columns", label: "Columns" },
];
export function inPattern(pattern: Pattern, x: number, y: number): boolean {
  switch (pattern) {
    case "checker": return (x + y) % 2 === 0;
    case "quarter": return x % 2 === 0 && y % 2 === 0;
    case "threeQuarters": return !(x % 2 === 1 && y % 2 === 1);
    case "rows": return y % 2 === 0;
    case "columns": return x % 2 === 0;
    default: return true;
  }
}

export function fillRect(pixels: Uint8Array, width: number, height: number, rect: Rect, shade: number, pattern: Pattern = "solid") {
  for (let y = Math.max(0, rect.y); y < Math.min(height, rect.y + rect.h); y += 1) {
    if (pattern === "solid") { pixels.fill(shade, y * width + Math.max(0, rect.x), y * width + Math.min(width, rect.x + rect.w)); continue; }
    for (let x = Math.max(0, rect.x); x < Math.min(width, rect.x + rect.w); x += 1) if (inPattern(pattern, x, y)) pixels[y * width + x] = shade;
  }
}

/**
 * Fills the connected area of one shade around (x, y); false when there was nothing to change. With a pattern,
 * only the area's pixels on the pattern take the shade.
 */
export function floodFill(pixels: Uint8Array, width: number, height: number, x: number, y: number, shade: number, pattern: Pattern = "solid"): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const from = pixels[y * width + x];
  if (pattern !== "solid") {
    const seen = new Uint8Array(pixels.length), area: number[] = [];
    const stack = [y * width + x];
    seen[stack[0]] = 1;
    while (stack.length) {
      const at = stack.pop()!;
      area.push(at);
      const ax = at % width;
      for (const next of [ax > 0 ? at - 1 : -1, ax < width - 1 ? at + 1 : -1, at - width, at + width]) {
        if (next < 0 || next >= pixels.length || seen[next] || pixels[next] !== from) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    let changed = false;
    for (const at of area) if (inPattern(pattern, at % width, Math.floor(at / width)) && pixels[at] !== shade) { pixels[at] = shade; changed = true; }
    return changed;
  }
  if (from === shade) return false;
  const stack = [y * width + x];
  pixels[stack[0]] = shade;
  while (stack.length) {
    const at = stack.pop()!;
    const ax = at % width;
    for (const next of [ax > 0 ? at - 1 : -1, ax < width - 1 ? at + 1 : -1, at - width, at + width]) {
      if (next < 0 || next >= pixels.length || pixels[next] !== from) continue;
      pixels[next] = shade;
      stack.push(next);
    }
  }
  return true;
}

/** A few scattered pixels around (x, y), MS Paint style. */
export function spray(pixels: Uint8Array, width: number, height: number, x: number, y: number, size: number, shade: number, random: () => number = Math.random) {
  const radius = Math.max(2, size * 2);
  for (let i = 0; i < 4 + size * 2; i += 1) {
    const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * radius;
    const px = Math.round(x + Math.cos(angle) * distance), py = Math.round(y + Math.sin(angle) * distance);
    if (px >= 0 && py >= 0 && px < width && py < height) pixels[py * width + px] = shade;
  }
}

/** The part of a rectangle that lies on the picture (null when none does). */
export function clipRect(rect: Rect, width: number, height: number): Rect | null {
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
  const w = Math.min(width, rect.x + rect.w) - x, h = Math.min(height, rect.y + rect.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/** Grows a rectangle outward to whole cells of `step` pixels. */
export function snapRect(rect: Rect, step: number): Rect {
  const x = Math.floor(rect.x / step) * step, y = Math.floor(rect.y / step) * step;
  return { x, y, w: Math.ceil((rect.x + rect.w) / step) * step - x, h: Math.ceil((rect.y + rect.h) / step) * step - y };
}

/** Copies a rectangle out of the picture; with `blank` given, the pixels left behind become that shade. */
export function lift(pixels: Uint8Array, width: number, rect: Rect, blank?: number): Floating {
  const out = new Uint8Array(rect.w * rect.h);
  for (let y = 0; y < rect.h; y += 1) {
    const start = (rect.y + y) * width + rect.x;
    out.set(pixels.subarray(start, start + rect.w), y * rect.w);
    if (blank !== undefined) pixels.fill(blank, start, start + rect.w);
  }
  return { pixels: out, w: rect.w, h: rect.h, x: rect.x, y: rect.y };
}

/** Whether a rectangle starts and ends on 8 × 8 tile edges (its tiles' palettes can move with it). */
export const onTiles = (rect: Rect) => rect.x % CELL === 0 && rect.y % CELL === 0 && rect.w % CELL === 0 && rect.h % CELL === 0;

/** The tile palettes under a tile-aligned rectangle (row by row), and with `blank` clears them in the picture. */
export function liftCells(cells: Uint8Array, width: number, rect: Rect, blank?: number): Uint8Array {
  const cw = cellsWide(width), w = rect.w / CELL, h = rect.h / CELL;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const at = (rect.y / CELL + y) * cw + rect.x / CELL + x;
      out[y * w + x] = cells[at];
      if (blank !== undefined) cells[at] = blank;
    }
  }
  return out;
}

/** Puts a floating piece's tile palettes into the picture, when it sits on tile edges (tiles outside are skipped). */
export function dropCells(cells: Uint8Array, width: number, height: number, floating: Floating) {
  if (!floating.cells || floating.x % CELL || floating.y % CELL) return;
  const cw = cellsWide(width), ch = Math.ceil(height / CELL), w = floating.w / CELL, h = floating.h / CELL;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const tx = floating.x / CELL + x, ty = floating.y / CELL + y;
      if (tx >= 0 && ty >= 0 && tx < cw && ty < ch) cells[ty * cw + tx] = floating.cells[y * w + x];
    }
  }
}

/** Mirrors a floating piece left-right ("x") or top-bottom ("y"), with its tile palettes. */
export function flipFloat(floating: Floating, axis: "x" | "y"): Floating {
  const flip = (data: Uint8Array, w: number, h: number) => {
    const out = new Uint8Array(data.length);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) out[y * w + x] = data[axis === "x" ? y * w + (w - 1 - x) : (h - 1 - y) * w + x];
    return out;
  };
  return { ...floating, pixels: flip(floating.pixels, floating.w, floating.h), ...(floating.cells ? { cells: flip(floating.cells, floating.w / CELL, floating.h / CELL) } : {}) };
}

/** Turns a floating piece a quarter turn clockwise about its top-left corner (width and height swap). */
export function rotateFloat(floating: Floating): Floating {
  const turn = (data: Uint8Array, w: number, h: number) => {
    const out = new Uint8Array(data.length);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) out[x * h + (h - 1 - y)] = data[y * w + x];
    return out;
  };
  return { ...floating, w: floating.h, h: floating.w, pixels: turn(floating.pixels, floating.w, floating.h), ...(floating.cells ? { cells: turn(floating.cells, floating.w / CELL, floating.h / CELL) } : {}) };
}

/** Every pixel of one shade becomes another, inside `rect` (or the whole picture). Returns how many changed. */
export function replaceShade(pixels: Uint8Array, width: number, height: number, from: number, to: number, rect?: Rect | null): number {
  const area = rect ? clipRect(rect, width, height) : { x: 0, y: 0, w: width, h: height };
  if (!area || from === to) return 0;
  let count = 0;
  for (let y = area.y; y < area.y + area.h; y += 1) {
    for (let x = area.x; x < area.x + area.w; x += 1) {
      const at = y * width + x;
      if (pixels[at] === from) { pixels[at] = to; count += 1; }
    }
  }
  return count;
}

/** Flattens a floating piece into the picture where it sits; its see-through pixels leave the picture alone. */
export function drop(pixels: Uint8Array, width: number, height: number, floating: Floating) {
  for (let y = 0; y < floating.h; y += 1) {
    const py = floating.y + y;
    if (py < 0 || py >= height) continue;
    for (let x = 0; x < floating.w; x += 1) {
      const px = floating.x + x;
      const shade = floating.pixels[y * floating.w + x];
      if (px >= 0 && px < width && shade !== CLEAR) pixels[py * width + px] = shade;
    }
  }
}

/**
 * How many different 8 × 8 tiles the picture has, the way GB Studio counts them: identical tiles are one, and with
 * `flips` (Color Only scenes) so are tiles that are mirror images of each other. Edge tiles are padded see-through.
 */
export function countUniqueTiles(pixels: Uint8Array, width: number, height: number, flips: boolean): number {
  const seen = new Set<string>();
  const tile = new Uint8Array(64);
  const codes = (order: (x: number, y: number) => number) => {
    let text = "";
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) text += tile[order(x, y)];
    return text;
  };
  for (let ty = 0; ty < height; ty += CELL) {
    for (let tx = 0; tx < width; tx += CELL) {
      for (let y = 0; y < CELL; y += 1) {
        for (let x = 0; x < CELL; x += 1) tile[y * CELL + x] = tx + x < width && ty + y < height ? pixels[(ty + y) * width + tx + x] : CLEAR;
      }
      const plain = codes((x, y) => y * CELL + x);
      if (seen.has(plain)) continue;
      if (flips && [codes((x, y) => y * CELL + 7 - x), codes((x, y) => (7 - y) * CELL + x), codes((x, y) => (7 - y) * CELL + 7 - x)].some((code) => seen.has(code))) continue;
      seen.add(plain);
    }
  }
  return seen.size;
}

/** A tile's 64 pixels (edges padded see-through), row by row. */
function tileAt(pixels: Uint8Array, width: number, height: number, cell: number): Uint8Array {
  const cw = cellsWide(width), tx = (cell % cw) * CELL, ty = Math.floor(cell / cw) * CELL;
  const tile = new Uint8Array(64);
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) tile[y * CELL + x] = tx + x < width && ty + y < height ? pixels[(ty + y) * width + tx + x] : CLEAR;
  return tile;
}

/** How the tiles are spent: per cell, how many cells share its pattern, and for a tile used once, a near twin. */
export interface TileUsage {
  /** Per cell: how many cells show this pattern (flipped copies count when `flips`). */
  uses: Uint16Array;
  /** Per cell: for a tile used once, the cell of the closest other pattern within `maxDiff` pixels, else -1. */
  near: Int32Array;
  /** Per cell: how many pixels differ from `near`. */
  diff: Uint8Array;
}

/**
 * Where the tile budget goes: tiles used only once cost a whole tile each; one that differs from another tile in a
 * few pixels (`maxDiff`) could be merged into it. The twin is the most used close pattern (fewest differences first).
 */
export function tileUsage(pixels: Uint8Array, width: number, height: number, flips: boolean, maxDiff = 3): TileUsage {
  const cw = cellsWide(width), count = cw * Math.ceil(height / CELL);
  const tiles = Array.from({ length: count }, (_, cell) => tileAt(pixels, width, height, cell));
  const key = (tile: Uint8Array, order: (x: number, y: number) => number) => { let text = ""; for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) text += tile[order(x, y)]; return text; };
  const orders: ((x: number, y: number) => number)[] = [(x, y) => y * CELL + x, (x, y) => y * CELL + 7 - x, (x, y) => (7 - y) * CELL + x, (x, y) => (7 - y) * CELL + 7 - x];
  // Each cell's pattern id: the first cell with the same tile (or a flip of it, with `flips`).
  const ids = new Int32Array(count), firstByKey = new Map<string, number>();
  tiles.forEach((tile, cell) => {
    const plain = key(tile, orders[0]);
    let id = firstByKey.get(plain);
    if (id === undefined && flips) for (const order of orders.slice(1)) { id = firstByKey.get(key(tile, order)); if (id !== undefined) break; }
    if (id === undefined) { id = cell; firstByKey.set(plain, cell); }
    ids[cell] = id;
  });
  const total = new Map<number, number>();
  for (const id of ids) total.set(id, (total.get(id) ?? 0) + 1);
  const uses = Uint16Array.from(ids, (id) => total.get(id)!);
  const near = new Int32Array(count).fill(-1), diff = new Uint8Array(count);
  const patterns = [...total.keys()];
  for (let cell = 0; cell < count; cell += 1) {
    if (uses[cell] > 1) continue;
    let best = -1, bestDiff = maxDiff + 1, bestUses = 0;
    for (const other of patterns) {
      if (other === ids[cell]) continue;
      let differs = 0;
      for (let at = 0; at < 64 && differs <= maxDiff; at += 1) if (tiles[cell][at] !== tiles[other][at]) differs += 1;
      const otherUses = total.get(other)!;
      if (differs <= maxDiff && (differs < bestDiff || (differs === bestDiff && otherUses > bestUses))) { best = other; bestDiff = differs; bestUses = otherUses; }
    }
    if (best >= 0) { near[cell] = best; diff[cell] = bestDiff; }
  }
  return { uses, near, diff };
}

/**
 * Makes each listed cell a copy of its near twin's tile (merging near duplicates). A twin that was itself just
 * changed is not copied from (two single-use tiles that are each other's twin would otherwise swap). Returns how
 * many tiles changed.
 */
export function mergeNearTiles(pixels: Uint8Array, width: number, height: number, usage: TileUsage): number {
  const cw = cellsWide(width);
  const changed = new Set<number>();
  let merged = 0;
  usage.near.forEach((twin, cell) => {
    if (twin < 0 || changed.has(twin)) return;
    changed.add(cell);
    const tx = (cell % cw) * CELL, ty = Math.floor(cell / cw) * CELL, sx = (twin % cw) * CELL, sy = Math.floor(twin / cw) * CELL;
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
      if (tx + x >= width || ty + y >= height || sx + x >= width || sy + y >= height) continue;
      pixels[(ty + y) * width + tx + x] = pixels[(sy + y) * width + sx + x];
    }
    merged += 1;
  });
  return merged;
}

/**
 * Linked tiles: cells whose 8 × 8 pixels are identical share a group (an index into `members`). A tile of a single
 * shade (empty sky, blank background) is never linked, nor is a tile with no twin: their group is -1.
 */
export function linkGroups(pixels: Uint8Array, width: number, height: number): { groups: Int32Array; members: number[][] } {
  const cw = cellsWide(width), count = cw * Math.ceil(height / CELL);
  const byKey = new Map<string, number[]>();
  for (let cell = 0; cell < count; cell += 1) {
    const tile = tileAt(pixels, width, height, cell);
    if (tile.every((value) => value === tile[0])) continue;
    const key = tile.join("");
    const list = byKey.get(key);
    if (list) list.push(cell); else byKey.set(key, [cell]);
  }
  const groups = new Int32Array(count).fill(-1), members: number[][] = [];
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    for (const cell of list) groups[cell] = members.length;
    members.push(list);
  }
  return { groups, members };
}

/**
 * Keeps linked tiles alike: every pixel that changed since `previous` is set at the same spot in each linked copy.
 * When copies disagree at a spot, a value that differs from `base` (a fresh stroke) wins over one that went back to
 * it. Returns how many pixels were copied.
 */
export function syncLinked(pixels: Uint8Array, previous: Uint8Array, base: Uint8Array, width: number, height: number, link: { groups: Int32Array; members: number[][] }): number {
  const cw = cellsWide(width);
  const wanted = new Map<number, number>();
  for (let at = 0; at < pixels.length; at += 1) {
    if (pixels[at] === previous[at]) continue;
    const x = at % width, y = (at - x) / width;
    const group = link.groups[(y >> 3) * cw + (x >> 3)];
    if (group < 0) continue;
    const key = group * 64 + (y & 7) * CELL + (x & 7);
    if (!wanted.has(key) || pixels[at] !== base[at]) wanted.set(key, pixels[at]);
  }
  let copied = 0;
  for (const [key, value] of wanted) {
    const offset = key % 64, ox = offset % CELL, oy = (offset - ox) / CELL;
    for (const cell of link.members[(key - offset) / 64]) {
      const x = (cell % cw) * CELL + ox, y = Math.floor(cell / cw) * CELL + oy;
      if (x >= width || y >= height) continue;
      const at = y * width + x;
      if (pixels[at] !== value) { pixels[at] = value; copied += 1; }
    }
  }
  return copied;
}

/** How the picture is shown while painting, like a real screen (never saved). */
export type Look = "plain" | "dmg" | "pocket" | "gbc";
/** The original Game Boy's pea-green LCD and the Game Boy Pocket's grey one, lightest first: palettes don't show. */
export const LOOK_SHADES: Record<"dmg" | "pocket", readonly string[]> = {
  dmg: ["#9BBC0F", "#8BAC0F", "#306230", "#0F380F"],
  pocket: ["#C5CAA4", "#8C926B", "#4A5138", "#181818"],
};

/**
 * The Game Boy Color screen's color response (higan's well-known approximation): colors are cut to the GBC's 5 bits
 * per channel, then mixed and dimmed the way its LCD shows them. Works in place on RGBA bytes (alpha kept).
 */
export function gbcCorrect(rgba: Uint8ClampedArray): Uint8ClampedArray {
  for (let at = 0; at < rgba.length; at += 4) {
    const r = rgba[at] >> 3, g = rgba[at + 1] >> 3, b = rgba[at + 2] >> 3;
    rgba[at] = Math.min(960, r * 26 + g * 4 + b * 2) >> 2;
    rgba[at + 1] = Math.min(960, g * 24 + b * 8) >> 2;
    rgba[at + 2] = Math.min(960, r * 6 + g * 4 + b * 22) >> 2;
  }
  return rgba;
}

/** CIE L*a*b* of an sRGB "#RRGGBB" (D65). */
function lab(hex: string): [number, number, number] {
  const linear = hexRgb(hex).map((value) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const [x, y, z] = [
    (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047,
    linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722,
    (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883,
  ].map((value) => value > 216 / 24389 ? Math.cbrt(value) : (24389 / 27 * value + 16) / 116);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** How different two colors look (CIE76 ΔE: about 2 is barely visible, under ~12 is hard to tell apart on a small screen). */
export function colorDistance(a: string, b: string): number {
  const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** A palette's neighbouring shades that are hard to tell apart (positions, from 0), for sprites only colors 1–3. */
export const LOW_CONTRAST = 12;
export function closeShades(colors: readonly string[], sprite = false): { a: number; b: number; delta: number }[] {
  const found: { a: number; b: number; delta: number }[] = [];
  for (let at = sprite ? 1 : 0; at < colors.length - 1; at += 1) {
    const delta = colorDistance(colors[at], colors[at + 1]);
    if (delta < LOW_CONTRAST) found.push({ a: at, b: at + 1, delta: Math.round(delta * 10) / 10 });
  }
  return found;
}

const toHsl = (hex: string): [number, number, number] => {
  const [r, g, b] = hexRgb(hex).map((value) => value / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const fromHsl = (h: number, s: number, l: number): string => {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[f(0), f(8), f(4)].map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
};
/** Moves hue `from` toward `to` by `amount` (0–1) the short way round. */
const pullHue = (from: number, to: number, amount: number) => { const turn = ((to - from + 540) % 360) - 180; return (from + turn * amount + 360) % 360; };

/**
 * Day-to-night variants of a palette, as a starting point: D cooler and lilac, N dark and blue, S warm and
 * saturated. Modeled on how the author's DWC set's D, N and S palettes differ from their base palettes.
 */
export function paletteVariant(colors: readonly string[], variant: "D" | "N" | "S"): string[] {
  return colors.map((color, at) => {
    const [h, s, l] = toHsl(color);
    const darkest = at === colors.length - 1;
    if (variant === "D") return darkest ? fromHsl(pullHue(h, 248, 0.7), Math.min(1, s * 0.9 + 0.1), l * 0.9 + 0.04) : fromHsl(at === 0 ? pullHue(h, 25, 0.3) : pullHue(h, 300, 0.45), s * 0.65, Math.min(0.95, l * 1.05));
    // Night: lights go grey (the DWC night palettes keep color only in their darks), everything about half as light.
    if (variant === "N") return fromHsl(pullHue(h, 240, 0.55), Math.min(1, s * (0.15 + 0.3 * at)), l * 0.5);
    return fromHsl(pullHue(h, 15, 0.45), Math.min(0.95, s * 1.25 + 0.08), l * 0.8);
  });
}
