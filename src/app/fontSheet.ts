/**
 * A GB Studio font sheet drawn from a font file: characters 32–255 in 8 × 8 cells, 16 a row (128 × 112), each
 * glyph in the darkest shade on the lightest, cut to 1 bit (no smoothing). Characters the file lacks stay blank and
 * are listed (the browser would otherwise draw them in another font).
 */
import { fontCharacters } from "../gb/ttf";

/** `codes` is null when the file's character table can't be read (WOFF and WOFF2 compress it): nothing is checked. */
export interface LoadedFont { family: string; codes: Set<number> | null; name: string }
let loadedCount = 0;

export async function loadFontFile(file: File): Promise<LoadedFont> {
  const buffer = await file.arrayBuffer();
  const family = `GBCImport${(loadedCount += 1)}`;
  const face = new FontFace(family, buffer);
  await face.load();
  document.fonts.add(face);
  let codes: Set<number> | null = null;
  try { codes = fontCharacters(buffer); } catch { codes = null; }
  return { family, codes: codes && codes.size ? codes : null, name: file.name.replace(/\.[^.]+$/, "") };
}

/** Shades (0 lightest, 3 darkest) of a 128 × 112 sheet, and the characters the font has no glyph for. */
export function renderFontSheet(font: LoadedFont, size: number, baseline: number): { pixels: Uint8Array; missing: number[] } {
  const canvas = document.createElement("canvas");
  Object.assign(canvas, { width: 128, height: 112 });
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.font = `${size}px "${font.family}"`;
  context.textBaseline = "alphabetic";
  context.fillStyle = "#000";
  const missing: number[] = [];
  for (let index = 0; index < 224; index += 1) {
    const code = 32 + index;
    // 127 and 128–159 are control codes: no font draws them, so they stay blank without a mention.
    if (code === 127 || (code >= 128 && code < 160)) continue;
    if (code !== 32 && font.codes && !font.codes.has(code)) { missing.push(code); continue; }
    const x = (index % 16) * 8, y = Math.floor(index / 16) * 8;
    context.save();
    context.beginPath();
    context.rect(x, y, 8, 8);
    context.clip();
    context.fillText(String.fromCharCode(code), x, y + baseline);
    context.restore();
  }
  const data = context.getImageData(0, 0, 128, 112).data;
  const pixels = new Uint8Array(128 * 112);
  for (let at = 0; at < pixels.length; at += 1) pixels[at] = data[at * 4 + 3] >= 128 ? 3 : 0;
  return { pixels, missing };
}
