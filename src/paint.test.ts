import { describe, expect, it } from "vitest";
import { CLEAR, GB_SHADES, KEY_GREEN, assignSlots, spriteShades, clipRect, countUniqueTiles, dot, drop, ellipsePoints, fillRect, floodFill, hexRgb, closeShades, colorDistance, mergeNearTiles, tileUsage, gbStudioShade, gbcCorrect, dropCells, flipFloat, lift, liftCells, linePoints, onTiles, replaceShade, rotateFloat, mirrorPoints, namedSlot, quantize, snapRect, toRgba } from "./paint";

describe("GB Cartographer pixels", () => {
  it("shows where the tile budget goes and merges tiles that nearly match another", () => {
    // Four tiles in a row: A, A, A with one pixel changed, and a very different B.
    const width = 32, pixels = new Uint8Array(32 * 8);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 32; x += 1) pixels[y * width + x] = x >= 24 ? (x + y) % 4 : (x % 2);
    pixels[3 * width + 16 + 4] = 3;
    const usage = tileUsage(pixels, width, 8, false);
    expect([...usage.uses]).toEqual([2, 2, 1, 1]);
    expect([...usage.near]).toEqual([-1, -1, 0, -1]);
    expect(usage.diff[2]).toBe(1);
    expect(mergeNearTiles(pixels, width, 8, usage)).toBe(1);
    expect([...tileUsage(pixels, width, 8, false).uses]).toEqual([3, 3, 3, 1]);
    // Two single-use tiles that are each other's twin: one becomes the other (not a swap).
    const pair = new Uint8Array(16 * 8);
    pair[0] = 1;
    pair[8 + 1] = 1;
    const both = tileUsage(pair, 16, 8, false);
    expect([...both.near]).toEqual([1, 0]);
    expect(mergeNearTiles(pair, 16, 8, both)).toBe(1);
    expect([...tileUsage(pair, 16, 8, false).uses]).toEqual([2, 2]);
  });

  it("flags neighbouring shades that are hard to tell apart", () => {
    expect(colorDistance("#000000", "#FFFFFF")).toBeCloseTo(100, 0);
    expect(closeShades(["#E0F8CF", "#86C06C", "#306850", "#071821"])).toEqual([]);
    const close = closeShades(["#FFFFFF", "#F4F4F4", "#555555", "#000000"]);
    expect(close.map(({ a, b }) => [a, b])).toEqual([[0, 1]]);
    // For a sprite palette, color 0 is see-through: only 1–3 count.
    expect(closeShades(["#FFFFFF", "#FAFAFA", "#555555", "#000000"], true)).toEqual([]);
  });

  it("shows colors as a Game Boy Color screen would (dimmer, mixed), keeping alpha", () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 128, 0, 0, 0, 0]);
    expect([...gbcCorrect(rgba)]).toEqual([240, 240, 240, 255, 201, 0, 46, 128, 0, 0, 0, 0]);
  });

  it("moves tile palettes with a tile-aligned piece, flips and turns it, and replaces a shade", () => {
    // A 16 × 8 picture: two tiles wearing palettes 1 and 2.
    const cells = new Uint8Array([1, 2]);
    expect(onTiles({ x: 0, y: 0, w: 16, h: 8 })).toBe(true);
    expect(onTiles({ x: 1, y: 0, w: 8, h: 8 })).toBe(false);
    const lifted = liftCells(cells, 16, { x: 0, y: 0, w: 16, h: 8 }, 0);
    expect([[...lifted], [...cells]]).toEqual([[1, 2], [0, 0]]);
    const piece = { pixels: new Uint8Array(16 * 8), w: 16, h: 8, x: 0, y: 0, cells: lifted };
    piece.pixels[0] = 3;
    const flipped = flipFloat(piece, "x");
    expect([flipped.pixels[15], [...flipped.cells!]]).toEqual([3, [2, 1]]);
    const turned = rotateFloat(piece);
    expect([turned.w, turned.h, turned.pixels[7], [...turned.cells!]]).toEqual([8, 16, 3, [1, 2]]);
    dropCells(cells, 16, 8, flipped);
    expect([...cells]).toEqual([2, 1]);
    // Off tile edges, palettes stay where they are.
    dropCells(cells, 16, 8, { ...piece, x: 3 });
    expect([...cells]).toEqual([2, 1]);
    const pixels = new Uint8Array([0, 1, 1, 2]);
    expect(replaceShade(pixels, 2, 2, 1, 3)).toBe(2);
    expect([...pixels]).toEqual([0, 3, 3, 2]);
    expect(replaceShade(pixels, 2, 2, 3, 0, { x: 0, y: 0, w: 2, h: 1 })).toBe(1);
    expect([...pixels]).toEqual([0, 0, 3, 2]);
  });

  it("gives Chorbi-style palette names a slot: the base palette's, else the number in the name", () => {
    const slots = ["DWC-1-Cliffs", "DWC-4-Foliage", undefined];
    expect(namedSlot("DWC-1-Cliffs D", slots)).toBe(0);
    expect(namedSlot("DWC-4-Foliage N", slots)).toBe(1);
    expect(namedSlot("DWC-6-MauveBldg S", slots)).toBe(5);
    expect(namedSlot("WIN-2-Sky", slots)).toBe(1);
    expect(namedSlot("DWC-SP6-Fire", slots)).toBe(-1);
    expect(namedSlot("Town day", slots)).toBe(-1);
  });

  it("reads the GB greens exactly and writes them back unchanged", () => {
    const shades = new Uint8Array([0, 1, 2, 3, CLEAR, 3]);
    const rgba = toRgba(shades, new Uint8Array(1), 3);
    expect([...rgba.slice(4, 8)]).toEqual([...hexRgb(GB_SHADES[1]), 255]);
    expect(rgba[19]).toBe(0);
    const back = quantize(rgba, 3, 2);
    expect([...back.pixels]).toEqual([...shades]);
    expect(back).toMatchObject({ hasAlpha: true, snapped: 0 });
  });

  it("reads a sprite sheet's key green as see-through and writes it back as key green", () => {
    const rgba = new Uint8ClampedArray([0x65, 0xff, 0, 255, ...hexRgb(GB_SHADES[3]), 255]);
    // Read as a background, the green is just one more color (GB Studio reads it as the lightest shade): the tile
    // keeps it as a palette of the file.
    const plain = quantize(rgba, 2, 1);
    expect([[...plain.pixels], plain.hasAlpha, plain.palettes.length]).toEqual([[0, 3], false, 1]);
    // GB Studio's other see-through colors for sprites: low alpha, and a strong blue or magenta with no green.
    const keys = quantize(new Uint8ClampedArray([255, 0, 255, 255, 0, 0, 255, 255, 120, 120, 120, 150]), 3, 1, [], true);
    expect([...keys.pixels]).toEqual([CLEAR, CLEAR, CLEAR]);
    const sprite = quantize(rgba, 2, 1, [], true);
    expect([...sprite.pixels]).toEqual([CLEAR, 3]);
    expect(sprite).toMatchObject({ hasAlpha: true, snapped: 0, palettes: [] });
    expect([...toRgba(sprite.pixels, sprite.cells, 2, [], KEY_GREEN)]).toEqual([...rgba]);
    expect([...toRgba(sprite.pixels, sprite.cells, 2).slice(0, 4)]).toEqual([0, 0, 0, 0]);
  });

  it("reads colors a hair off a GB green as that green, so saving writes the exact shade", () => {
    // Exact dark, near dark (#071923), near light (#E5F9D7): a plain shade tile, not a palette of the file.
    const rgba = new Uint8ClampedArray([7, 24, 33, 255, 7, 25, 35, 255, 229, 249, 215, 255]);
    const result = quantize(rgba, 3, 1);
    expect([...result.pixels]).toEqual([3, 3, 0]);
    expect(result).toMatchObject({ near: 2, snapped: 0, palettes: [] });
    expect([...toRgba(result.pixels, result.cells, 3).slice(4, 7)]).toEqual([7, 24, 33]);
  });

  it("assigns a background's tile colors to its cells through the scene's palette slots", () => {
    const cells = new Uint8Array(4);
    const palettes = [{ name: "Sky", id: "p-sky" }, { name: "File 1" }, { name: "Grass", id: "p-grass" }];
    // Cell 0 slot 1 with priority, cell 1 slot 0, cell 2 a slot whose palette is not in the list; cell 3 beyond the data.
    expect(assignSlots(cells, [0x81, 0x00, 0x02], ["p-grass", "p-sky", "p-missing"], palettes)).toBe(2);
    expect([...cells]).toEqual([1, 3, 0, 0]);
    // A sprite sheet's unused cells (-1) keep what they have; a sprite palette draws colors 1-3 on the shades.
    cells.set([2, 2, 2, 2]);
    expect(assignSlots(cells, [-1, 0, -1, 1], ["p-grass", "p-sky"], palettes)).toBe(2);
    expect([...cells]).toEqual([2, 3, 2, 1]);
    expect(spriteShades(["#000000", "#111111", "#222222", "#333333"])).toEqual(["#111111", "#222222", "#333333", "#333333"]);
  });

  it("reads other colors as GB Studio does: by the green channel (below 65, 130, 205)", () => {
    expect([255, 205, 204, 130, 129, 65, 64, 0].map(gbStudioShade)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    // A bright red has no green, so GB Studio reads it as the darkest shade (brightness would say mid).
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 170, 170, 170, 255, 85, 85, 85, 255, 0, 0, 0, 255, 200, 0, 0, 255]);
    const result = quantize(rgba, 5, 1);
    expect([...result.pixels]).toEqual([0, 1, 2, 3, 3]);
    // Black and red read as the same shade: GB Studio shows them alike, and so does the tile's palette.
    expect(result).toMatchObject({ hasAlpha: false, snapped: 1 });
    expect(result.palettes[0].colors).toEqual(["#FFFFFF", "#AAAAAA", "#555555", "#000000"]);
  });

  it("keeps a tile of up to four unknown colors as a palette of the file", () => {
    const rgba = new Uint8ClampedArray(16 * 8 * 4).fill(255);
    // #282828 is more than 24 per channel from the GB dark green, so it is a color of its own.
    for (let i = 0; i < 16 * 8; i += 1) rgba.set((i % 16) < 8 ? (i % 2 ? [40, 40, 40] : [250, 240, 0]) : [40, 40, 40], i * 4);
    const result = quantize(rgba, 16, 8, [{ name: "A", colors: ["#FF0000", "#00FF00", "#0000FF", "#101010"], id: "pal-a" }]);
    expect(result.palettes.map(({ name, id }) => [name, id])).toEqual([["A", "pal-a"], ["File 1", undefined]]);
    // Each color at the shade GB Studio reads it as; the shades the tile doesn't use keep their GB green.
    expect(result.palettes[1].colors).toEqual(["#FAF000", "#86C06C", "#306850", "#282828"]);
    expect([...result.cells]).toEqual([2, 2]);
    expect(result.snapped).toBe(0);
    expect([...toRgba(result.pixels, result.cells, 16, result.palettes)]).toEqual([...rgba]);
  });

  it("gives a tile drawn in one palette's colors that palette, and writes the colors back", () => {
    // Each palette's colors sit at the shades GB Studio reads them as (by green: 240, 180, 100, 16 / 255, 204, 80, 0).
    const palettes = [{ name: "A", colors: ["#F0F0F0", "#00B400", "#0064FF", "#101010"] }, { name: "B", colors: ["#FFFFFF", "#CCCCCC", "#505050", "#000000"] }];
    const pixels = new Uint8Array(16 * 8);
    pixels.forEach((_, i) => { pixels[i] = (i % 16) < 8 ? i % 4 : 2 + (i % 2); });
    const cells = new Uint8Array([0, 2]);
    const rgba = toRgba(pixels, cells, 16, palettes);
    expect([...rgba.slice(8 * 4, 8 * 4 + 3)]).toEqual([80, 80, 80]);
    const back = quantize(rgba, 16, 8, palettes);
    expect([...back.cells]).toEqual([0, 2]);
    expect([...back.pixels]).toEqual([...pixels]);
    expect(back.snapped).toBe(0);
  });

  it("does not let a palette reorder shades: colors at other positions than GB Studio reads them get a palette of the file", () => {
    // In "Upside down" the lightest color sits at position 3, but GB Studio still reads it as the lightest shade.
    const palettes = [{ name: "Upside down", colors: ["#000000", "#505050", "#CCCCCC", "#FFFFFF"] }];
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const result = quantize(rgba, 2, 1, palettes);
    expect([...result.pixels]).toEqual([0, 3]);
    expect([...result.cells]).toEqual([2]);
    expect(result.palettes[1].colors).toEqual(["#FFFFFF", "#86C06C", "#306850", "#000000"]);
  });

  it("draws brush marks, lines and mirrored points inside the picture", () => {
    const pixels = new Uint8Array(16);
    dot(pixels, 4, 4, 3, 3, 2, 3);
    expect([...pixels].filter(Boolean).length).toBe(1);
    expect(linePoints(0, 0, 3, 1)).toEqual([[0, 0], [1, 0], [2, 1], [3, 1]]);
    expect(mirrorPoints(1, 0, 8, 8, "xy")).toEqual([[1, 0], [6, 0], [1, 7], [6, 7]]);
  });

  it("flood fills one connected area only", () => {
    const pixels = new Uint8Array([0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0]);
    expect(floodFill(pixels, 4, 3, 0, 0, 2)).toBe(true);
    expect([...pixels]).toEqual([2, 2, 1, 0, 2, 2, 1, 0, 1, 1, 1, 0]);
    expect(floodFill(pixels, 4, 3, 0, 0, 2)).toBe(false);
  });

  it("keeps an ellipse inside its box and closed", () => {
    const points = ellipsePoints(0, 0, 7, 4);
    expect(points.every(([x, y]) => x >= 0 && x <= 7 && y >= 0 && y <= 4)).toBe(true);
    expect(points).toContainEqual([0, 2]);
    expect(points).toContainEqual([7, 2]);
  });

  it("lifts a piece, leaves a blank, and drops it elsewhere", () => {
    const pixels = new Uint8Array([3, 3, 0, 0, 3, 3, 0, 0]);
    const piece = lift(pixels, 4, { x: 0, y: 0, w: 2, h: 2 }, 0);
    expect([...pixels]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    drop(pixels, 4, 2, { ...piece, x: 3, y: 0 });
    expect([...pixels]).toEqual([0, 0, 0, 3, 0, 0, 0, 3]);
  });

  it("snaps and clips rectangles", () => {
    expect(snapRect({ x: 3, y: 9, w: 6, h: 2 }, 8)).toEqual({ x: 0, y: 8, w: 16, h: 8 });
    expect(clipRect({ x: -2, y: 1, w: 4, h: 10 }, 8, 8)).toEqual({ x: 0, y: 1, w: 2, h: 7 });
    expect(clipRect({ x: 9, y: 0, w: 2, h: 2 }, 8, 8)).toBeNull();
    const pixels = new Uint8Array(4);
    fillRect(pixels, 2, 2, { x: 1, y: -1, w: 5, h: 2 }, 1);
    expect([...pixels]).toEqual([0, 1, 0, 0]);
  });

  it("counts unique tiles like GB Studio, merging mirror images only when asked", () => {
    const pixels = new Uint8Array(24 * 8);
    pixels[0] = 3;
    pixels[8 + 7] = 3;
    expect(countUniqueTiles(pixels, 24, 8, false)).toBe(3);
    expect(countUniqueTiles(pixels, 24, 8, true)).toBe(2);
    expect(countUniqueTiles(pixels, 20, 8, false)).toBe(3);
  });
});
