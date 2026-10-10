import { describe, expect, it } from "vitest";
import { countUniqueTiles } from "../paint";
import { TOWN, CAVE_DEFAULTS, MOUNTAIN, ROAD, WATER, WORLD_DEFAULTS, caveGrid, drawCave, drawWorld, worldGrid } from "./generators";

/** Floor cells reachable from the first one, by sides. */
function reachable(grid: Uint8Array, w: number, open: (cell: number) => boolean) {
  const start = grid.findIndex(open), seen = new Set([start]), stack = [start];
  while (stack.length) {
    const at = stack.pop()!;
    for (const next of [at - w, at + w, at % w ? at - 1 : -1, (at + 1) % w ? at + 1 : -1]) if (next >= 0 && next < grid.length && open(grid[next]) && !seen.has(next)) { seen.add(next); stack.push(next); }
  }
  return seen.size;
}

describe("map generators", () => {
  it("makes the same cave from the same settings, sized in screens", () => {
    const a = drawCave(CAVE_DEFAULTS), b = drawCave(CAVE_DEFAULTS);
    expect([a.width, a.height]).toEqual([320, 288]);
    expect(a.pixels).toEqual(b.pixels);
    expect(drawCave({ ...CAVE_DEFAULTS, seed: 2 }).pixels).not.toEqual(a.pixels);
  });

  it("keeps a connected cave's floor in one piece, rock all round, with two stairs", () => {
    const { w, h, grid } = caveGrid({ ...CAVE_DEFAULTS, cell: 8, seed: 5 });
    const floor = grid.filter((cell) => cell !== 1).length;
    expect(floor).toBeGreaterThan(0);
    expect(reachable(grid, w, (cell) => cell !== 1)).toBe(floor);
    for (let x = 0; x < w; x += 1) expect([grid[x], grid[(h - 1) * w + x]]).toEqual([1, 1]);
    expect(grid.filter((cell) => cell === 2).length).toBe(2);
  });

  it("joins every dungeon room", () => {
    const { w, grid } = caveGrid({ ...CAVE_DEFAULTS, style: "dungeon", columns: 3, seed: 9 });
    const floor = grid.filter((cell) => cell !== 1).length;
    expect(reachable(grid, w, (cell) => cell !== 1)).toBe(floor);
  });

  it("stays well under a background's tile budget", () => {
    const cave = drawCave(CAVE_DEFAULTS), world = drawWorld(WORLD_DEFAULTS);
    expect(countUniqueTiles(cave.pixels, cave.width, cave.height, false)).toBeLessThan(192);
    expect(countUniqueTiles(world.pixels, world.width, world.height, false)).toBeLessThan(192);
  });

  it("gives an overworld about as much water as asked, its towns, and roads between them", () => {
    const { w, h, grid } = worldGrid(WORLD_DEFAULTS);
    expect([w, h]).toEqual([30, 27]);
    const water = grid.filter((cell) => cell === WATER).length / grid.length;
    expect(water).toBeGreaterThan(0.25);
    expect(water).toBeLessThan(0.5);
    expect(grid.filter((cell) => cell === TOWN).length).toBe(3);
    expect(grid.some((cell) => cell === ROAD)).toBe(true);
    expect(grid.some((cell) => cell === MOUNTAIN)).toBe(true);
    const none = worldGrid({ ...WORLD_DEFAULTS, water: 0, mountains: 0, island: false, towns: 0 }).grid;
    expect(none.some((cell) => cell === WATER || cell === MOUNTAIN || cell === TOWN)).toBe(false);
  });
});
