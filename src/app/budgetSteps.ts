/**
 * Tile budget fixer steps (W6): the near-duplicate tile merges a picture could take, cheapest first, and applying
 * them one at a time. Pure: nothing here draws or keeps state.
 */
import { CLEAR, tileUsage } from "../paint";

const CELL = 8;

/** One candidate merge: tile `from` (used once) would become a copy of tile `into`; `diff` pixels differ. */
export interface MergeStep { from: number; into: number; diff: number }

/**
 * The candidate merges at most `maxDiff` pixels apart, fewest differences first (then in reading order). Tiles are
 * cell indexes, row by row. Two used-once tiles that are each other's nearest are listed once (both would swap).
 */
export function mergeSteps(pixels: Uint8Array, width: number, height: number, flips: boolean, maxDiff: number): MergeStep[] {
  const usage = tileUsage(pixels, width, height, flips, maxDiff);
  const steps: MergeStep[] = [];
  usage.near.forEach((into, from) => { if (into >= 0) steps.push({ from, into, diff: usage.diff[from] }); });
  steps.sort((a, b) => a.diff - b.diff || a.from - b.from);
  const listed = new Set<string>();
  return steps.filter((step) => {
    if (listed.has(`${step.into}>${step.from}`)) return false;
    listed.add(`${step.from}>${step.into}`);
    return true;
  });
}

/** Copies tile `into` over tile `from` (8 × 8, clipped at the picture's edges), in place. */
export function applyMerge(pixels: Uint8Array, width: number, step: MergeStep) {
  const height = pixels.length / width, cw = Math.ceil(width / CELL);
  const tx = (step.from % cw) * CELL, ty = Math.floor(step.from / cw) * CELL;
  const sx = (step.into % cw) * CELL, sy = Math.floor(step.into / cw) * CELL;
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    if (tx + x >= width || ty + y >= height || sx + x >= width || sy + y >= height) continue;
    pixels[(ty + y) * width + tx + x] = pixels[(sy + y) * width + sx + x];
  }
}

/**
 * Applies several steps in order, in place, skipping any that would copy from a tile already changed here or change
 * a tile already copied from (chains would undo each other's saving). Returns how many were applied.
 */
export function applyMerges(pixels: Uint8Array, width: number, steps: readonly MergeStep[]): number {
  const changed = new Set<number>(), sources = new Set<number>();
  let applied = 0;
  for (const step of steps) {
    if (changed.has(step.into) || sources.has(step.from) || changed.has(step.from)) continue;
    applyMerge(pixels, width, step);
    changed.add(step.from);
    sources.add(step.into);
    applied += 1;
  }
  return applied;
}

/** A tile's 64 pixels, row by row; the part past the picture's edge is see-through. */
export function tilePixels(pixels: Uint8Array, width: number, height: number, tile: number): Uint8Array {
  const cw = Math.ceil(width / CELL), tx = (tile % cw) * CELL, ty = Math.floor(tile / cw) * CELL;
  const out = new Uint8Array(CELL * CELL).fill(CLEAR);
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    if (tx + x < width && ty + y < height) out[y * CELL + x] = pixels[(ty + y) * width + tx + x];
  }
  return out;
}
