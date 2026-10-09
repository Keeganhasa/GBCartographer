import { describe, expect, it } from "vitest";
import { decodeTileColors, encodeTileColors, resolveScenePaletteIds } from "./gbstudio";

describe("GB Studio tile colors", () => {
  it("decodes runs and single cells, and encodes them back the same way", () => {
    expect(decodeTileColors("0714+03!833+")).toEqual([...Array(20).fill(7), 3, 0x83, 0x83, 0x83]);
    expect(decodeTileColors("")).toEqual([]);
    expect(() => decodeTileColors("07zz")).toThrow(/Unrecognized/);
    for (const encoded of ["0714+03!833+", "81!00167+", "", "05!"]) expect(encodeTileColors(decodeTileColors(encoded))).toBe(encoded);
    expect(encodeTileColors([0x85, 0x85, 1, 0, 0, 0])).toBe("852+01!003+");
  });

  it("fills a scene's eight slots from the project defaults", () => {
    expect(resolveScenePaletteIds(["", "b"], ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "ui"])).toEqual(["d0", "b", "d2", "d3", "d4", "d5", "d6", "ui"]);
  });
});
