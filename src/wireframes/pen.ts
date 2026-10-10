/**
 * Drawing for the wireframe art (the map generators and the wireframe library): simple primitives in the four GB
 * shades (0 lightest … 3 darkest) and CLEAR, into one box of a picture. Everything outside the box is left alone.
 */
import { CLEAR } from "../paint";

export { CLEAR };

/** A picture in GB shades (or CLEAR), one byte per pixel. */
export interface Canvas { width: number; height: number; pixels: Uint8Array }

export function canvas(width: number, height: number, fill = 0): Canvas {
  return { width, height, pixels: new Uint8Array(width * height).fill(fill) };
}

export class Pen {
  readonly w: number; readonly h: number;
  /** A box of `out` at (x0, y0), w × h (a square when only w is given; the whole canvas when neither is). */
  constructor(readonly out: Canvas, readonly x0 = 0, readonly y0 = 0, w?: number, h?: number) {
    this.w = w ?? out.width;
    this.h = h ?? (w === undefined ? out.height : w);
  }
  /** The same canvas, a box inside this one. */
  at(x: number, y: number, w: number, h = w): Pen { return new Pen(this.out, this.x0 + x, this.y0 + y, w, h); }
  dot(x: number, y: number, shade: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const px = this.x0 + x, py = this.y0 + y;
    if (px < 0 || py < 0 || px >= this.out.width || py >= this.out.height) return;
    this.out.pixels[py * this.out.width + px] = shade;
  }
  get(x: number, y: number): number { return this.out.pixels[(this.y0 + y) * this.out.width + this.x0 + x]; }
  rect(x: number, y: number, w: number, h: number, shade: number) {
    for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) this.dot(xx, yy, shade);
  }
  box(x: number, y: number, w: number, h: number, shade: number) {
    this.rect(x, y, w, 1, shade); this.rect(x, y + h - 1, w, 1, shade); this.rect(x, y, 1, h, shade); this.rect(x + w - 1, y, 1, h, shade);
  }
  /** A filled box with an outline. */
  panel(x: number, y: number, w: number, h: number, fill: number, line = 3) { this.rect(x, y, w, h, fill); this.box(x, y, w, h, line); }
  /** A box with its corners cut (a rounded look at small sizes). */
  round(x: number, y: number, w: number, h: number, fill: number, line = 3) {
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
    this.rect(x + 1, y, w - 2, 1, line); this.rect(x + 1, y + h - 1, w - 2, 1, line);
    this.rect(x, y + 1, 1, h - 2, line); this.rect(x + w - 1, y + 1, 1, h - 2, line);
  }
  fill(shade: number) { this.rect(0, 0, this.w, this.h, shade); }
  /** A line along one side (0 top, 1 right, 2 bottom, 3 left). */
  side(side: number, shade: number, inset = 0) {
    if (side === 0) this.rect(0, inset, this.w, 1, shade);
    else if (side === 1) this.rect(this.w - 1 - inset, 0, 1, this.h, shade);
    else if (side === 2) this.rect(0, this.h - 1 - inset, this.w, 1, shade);
    else this.rect(inset, 0, 1, this.h, shade);
  }
  line(fromX: number, fromY: number, toX: number, toY: number, shade: number) {
    // Whole pixels only: the walk below stops when it lands exactly on the end.
    const x1 = Math.round(fromX), y1 = Math.round(fromY), x2 = Math.round(toX), y2 = Math.round(toY);
    const dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1), sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    let error = dx + dy, x = x1, y = y1;
    for (;;) {
      this.dot(x, y, shade);
      if (x === x2 && y === y2) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
  }
  /** An ellipse in the box (x, y, w, h): filled with `fill` (unless null), outlined with `line`. */
  oval(x: number, y: number, w: number, h: number, fill: number | null, line = 3) {
    const cx = x + (w - 1) / 2, cy = y + (h - 1) / 2, rx = w / 2, ry = h / 2;
    const inside = (px: number, py: number) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
    for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) {
      if (!inside(px, py)) continue;
      const edge = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1);
      if (edge) this.dot(px, py, line); else if (fill !== null) this.dot(px, py, fill);
    }
  }
  /** A triangle pointing up, its base `w` wide at the bottom of (x, y, w, h). */
  peak(x: number, y: number, w: number, h: number, fill: number, line = 3) {
    for (let row = 0; row < h; row += 1) {
      const half = Math.round(row * (w - 1) / 2 / Math.max(1, h - 1));
      const mid = x + Math.floor((w - 1) / 2), odd = (w - 1) % 2;
      this.rect(mid - half + 1, y + row, half * 2 - 1 + odd, 1, fill);
      this.dot(mid - half, y + row, line); this.dot(mid + half + odd, y + row, line);
    }
    this.rect(x, y + h - 1, w, 1, line);
  }
  /** Pixels from rows of characters: "0"–"3" a shade, anything else left as it is. */
  bitmap(x: number, y: number, rows: string[]) {
    rows.forEach((row, ry) => [...row].forEach((char, rx) => { if (char >= "0" && char <= "3") this.dot(x + rx, y + ry, Number(char)); }));
  }
  /** Copies another canvas in, CLEAR pixels left out. */
  stamp(source: Canvas, x = 0, y = 0) {
    for (let sy = 0; sy < source.height; sy += 1) for (let sx = 0; sx < source.width; sx += 1) {
      const shade = source.pixels[sy * source.width + sx];
      if (shade !== CLEAR) this.dot(x + sx, y + sy, shade);
    }
  }
  /** Mirrors the box left to right (for right-facing frames drawn left-facing, and the like). */
  flip() {
    for (let y = 0; y < this.h; y += 1) for (let x = 0; x < Math.floor(this.w / 2); x += 1) {
      const a = this.get(x, y), b = this.get(this.w - 1 - x, y);
      this.dot(x, y, b); this.dot(this.w - 1 - x, y, a);
    }
  }
  /** Words in the 3 × 5 wireframe letters (capitals, digits, a little punctuation), 4 pixels a letter. */
  text(x: number, y: number, words: string, shade = 3) {
    let at = x;
    for (const letter of words.toUpperCase()) {
      const rows = GLYPHS[letter];
      if (rows) rows.forEach((row, ry) => { for (let rx = 0; rx < 3; rx += 1) if (row & (4 >> rx)) this.dot(at + rx, y + ry, shade); });
      at += 4;
    }
  }
}

/** Pixel width of `words` in the 3 × 5 letters. */
export const textWidth = (words: string) => Math.max(0, words.length * 4 - 1);

/** The 3 × 5 letters, each row three bits (4 = left). The author's own (CC0), made for these placeholders. */
const GLYPHS: Record<string, number[]> = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6],
  6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
  "!": [2, 2, 2, 0, 2], "?": [6, 1, 2, 0, 2], ".": [0, 0, 0, 0, 2], ",": [0, 0, 0, 2, 4], ":": [0, 2, 0, 2, 0], "-": [0, 0, 7, 0, 0],
  "+": [0, 2, 7, 2, 0], "/": [1, 1, 2, 4, 4], "'": [2, 2, 0, 0, 0], "(": [1, 2, 2, 2, 1], ")": [4, 2, 2, 2, 4], ">": [4, 2, 1, 2, 4], "<": [1, 2, 4, 2, 1], " ": [0, 0, 0, 0, 0],
};
