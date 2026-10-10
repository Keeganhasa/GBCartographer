import { describe, expect, it } from "vitest";
import { hasPalette, storeShelves } from "./store";

const p = (name: string) => ({ name, colors: ["#FFFFFF", "#AAAAAA", "#555555", "#000000"] });

describe("store", () => {
  it("makes a small collection one set and cuts a big one by name prefix, leftovers in More", () => {
    const shelves = storeShelves([
      { name: "Small", author: "A", license: "CC0", palettes: [p("One"), p("Two")] },
      { name: "Big", palettes: [p("DWC-1-Cliffs"), p("DWC-2-Sky"), p("DWC-3-Sea"), p("Farm-1"), p("Farm-2"), p("Farm-3"), p("Odd"), p("XXOld"), p("zOld"), p("Diner-1"), p("Diner-2"), p("Lone-1")] },
    ]);
    expect(shelves[0].sets.map((set) => set.name)).toEqual(["Small"]);
    expect(shelves[0].author).toBe("A");
    expect(shelves[1].sets.map((set) => [set.name, set.palettes.length])).toEqual([["DWC", 3], ["Farm", 3], ["Diner", 2], ["More", 2]]);
  });

  it("finds the bundled library's shelves, the new ones credited", () => {
    const shelves = storeShelves();
    const spicy = shelves.find((shelf) => shelf.name === "SpicyGame");
    expect(spicy?.license).toBe("Public domain");
    expect(spicy?.sets.map((set) => set.name)).toEqual(["SpicyGame GB", "Vibrant-14", "VIBE-20", "CMYK Printer"]);
    expect(spicy?.sets[2].palettes).toHaveLength(8);
    expect(shelves.find((shelf) => shelf.name === "Overworld")?.license).toBe("CC0");
  });

  it("knows a palette the project has by name and colors", () => {
    expect(hasPalette([p("One")], { name: "One", colors: ["#ffffff", "#aaaaaa", "#555555", "#000000"] })).toBe(true);
    expect(hasPalette([p("One")], p("Two"))).toBe(false);
  });
});
