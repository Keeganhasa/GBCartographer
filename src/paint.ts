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
export interface Floating { pixels: Uint8Array; w: number; h: number; x: number; y: number }
export type Mirror = "off" | "x" | "y" | "xy";

export function hexRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1, 7), 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

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
 * Turns RGBA pixels into shades. The four GB greens map exactly. A tile drawn entirely in the colors of one
 * palette gets that palette (`cells` holds its position + 1, 0 for none) and its pixels become positions in it.
 * A tile of up to four other colors gets a palette made from them ("File 1", …, lightest first), added after the
 * library's in `palettes`. Any color left over goes to the shade nearest in brightness (`snapped` counts those).
 * Mostly see-through pixels become CLEAR. Colors within NEAR_SHADE_TOLERANCE of a GB green count as that green
 * (`near` counts them), as in the main app: exported art is often a hair off.
 */
export function quantize(rgba: Uint8ClampedArray, width: number, height: number, library: readonly Palette[] = [], keyGreen = false): Picture {
  const rgbKey = ([r, g, b]: [number, number, number]) => (r << 16) | (g << 8) | b;
  // A pixel is see-through when its alpha is low, or (sprites) when it is GB Studio's key green.
  const clear = (p: number) => rgba[p + 3] < 128 || (keyGreen && rgba[p] === 0x65 && rgba[p + 1] === 0xff && rgba[p + 2] === 0);
  const keyLuma = (key: number) => luma(key >> 16, (key >> 8) & 255, key & 255);
  const shades = GB_SHADES.map(hexRgb);
  const lumas = shades.map(([r, g, b]) => luma(r, g, b));
  const gb = new Map<number, number>(shades.map((shade, index) => [rgbKey(shade), index]));
  // A color near a GB green is read as that green; `nearKeys` remembers each color's answer.
  const nearKeys = new Map<number, number>();
  const exactKey = (key: number) => {
    if (gb.has(key)) return key;
    let found = nearKeys.get(key);
    if (found === undefined) {
      const r = key >> 16, g = (key >> 8) & 255, b = key & 255;
      const index = shades.findIndex(([sr, sg, sb]) => Math.abs(sr - r) <= NEAR_SHADE_TOLERANCE && Math.abs(sg - g) <= NEAR_SHADE_TOLERANCE && Math.abs(sb - b) <= NEAR_SHADE_TOLERANCE);
      found = index >= 0 ? rgbKey(shades[index]) : key;
      nearKeys.set(key, found);
    }
    return found;
  };
  const palettes: Palette[] = library.map(({ name, colors, id }) => ({ name, colors: [...colors], ...(id ? { id } : {}) }));
  const paletteKeys = palettes.map((palette) => palette.colors.map((color) => rgbKey(hexRgb(color))));
  const cw = cellsWide(width), ch = Math.ceil(height / CELL);
  const cells = new Uint8Array(cw * ch);
  const bounds = (cell: number) => {
    const x0 = (cell % cw) * CELL, y0 = Math.floor(cell / cw) * CELL;
    return { x0, y0, x1: Math.min(width, x0 + CELL), y1: Math.min(height, y0 + CELL) };
  };
  const wearing = (keys: number[]) => paletteKeys.findIndex((colors) => keys.every((key) => colors.includes(key)));
  // First the tiles the GB greens or a library palette explain; the rest wait, biggest color sets first, so a tile
  // with fewer colors can share the palette made for a fuller one.
  const waiting: { cell: number; keys: number[] }[] = [];
  for (let cell = 0; cell < cells.length; cell += 1) {
    const { x0, y0, x1, y1 } = bounds(cell);
    const keys: number[] = [];
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const p = (y * width + x) * 4;
        const key = exactKey((rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2]);
        if (!clear(p) && !keys.includes(key)) keys.push(key);
      }
    }
    if (keys.every((key) => gb.has(key))) continue;
    const wears = wearing(keys);
    if (wears >= 0) cells[cell] = wears + 1;
    else if (keys.length <= 4) waiting.push({ cell, keys });
  }
  waiting.sort((a, b) => b.keys.length - a.keys.length);
  for (const { cell, keys } of waiting) {
    let wears = wearing(keys);
    if (wears < 0 && palettes.length - library.length < FILE_PALETTE_LIMIT) {
      const sorted = [...keys].sort((a, b) => keyLuma(b) - keyLuma(a));
      while (sorted.length < 4) sorted.push(sorted[sorted.length - 1]);
      wears = palettes.length;
      paletteKeys.push(sorted);
      palettes.push({ name: `File ${palettes.length - library.length + 1}`, colors: sorted.map((key) => `#${key.toString(16).padStart(6, "0").toUpperCase()}`) });
    }
    if (wears >= 0) cells[cell] = wears + 1;
  }
  const nearest = new Map<number, number>();
  const pixels = new Uint8Array(width * height);
  let hasAlpha = false;
  for (let cell = 0; cell < cells.length; cell += 1) {
    const { x0, y0, x1, y1 } = bounds(cell);
    const colors = cells[cell] ? paletteKeys[cells[cell] - 1] : null;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = y * width + x, p = i * 4;
        if (clear(p)) {
          pixels[i] = CLEAR;
          hasAlpha = true;
          continue;
        }
        const key = exactKey((rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2]);
        let shade = colors ? colors.indexOf(key) : gb.get(key) ?? nearest.get(key);
        if (shade === undefined) {
          const value = luma(rgba[p], rgba[p + 1], rgba[p + 2]);
          shade = 0;
          for (let s = 1; s < 4; s += 1) if (Math.abs(lumas[s] - value) < Math.abs(lumas[shade] - value)) shade = s;
          nearest.set(key, shade);
        }
        pixels[i] = shade;
      }
    }
  }
  return { pixels, cells, hasAlpha, snapped: nearest.size, near: [...nearKeys.values()].filter((key) => gb.has(key)).length, palettes };
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

export function fillRect(pixels: Uint8Array, width: number, height: number, rect: Rect, shade: number) {
  for (let y = Math.max(0, rect.y); y < Math.min(height, rect.y + rect.h); y += 1) {
    pixels.fill(shade, y * width + Math.max(0, rect.x), y * width + Math.min(width, rect.x + rect.w));
  }
}

/** Fills the connected area of one shade around (x, y); false when there was nothing to change. */
export function floodFill(pixels: Uint8Array, width: number, height: number, x: number, y: number, shade: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const from = pixels[y * width + x];
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
