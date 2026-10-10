/**
 * The text tool (W5, the author's pick 2026-10-10): types with one of the project's GB Studio font sheets straight
 * onto a picture. A font sheet is 8 × 8 glyphs from character 32, 16 a row; white (or see-through) is paper and
 * magenta marks a variable-width glyph's unused columns, as GB Studio reads them. The text becomes a floating piece
 * of the picture: see-through around the letters, so it can be moved before it is stamped down.
 */
import { CLEAR, type Floating } from "../paint";

/** A font sheet read for typing: which pixels are ink, and each glyph's width. */
export interface FontSheet { width: number; height: number; ink: Uint8Array; widths: Uint8Array }

/** Reads a font sheet's RGBA: ink is anything dark and opaque that isn't magenta; widths come from magenta columns. */
export function readFontSheet(rgba: Uint8ClampedArray, width: number, height: number): FontSheet {
  const ink = new Uint8Array(width * height);
  const magenta = new Uint8Array(width * height);
  for (let at = 0; at < width * height; at += 1) {
    const r = rgba[at * 4], g = rgba[at * 4 + 1], b = rgba[at * 4 + 2], a = rgba[at * 4 + 3];
    if (a < 128) continue;
    if (r > 249 && b > 249 && g < 250) { magenta[at] = 1; continue; }
    if (g <= 249) ink[at] = 1;
  }
  const columns = Math.floor(width / 8), rows = Math.floor(height / 8);
  const widths = new Uint8Array(columns * rows);
  for (let glyph = 0; glyph < widths.length; glyph += 1) {
    const sx = (glyph % columns) * 8, sy = Math.floor(glyph / columns) * 8;
    // A variable-width glyph ends where its columns turn all magenta.
    let w = 8;
    while (w > 0 && Array.from({ length: 8 }, (_, y) => magenta[(sy + y) * width + sx + w - 1]).every(Boolean)) w -= 1;
    widths[glyph] = w;
  }
  return { width, height, ink, widths };
}

export interface TextOptions {
  /** The shade the letters are drawn in (0 lightest … 3 darkest). */
  ink: number;
  /** Swap: the letters see-through in a box of the ink shade (light text on dark, or the other way round). */
  invert: boolean;
  /** A box of the opposite shade behind the letters, one pixel bigger all round. */
  box: boolean;
  /** Pixels between lines (GB Studio's dialogue uses 0). */
  leading: number;
}

/** Each character's glyph and how far the pen moves: unknown characters are skipped; a space is never narrower than 2. */
function glyphOf(font: FontSheet, char: string) {
  const columns = Math.floor(font.width / 8), index = char.charCodeAt(0) - 32;
  if (index < 0 || index >= font.widths.length) return null;
  const width = font.widths[index] || (char === " " ? 2 : 0);
  return { sx: (index % columns) * 8, sy: Math.floor(index / columns) * 8, width: Math.max(char === " " ? 2 : 1, width) };
}

/** Lays the text out (one line per newline) and draws it as a floating piece at (x, y): CLEAR where nothing is drawn. */
export function renderText(font: FontSheet, text: string, options: TextOptions, x = 0, y = 0): Floating {
  const lines = text.split("\n");
  const widthOf = (line: string) => [...line].reduce((sum, char) => sum + (glyphOf(font, char)?.width ?? 0), 0);
  const pad = options.box || options.invert ? 1 : 0;
  const w = Math.max(1, ...lines.map(widthOf)) + pad * 2;
  const h = lines.length * 8 + (lines.length - 1) * options.leading + pad * 2;
  const paper = 3 - options.ink;
  const pixels = new Uint8Array(w * h).fill(options.invert ? options.ink : options.box ? paper : CLEAR);
  const letter = options.invert ? (options.box ? paper : CLEAR) : options.ink;
  lines.forEach((line, row) => {
    let pen = pad;
    const top = pad + row * (8 + options.leading);
    for (const char of line) {
      const glyph = glyphOf(font, char);
      if (!glyph) continue;
      for (let gy = 0; gy < 8; gy += 1) for (let gx = 0; gx < glyph.width; gx += 1) {
        if (font.ink[(glyph.sy + gy) * font.width + glyph.sx + gx]) pixels[(top + gy) * w + pen + gx] = letter;
      }
      pen += glyph.width;
    }
  });
  return { pixels, w, h, x, y };
}
