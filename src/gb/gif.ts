/**
 * A small animated GIF writer (GIF89a, one global color table, LZW): enough for Game Boy pictures, which have a
 * handful of colors. Pixels with alpha below 128 are see-through. Frames all share one size and one delay.
 */

/** Packs codes of a growing bit width, least significant bit first, as GIF wants. */
class BitWriter {
  bytes: number[] = [];
  private value = 0;
  private bits = 0;
  write(code: number, width: number) {
    this.value |= code << this.bits;
    this.bits += width;
    while (this.bits >= 8) {
      this.bytes.push(this.value & 255);
      this.value >>>= 8;
      this.bits -= 8;
    }
  }
  flush() {
    if (this.bits > 0) this.bytes.push(this.value & 255);
    this.value = 0;
    this.bits = 0;
  }
}

/** GIF's LZW: `indices` (color table positions) with a minimum code size of `minSize` bits. */
export function lzw(indices: Uint8Array, minSize: number): number[] {
  const clear = 1 << minSize, end = clear + 1;
  const out = new BitWriter();
  let table = new Map<number, number>();
  let next = end + 1, width = minSize + 1;
  out.write(clear, width);
  let prefix = indices[0] ?? 0;
  for (let at = 1; at < indices.length; at += 1) {
    const value = indices[at];
    const key = prefix * 256 + value;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    out.write(prefix, width);
    if (next < 4096) {
      table.set(key, next);
      if (next === 1 << width && width < 12) width += 1;
      next += 1;
    } else {
      out.write(clear, width);
      table = new Map();
      next = end + 1;
      width = minSize + 1;
    }
    prefix = value;
  }
  out.write(prefix, width);
  out.write(end, width);
  out.flush();
  return out.bytes;
}

/**
 * Encodes frames (RGBA, `width` × `height` each) as a looping GIF, `delay` hundredths of a second per frame.
 * Throws when the frames use more than 255 colors (plus see-through).
 */
export function encodeGif(frames: readonly Uint8ClampedArray[], width: number, height: number, delay: number): Uint8Array {
  const colors = new Map<number, number>();
  let clearUsed = false;
  for (const frame of frames) {
    for (let at = 0; at < frame.length; at += 4) {
      if (frame[at + 3] < 128) { clearUsed = true; continue; }
      const key = (frame[at] << 16) | (frame[at + 1] << 8) | frame[at + 2];
      if (!colors.has(key)) colors.set(key, colors.size + 1);
    }
  }
  if (colors.size > 255) throw new Error(`Too many colors for a GIF (${colors.size}).`);
  // Index 0 is see-through (or simply unused); the colors follow it.
  let bits = 1;
  while (1 << bits < colors.size + 1) bits += 1;
  const tableSize = 1 << bits;
  const bytes: number[] = [];
  const word = (value: number) => bytes.push(value & 255, (value >> 8) & 255);
  const text = (value: string) => { for (const char of value) bytes.push(char.charCodeAt(0)); };
  text("GIF89a");
  word(width);
  word(height);
  bytes.push(0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0);
  const table = new Array<number>(tableSize * 3).fill(0);
  for (const [key, index] of colors) table.splice(index * 3, 3, key >> 16, (key >> 8) & 255, key & 255);
  bytes.push(...table);
  // Loop forever (the NETSCAPE2.0 application extension).
  bytes.push(0x21, 0xff, 11);
  text("NETSCAPE2.0");
  bytes.push(3, 1, 0, 0, 0);
  const minSize = Math.max(2, bits);
  for (const frame of frames) {
    // Graphic control: clear to the background between frames, the delay, index 0 see-through when used.
    bytes.push(0x21, 0xf9, 4, (2 << 2) | (clearUsed ? 1 : 0));
    word(delay);
    bytes.push(0, 0);
    bytes.push(0x2c);
    word(0); word(0); word(width); word(height);
    bytes.push(0);
    const indices = new Uint8Array(width * height);
    for (let at = 0; at < indices.length; at += 1) {
      const p = at * 4;
      indices[at] = frame[p + 3] < 128 ? 0 : colors.get((frame[p] << 16) | (frame[p + 1] << 8) | frame[p + 2])!;
    }
    bytes.push(minSize);
    const data = lzw(indices, minSize);
    for (let at = 0; at < data.length; at += 255) {
      const block = data.slice(at, at + 255);
      bytes.push(block.length, ...block);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}
