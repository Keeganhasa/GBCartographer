// Tile budget fixer steps: listing near-duplicate merges and applying them.
import { describe, expect, it } from "vitest";
import { CLEAR, countUniqueTiles } from "../paint";
import { applyMerge, applyMerges, mergeSteps, tilePixels } from "./budgetSteps";

/** A picture `tiles` tiles wide and one high, all shade 0, with the given pixels set to 3: [tile, x, y]. */
function strip(tiles: number, marks: [number, number, number][] = []) {
  const width = tiles * 8, pixels = new Uint8Array(width * 8);
  for (const [tile, x, y] of marks) pixels[y * width + tile * 8 + x] = 3;
  return { pixels, width };
}

describe("tile budget fixer steps", () => {
  it("lists used-once tiles near another, cheapest first, without changing the picture", () => {
    // Tiles 0 and 1 are the same plain tile; tile 2 is one pixel off, tile 3 three pixels off.
    const { pixels, width } = strip(4, [[2, 1, 1], [3, 2, 2], [3, 4, 4], [3, 6, 6]]);
    const before = pixels.slice();
    expect(mergeSteps(pixels, width, 8, false, 3)).toEqual([{ from: 2, into: 0, diff: 1 }, { from: 3, into: 0, diff: 3 }]);
    expect(mergeSteps(pixels, width, 8, false, 2)).toEqual([{ from: 2, into: 0, diff: 1 }]);
    expect(pixels).toEqual(before);
  });

  it("lists two used-once tiles that are each other's nearest only once", () => {
    const { pixels, width } = strip(2, [[1, 0, 0]]);
    expect(mergeSteps(pixels, width, 8, false, 3)).toEqual([{ from: 0, into: 1, diff: 1 }]);
  });

  it("leaves mirrored copies alone when flipped tiles merge", () => {
    // Tile 1 is tile 0 mirrored: one pattern used twice with flips, two used-once tiles without.
    const { pixels, width } = strip(2, [[0, 0, 0], [1, 7, 0]]);
    expect(mergeSteps(pixels, width, 8, true, 3)).toEqual([]);
    expect(mergeSteps(pixels, width, 8, false, 3)).toHaveLength(1);
  });

  it("copies one tile over another and the unique count drops", () => {
    const { pixels, width } = strip(3, [[2, 1, 1]]);
    expect(countUniqueTiles(pixels, width, 8, false)).toBe(2);
    applyMerge(pixels, width, { from: 2, into: 0, diff: 1 });
    expect(pixels[1 * width + 2 * 8 + 1]).toBe(0);
    expect(countUniqueTiles(pixels, width, 8, false)).toBe(1);
  });

  it("clips a merge at the picture's edge", () => {
    // 12 wide: tile 1 is half a tile.
    const width = 12, pixels = new Uint8Array(width * 8).fill(1);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) pixels[y * width + x] = 2;
    applyMerge(pixels, width, { from: 1, into: 0, diff: 4 });
    expect([...pixels.slice(8, 12)]).toEqual([2, 2, 2, 2]);
    expect(pixels.length).toBe(96);
    expect([...tilePixels(pixels, width, 8, 1).slice(0, 8)]).toEqual([2, 2, 2, 2, CLEAR, CLEAR, CLEAR, CLEAR]);
  });

  it("skips chained steps in one batch so they don't undo each other", () => {
    const { pixels, width } = strip(3, [[1, 0, 0], [2, 0, 0], [2, 1, 0]]);
    // 0 → 1 then 1 → 2: the second would change the tile the first copied from.
    expect(applyMerges(pixels, width, [{ from: 0, into: 1, diff: 1 }, { from: 1, into: 2, diff: 1 }])).toBe(1);
    expect(countUniqueTiles(pixels, width, 8, false)).toBe(2);
  });
});
