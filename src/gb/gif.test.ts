import { describe, expect, it } from "vitest";
import { encodeGif, lzw } from "./gif";

/** GIF's LZW decoder, straight from the spec, to check the encoder. */
function unlzw(bytes: number[], minSize: number): number[] {
  const clear = 1 << minSize, end = clear + 1;
  let width = minSize + 1, bitPos = 0;
  const read = () => {
    let code = 0;
    for (let bit = 0; bit < width; bit += 1, bitPos += 1) code |= ((bytes[bitPos >> 3] >> (bitPos & 7)) & 1) << bit;
    return code;
  };
  let table: number[][] = [];
  const reset = () => { table = Array.from({ length: clear + 2 }, (_, index) => [index]); width = minSize + 1; };
  reset();
  const out: number[] = [];
  let previous: number[] | null = null;
  for (;;) {
    const code = read();
    if (code === clear) { reset(); previous = null; continue; }
    if (code === end) break;
    let entry: number[];
    if (code < table.length) entry = table[code];
    else if (previous) entry = [...previous, previous[0]];
    else throw new Error("bad code");
    out.push(...entry);
    if (previous) table.push([...previous, entry[0]]);
    previous = entry;
    if (table.length === 1 << width && width < 12) width += 1;
  }
  return out;
}

describe("GIF", () => {
  it("LZW-codes index streams that a GIF decoder reads back, through table resets", () => {
    for (const [length, colors] of [[1, 2], [7, 2], [300, 4], [20000, 16], [70000, 256]] as const) {
      const data = Uint8Array.from({ length }, (_, at) => ((at * 7919) ^ (at >> 3)) % colors);
      const minSize = Math.max(2, Math.ceil(Math.log2(colors)));
      expect(unlzw(lzw(data, minSize), minSize)).toEqual([...data]);
    }
  });

  it("writes a looping GIF89a with a see-through index, one frame per image", () => {
    const frame = (shade: number) => Uint8ClampedArray.from({ length: 4 * 4 * 4 }, (_, at) => at % 4 === 3 ? (at < 16 ? 0 : 255) : shade);
    const gif = encodeGif([frame(10), frame(200)], 4, 4, 27);
    expect(String.fromCharCode(...gif.slice(0, 6))).toBe("GIF89a");
    expect([gif[6] | (gif[7] << 8), gif[8] | (gif[9] << 8)]).toEqual([4, 4]);
    expect(gif[gif.length - 1]).toBe(0x3b);
    const text = String.fromCharCode(...gif);
    expect(text).toContain("NETSCAPE2.0");
    // Two graphic control extensions, each with a 0.27 s delay and transparency on.
    const controls = [...text.matchAll(/\x21\xf9\x04/g)].map((match) => match.index!);
    expect(controls).toHaveLength(2);
    for (const at of controls) expect([gif[at + 3] & 1, gif[at + 4] | (gif[at + 5] << 8)]).toEqual([1, 27]);
    // Index 0 is kept for see-through: 255 colors fit, 256 don't.
    const ramp = (count: number) => Uint8ClampedArray.from({ length: count * 4 }, (_, at) => at % 4 === 3 ? 255 : (at >> 2) % count);
    expect(() => encodeGif([ramp(255)], 255, 1, 10)).not.toThrow();
    expect(() => encodeGif([ramp(256)], 256, 1, 10)).toThrow("Too many colors");
  });
});
