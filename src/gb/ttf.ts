/**
 * Which characters a TrueType / OpenType font has: its cmap table (formats 4 and 12, the common Unicode ones).
 * Enough to tell which glyphs of a GB Studio font sheet the font can't draw (a browser silently draws those in
 * another font).
 */
export function fontCharacters(buffer: ArrayBuffer): Set<number> {
  const view = new DataView(buffer);
  const found = new Set<number>();
  const tables = view.getUint16(4);
  let cmap = -1;
  for (let at = 0; at < tables; at += 1) {
    const record = 12 + at * 16;
    if (String.fromCharCode(view.getUint8(record), view.getUint8(record + 1), view.getUint8(record + 2), view.getUint8(record + 3)) === "cmap") cmap = view.getUint32(record + 8);
  }
  if (cmap < 0) return found;
  const subtables = view.getUint16(cmap + 2);
  for (let at = 0; at < subtables; at += 1) {
    const record = cmap + 4 + at * 8;
    const platform = view.getUint16(record), encoding = view.getUint16(record + 2), offset = cmap + view.getUint32(record + 4);
    if (!(platform === 3 && (encoding === 1 || encoding === 10)) && platform !== 0) continue;
    const format = view.getUint16(offset);
    if (format === 4) {
      const segments = view.getUint16(offset + 6) / 2;
      const ends = offset + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, ranges = deltas + segments * 2;
      for (let segment = 0; segment < segments; segment += 1) {
        const end = view.getUint16(ends + segment * 2), start = view.getUint16(starts + segment * 2);
        const delta = view.getInt16(deltas + segment * 2), range = view.getUint16(ranges + segment * 2);
        for (let code = start; code <= end && code !== 0xffff; code += 1) {
          let glyph: number;
          if (range === 0) glyph = (code + delta) & 0xffff;
          else {
            const index = ranges + segment * 2 + range + (code - start) * 2;
            glyph = index + 1 < view.byteLength ? view.getUint16(index) : 0;
            if (glyph) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph) found.add(code);
        }
      }
    } else if (format === 12) {
      const groups = view.getUint32(offset + 12);
      for (let group = 0; group < groups; group += 1) {
        const record12 = offset + 16 + group * 12;
        const start = view.getUint32(record12), end = view.getUint32(record12 + 4);
        for (let code = start; code <= end && code <= 0x10ffff && code - start < 65536; code += 1) found.add(code);
      }
    }
  }
  return found;
}
