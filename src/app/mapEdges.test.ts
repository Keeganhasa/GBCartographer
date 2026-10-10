import { describe, expect, it } from "vitest";
import { copyEdge, edgeMatch, type Picture } from "./mapEdges";

const blank = (width: number, height: number, green = 248): Picture => ({ rgba: Uint8ClampedArray.from({ length: width * height * 4 }, (_, at) => at % 4 === 3 ? 255 : at % 4 === 1 ? green : 200), width, height });
const dark = (picture: Picture, x: number, y: number) => picture.rgba.set([7, 24, 33, 255], (y * picture.width + x) * 4);

describe("map room edges", () => {
  it("counts matching tiles along a shared edge and copies an edge across", () => {
    const left = blank(32, 16), right = blank(32, 16);
    expect(edgeMatch(left, right, "east")).toEqual({ match: 2, total: 2 });
    dark(left, 30, 2); // in left's last tile column, top tile
    expect(edgeMatch(left, right, "east")).toEqual({ match: 1, total: 2 });
    // Copy left's east strip onto right's west strip: they match again.
    copyEdge(left, right, "west", 1);
    expect(edgeMatch(left, right, "east")).toEqual({ match: 2, total: 2 });
    expect(right.rgba[(2 * 32 + 6) * 4 + 1]).toBe(24);
    // North / south and two tiles deep.
    const top = blank(16, 32), bottom = blank(16, 32);
    dark(top, 3, 17);
    copyEdge(top, bottom, "north", 2);
    expect(bottom.rgba[(1 * 16 + 3) * 4 + 1]).toBe(24);
    expect(edgeMatch(top, bottom, "south", 2)).toEqual({ match: 2, total: 2 });
    // One tile deep, the two-deep copy doesn't line up (bottom's first row is top's second-to-last).
    expect(edgeMatch(top, bottom, "south", 1)).toEqual({ match: 1, total: 2 });
  });
});
