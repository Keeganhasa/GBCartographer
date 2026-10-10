// The palette set wizard's helpers (src/app/paletteSet.ts): grouping a loose color list into GB Studio palettes.
import { describe, expect, it } from "vitest";
import { baseFromFile, baseFromLink, flattenColors, groupColors, librarySets, lightestFirst, lightness, paletteNames, swapColors } from "./paletteSet";

// Sweetie 16 (Lospec), a common 16-color palette.
const SWEETIE = ["#1A1C2C", "#5D275D", "#B13E53", "#EF7D57", "#FFCD75", "#A7F070", "#38B764", "#257179", "#29366F", "#3B5DC9", "#41A6F6", "#73EFF7", "#F4F4F4", "#94B0C2", "#566C86", "#333C57"];
const isLightestFirst = (colors: string[]) => colors.every((color, at) => at === 0 || lightness(colors[at - 1]) >= lightness(color));
/** n distinct grays and hues, for size tests. */
const spread = (n: number) => Array.from({ length: n }, (_, at) => `#${[at * 37 % 256, at * 71 % 256, at * 113 % 256].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`);

describe("palette set", () => {
  it("groups a color list into eight palettes of four, lightest first, using every color", () => {
    const palettes = groupColors(SWEETIE);
    expect(palettes).toHaveLength(8);
    for (const colors of palettes) {
      expect(colors).toHaveLength(4);
      expect(new Set(colors).size).toBe(4);
      expect(isLightestFirst(colors)).toBe(true);
    }
    expect(new Set(palettes.flat())).toEqual(new Set(SWEETIE));
    // No two palettes are the same.
    expect(new Set(palettes.map((colors) => [...colors].sort().join())).size).toBe(8);
  });

  it("uses every color up to 32, and 32 different ones beyond that", () => {
    for (const n of [5, 9, 17, 24, 31, 32]) {
      const colors = spread(n), palettes = groupColors(colors);
      expect(palettes.every((palette) => palette.length === 4 && isLightestFirst(palette))).toBe(true);
      expect(new Set(palettes.flat())).toEqual(new Set(colors));
    }
    const many = groupColors(spread(48));
    expect(many).toHaveLength(8);
    expect(new Set(many.flat()).size).toBe(32);
    expect(groupColors(spread(20), 4)).toHaveLength(4);
  });

  it("makes fewer palettes only when there aren't enough colors for different ones", () => {
    expect(groupColors([])).toEqual([]);
    expect(groupColors(["#FFFFFF", "#000000"])).toEqual([["#FFFFFF", "#000000", "#000000", "#000000"]]);
    expect(groupColors(spread(4))).toHaveLength(1);
    expect(groupColors(spread(5))).toHaveLength(5);
    expect(groupColors(spread(6))).toHaveLength(8);
    // Duplicates and odd spellings count once.
    expect(groupColors(["#ffffff", "FFFFFF", "#aaaaaa", "#555555", "#000000"])).toHaveLength(1);
  });

  it("keeps hue families together", () => {
    // Four reds and four blues, each light to dark: they should not mix.
    const reds = ["#FFD0D0", "#E06060", "#A02020", "#400808"], blues = ["#D0D8FF", "#6070E0", "#2030A0", "#080C40"];
    const [first, second] = groupColors([...reds, ...blues], 2);
    expect(new Set([first.join(), second.join()])).toEqual(new Set([reds.join(), blues.join()]));
  });

  it("flattens, sorts, swaps and names", () => {
    expect(flattenColors([{ colors: ["#aabbcc", "#000000"] }, { colors: ["#AABBCC", "nope", "#ffffff"] }])).toEqual(["#AABBCC", "#000000", "#FFFFFF"]);
    expect(lightestFirst(["#000000", "#FFFFFF", "#808080"])).toEqual(["#FFFFFF", "#808080", "#000000"]);
    const swapped = swapColors([["#A", "#B"], ["#C", "#D"]], [0, 1], [1, 0]);
    expect(swapped).toEqual([["#A", "#C"], ["#B", "#D"]]);
    expect(swapColors([["#A", "#B"]], [0, 0], [0, 1])).toEqual([["#B", "#A"]]);
    expect(paletteNames("DWC", 3, ["", "  DWC-2-Computer "])).toEqual(["DWC-1", "DWC-2-Computer", "DWC-3"]);
    expect(baseFromLink("https://lospec.com/palette-list/sweetie-16")).toBe("sweetie-16");
    expect(baseFromLink("Sweetie 16")).toBe("sweetie-16");
    expect(baseFromFile("C:\\art\\Forest Day.png")).toBe("Forest Day");
  });

  it("offers the library as sets: small collections whole, big ones by prefix, without time-of-day variants", () => {
    const four = ["#FFFFFF", "#AAAAAA", "#555555", "#000000"];
    const sets = librarySets([
      { name: "Game Boy", palettes: [{ name: "GB greens", colors: four }, { name: "Pocket", colors: four }] },
      { name: "Big", palettes: [...Array.from({ length: 9 }, (_, at) => ({ name: `DWC-${at + 1}-X`, colors: four })), { name: "DWC-1-X N", colors: four }, { name: "Lone-1", colors: four }] },
    ]);
    expect(sets.map((set) => set.id)).toEqual(["Game Boy", "Big/DWC"]);
    expect(sets[1].palettes).toHaveLength(8);
    expect(sets[1].base).toBe("DWC");
    expect(sets[1].label).toContain("first 8 of 9");
  });
});
