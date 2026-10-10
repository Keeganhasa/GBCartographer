import { describe, expect, it } from "vitest";
import { fontCharacters } from "./ttf";

/** A minimal font file: one cmap table with a format 4 subtable mapping A–F (and the 0xFFFF end segment). */
function tinyFont(): ArrayBuffer {
  const sub = [4, 32, 0, 4, 4, 1, 0, 70, 0xffff, 0, 65, 0xffff, 1, 1, 0, 0];
  const cmap = [0, 1, 3, 1, 0, 12];
  const bytes = new DataView(new ArrayBuffer(12 + 16 + 12 + sub.length * 2));
  bytes.setUint32(0, 0x00010000);
  bytes.setUint16(4, 1);
  "cmap".split("").forEach((char, at) => bytes.setUint8(12 + at, char.charCodeAt(0)));
  bytes.setUint32(12 + 8, 28);
  cmap.forEach((value, at) => (at === 5 ? bytes.setUint32(28 + 8, value) : at < 4 ? bytes.setUint16(28 + at * 2, value) : 0));
  sub.forEach((value, at) => bytes.setUint16(40 + at * 2, value));
  return bytes.buffer;
}

describe("font files", () => {
  it("reads which characters a font has from its cmap", () => {
    const found = fontCharacters(tinyFont());
    expect([...found].sort((a, b) => a - b)).toEqual([65, 66, 67, 68, 69, 70]);
    expect(fontCharacters(new ArrayBuffer(12)).size).toBe(0);
  });
});
