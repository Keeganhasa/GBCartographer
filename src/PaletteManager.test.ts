import { describe, expect, it } from "vitest";
import { parsePaletteFile } from "./PaletteManager";

describe("palette files", () => {
  it("reads a JSON export, a Lospec .hex and a GIMP .gpl, four colors a palette", () => {
    expect(parsePaletteFile("mine.json", JSON.stringify({ palettes: [{ name: "Dusk", colors: ["#ffeedd", "#aa8866", "#553322", "#110000"] }, { name: "Bad", colors: ["#fff"] }] })))
      .toEqual([{ name: "Dusk", colors: ["#FFEEDD", "#AA8866", "#553322", "#110000"] }]);
    // Lospec lists colors darkest first; a GB palette goes lightest first.
    expect(parsePaletteFile("kirokaze.hex", "332c50\n46878f\n94e344\ne2f3e4\n")).toEqual([{ name: "kirokaze", colors: ["#E2F3E4", "#94E344", "#46878F", "#332C50"] }]);
    const gpl = "GIMP Palette\nName: Two\n#\n255 255 255\tWhite\n170 170 170\n85 85 85\n0 0 0\n224 248 207\n134 192 108\n48 104 80\n7 24 33\n";
    expect(parsePaletteFile("two.gpl", gpl).map((palette) => palette.name)).toEqual(["two 1", "two 2"]);
    expect(parsePaletteFile("two.gpl", gpl)[1].colors).toEqual(["#E0F8CF", "#86C06C", "#306850", "#071821"]);
    expect(parsePaletteFile("short.hex", "ffffff\n000000\n")).toEqual([]);
  });
});
