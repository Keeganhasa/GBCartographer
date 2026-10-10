/**
 * Thumbnails for the Wizards gallery (2026-10-10): a 160 × 96 picture for each wizard, drawn with the wireframe
 * pen and worn in library palettes (SpicyGame's, Chorbi's, the Overworld set), so each shows what its wizard does.
 */
import library from "../palettes/library.json";
import { Pen, canvas } from "../graphics/pen";
import { drawCave, drawWorld, type Generated } from "./generators";

export type WizardThumb = "picture" | "dns" | "paletteSet" | "newBackground" | "budget" | "cave" | "world" | "map" | "checkup";

const W = 160, H = 96, TILES_WIDE = W / 8;
const palette = (name: string) => {
  for (const collection of library.collections) for (const item of collection.palettes) if (item.name === name) return { name, colors: [...item.colors] };
  return { name, colors: ["#E0F8CF", "#86C06C", "#306850", "#071821"] };
};

/** A blank thumbnail; `wear` gives every tile one palette. */
function blank(names: string[], wear = 1): Generated {
  const out: Generated = { ...canvas(W, H), cells: new Uint8Array(TILES_WIDE * (H / 8)).fill(wear), palettes: names.map(palette) };
  return out;
}
/** Tiles in the box (x, y, w, h), in pixels on 8-pixel edges, wear palette `wear`. */
function wearBox(out: Generated, x: number, y: number, w: number, h: number, wear: number) {
  for (let ty = y / 8; ty < (y + h) / 8; ty += 1) for (let tx = x / 8; tx < (x + w) / 8; tx += 1) out.cells![ty * TILES_WIDE + tx] = wear;
}
/** The top-left 160 × 96 of a bigger picture, `step` pixels apart (2: half size), cells following. */
function crop(source: Generated, step = 1, from = 0): Generated {
  const out: Generated = { ...canvas(W, H), cells: new Uint8Array(TILES_WIDE * (H / 8)), palettes: source.palettes };
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) out.pixels[y * W + x] = source.pixels[(from + y * step) * source.width + x * step] ?? 0;
  if (source.cells) for (let ty = 0; ty < H / 8; ty += 1) for (let tx = 0; tx < TILES_WIDE; tx += 1) out.cells![ty * TILES_WIDE + tx] = source.cells[Math.floor((from + ty * 8 * step) / 8) * Math.ceil(source.width / 8) + Math.floor(tx * 8 * step / 8)] ?? 0;
  return out;
}
/** A small landscape: sky, a sun, hills, a house. */
function landscape(p: Pen, x: number) {
  p.oval(x + 34, 10, 16, 16, 1, 2);
  p.peak(x - 6, 30, 50, 34, 2); p.peak(x + 30, 38, 44, 26, 2);
  p.rect(x, 64, 80, 32, 3);
  p.panel(x + 46, 52, 18, 14, 1); p.peak(x + 44, 42, 22, 11, 2); p.rect(x + 53, 58, 4, 8, 3);
}

export function wizardThumb(id: WizardThumb): Generated {
  if (id === "picture") {
    // A "photo" (dithered) on the left turning into flat pixels on the right.
    const out = blank(["V20-2-Fire"]), p = new Pen(out);
    landscape(p.at(0, 0, 80, 96), 0); landscape(p.at(80, 0, 80, 96), 0);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < 80; x += 1) if ((x + y) % 3 === 0 && out.pixels[y * W + x] < 3) out.pixels[y * W + x] += 1;
    p.rect(79, 0, 2, H, 3); p.peak(74, 40, 12, 8, 0);
    return out;
  }
  if (id === "dns") {
    // One scene in three strips: day, sunset, night.
    const out = blank(["DWC-1-Cliffs D", "DWC-1-Cliffs S", "DWC-1-Cliffs N"]), p = new Pen(out);
    landscape(p.at(0, 0, 80, 96), 0); landscape(p.at(80, 0, 80, 96), 0);
    for (let y = 0; y < 12; y += 4) p.dot(10 + y * 10, 6 + y, 1);
    wearBox(out, 0, 0, 56, 96, 1); wearBox(out, 56, 0, 48, 96, 2); wearBox(out, 104, 0, 56, 96, 3);
    return out;
  }
  if (id === "paletteSet") {
    // VIBE-20's eight palettes, each a column of its four colors.
    const names = ["V20-1-Skin", "V20-2-Fire", "V20-3-Foliage", "V20-4-Water", "V20-5-Stone", "V20-6-Rose", "V20-7-Wood", "V20-8-UI"];
    const out = blank(["V20-8-UI", ...names]), p = new Pen(out);
    p.fill(3);
    names.forEach((_, at) => { const x = 16 + at * 16; for (let shade = 0; shade < 4; shade += 1) p.rect(x, 16 + shade * 16, 16, 16, shade); p.box(x, 16, 16, 64, 3); wearBox(out, x, 16, 16, 64, at + 2); });
    return out;
  }
  if (id === "newBackground") {
    // A blank background two screens wide, its screens and tiles marked.
    const out = blank(["OW-1-Grass"]), p = new Pen(out);
    p.fill(0);
    for (let x = 0; x < W; x += 8) for (let y = 0; y < H; y += 8) p.dot(x, y, 1);
    p.box(4, 8, 152, 80, 3); p.rect(80, 8, 1, 80, 2);
    p.text(30, 44, "SCREEN 1", 2); p.text(102, 44, "SCREEN 2", 2);
    return out;
  }
  if (id === "budget") {
    // Tiles, a few near-twins ringed and merged.
    const out = blank(["V14-5-Stone"]), p = new Pen(out);
    p.fill(0);
    for (let ty = 0; ty < 12; ty += 1) for (let tx = 0; tx < 20; tx += 1) {
      const kind = (tx * 7 + ty * 3) % 5, q = p.at(tx * 8, ty * 8, 8);
      if (kind === 0) q.rect(1, 1, 6, 6, 1); else if (kind === 1) q.line(0, 7, 7, 0, 2); else if (kind === 2) q.oval(1, 1, 6, 6, null, 2); else if (kind === 3) q.rect(0, 3, 8, 2, 1);
    }
    for (const [tx, ty] of [[3, 2], [9, 5], [14, 8], [6, 9]]) p.box(tx * 8 - 1, ty * 8 - 1, 10, 10, 3);
    p.line(3 * 8 + 9, 2 * 8 + 9, 9 * 8 - 1, 5 * 8 - 1, 3);
    return out;
  }
  if (id === "cave") return crop(drawCave({ style: "cave", columns: 1, rows: 1, cell: 8, seed: 11, fill: 45, smooth: 4, rooms: 6, roomSize: 4, connected: true, stairs: true, theme: "V20-5-Stone" }));
  if (id === "world") return crop(drawWorld({ columns: 2, rows: 2, seed: 5, water: 38, mountains: 18, forest: 35, towns: 2, scale: 4, island: true, roads: true, theme: "vibe20" }), 2, 24);
  if (id === "map") {
    // A grid of screens: a small overworld, the screen edges drawn over it.
    const out = crop(drawWorld({ columns: 2, rows: 2, seed: 9, water: 30, mountains: 15, forest: 30, towns: 3, scale: 3, island: false, roads: true, theme: "overworld" }), 2, 24);
    const p = new Pen(out);
    for (const x of [0, 80, 159]) p.rect(x, 0, 1, H, 3);
    p.rect(0, 0, W, 1, 3); p.rect(0, 48, W, 1, 3); p.rect(0, 95, W, 1, 3);
    return out;
  }
  // checkup: a health report, ticked off one by one.
  const out = blank(["V20-8-UI"]), p = new Pen(out);
  p.fill(0);
  p.round(8, 6, 144, 84, 0, 2);
  [[true, 96], [true, 72], [false, 104], [false, 64]].forEach(([done, width], row) => {
    const y = 16 + row * 18;
    p.panel(18, y, 10, 10, done ? 1 : 0, 3);
    if (done) { p.line(20, y + 5, 22, y + 7, 3); p.line(22, y + 7, 26, y + 2, 3); }
    p.rect(36, y + 3, width as number, 4, done ? 1 : 2);
  });
  return out;
}
