// The project check-up's pure parts: separating close colors, and which fix goes with which issue.
import { describe, expect, it } from "vitest";
import { closeShades, colorDistance } from "../paint";
import { checkupOrder, checkupSummary, contrastPairs, fixKind, lightness, separateColors, separatePairs, tileCount, twinNames, type CheckupIssue } from "./checkupFixes";

const lightestFirst = (colors: string[]) => colors.every((color, at) => at === 0 || lightness(colors[at - 1]) >= lightness(color));

describe("Project check-up fixes", () => {
  it("separates two close colors, keeping the order and the other colors", () => {
    const palette = ["#F8F0E0", "#A07850", "#987048", "#201810"];
    expect(colorDistance(palette[1], palette[2])).toBeLessThan(12);
    const fixed = separateColors(palette, 1, 2);
    expect(colorDistance(fixed[1], fixed[2])).toBeGreaterThanOrEqual(12);
    expect(lightestFirst(fixed)).toBe(true);
    expect([fixed[0], fixed[3]]).toEqual([palette[0], palette[3]]);
    // Only one of the pair had to move, and the input is untouched.
    expect(fixed.filter((color, at) => color !== palette[at]).length).toBe(1);
    expect(palette[1]).toBe("#A07850");
  });

  it("pulls apart two identical colors, and moves both when one runs out of room", () => {
    const same = separateColors(["#FFFFFF", "#808080", "#808080", "#000000"], 1, 2);
    expect(colorDistance(same[1], same[2])).toBeGreaterThanOrEqual(12);
    expect(lightestFirst(same)).toBe(true);
    // Colors 1 and 2 are pinned between white and near-white: color 2 has to go darker.
    const tight = separateColors(["#FFFFFF", "#FCFCFC", "#F8F8F8", "#000000"], 1, 2);
    expect(colorDistance(tight[1], tight[2])).toBeGreaterThanOrEqual(12);
    expect(lightestFirst(tight)).toBe(true);
    expect(tight[0]).toBe("#FFFFFF");
  });

  it("keeps the hue of the color it moves", () => {
    const fixed = separateColors(["#E0F8D0", "#88C070", "#80B868", "#081820"], 1, 2);
    const moved = fixed.findIndex((color, at) => color !== ["#E0F8D0", "#88C070", "#80B868", "#081820"][at]);
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(fixed[moved].slice(at, at + 2), 16));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("leaves a palette alone when the pair is far enough apart", () => {
    const palette = ["#FFFFFF", "#AAAAAA", "#555555", "#000000"];
    expect(separateColors(palette, 1, 2)).toEqual(palette);
    expect(separateColors(palette, 1, 1)).toEqual(palette);
  });

  it("fixes every pair a low-contrast detail names", () => {
    const detail = "colors 1 and 2 differ by 3.1; colors 3 and 4 are the same color (aim for a difference of 12 or more).";
    expect(contrastPairs(detail)).toEqual([[0, 1], [2, 3]]);
    const fixed = separatePairs(["#E0E0E0", "#D8D8D8", "#303030", "#303030"], contrastPairs(detail));
    expect(closeShades(fixed)).toEqual([]);
    expect(lightestFirst(fixed)).toBe(true);
  });

  it("knows which fix goes with which issue, worst first, notes without a fix hidden", () => {
    const issues: CheckupIssue[] = [
      { level: "note", kind: "backgrounds", file: "a.png", title: "Not read by GB Studio yet", detail: "" },
      { level: "note", kind: "palettes", file: "Old", title: "Unused palette", detail: "" },
      { level: "warning", kind: "palettes", file: "Dim", title: "Low contrast", detail: "colors 2 and 3 differ by 4" },
      { level: "problem", kind: "backgrounds", file: "big.png", title: "412 tiles, over 384", detail: "" },
      { level: "note", kind: "backgrounds", file: "near.png", title: "350 of 384 tiles", detail: "" },
    ];
    expect(issues.map(fixKind)).toEqual(["explain", "unused", "contrast", "tiles", "tiles"]);
    expect(checkupOrder(issues, false).map((issue) => issue.title)).toEqual(["412 tiles, over 384", "Low contrast", "Unused palette", "350 of 384 tiles"]);
    expect(checkupOrder(issues, true)).toHaveLength(5);
    expect(tileCount(issues[3])).toEqual({ tiles: 412, limit: 384 });
    expect(twinNames("The same four colors as Fire, Ice.", ["Fire", "Ice", "Water"])).toEqual(["Fire", "Ice"]);
    expect(checkupSummary(3, 2, 0)).toBe("Fixed 3, skipped 2");
  });
});
