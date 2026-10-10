/**
 * Wireframe scenes and UI: whole backgrounds laid out from the wireframe tiles (one letter a 16 × 16 tile), with
 * screen-sized pieces drawn on top (title, menu, dialogue), plus GB Studio's UI pieces: the 24 × 24 window frame
 * (an 8 × 8 nine-slice) and the 8 × 8 menu cursor. Backgrounds in screens of 160 × 144 (10 × 9 tiles).
 */
import { drawCave, drawWorld } from "../app/generators";
import { Pen, canvas, textWidth, type Canvas } from "./pen";
import { TILES } from "./tiles";

/** A background from rows of letters, each letter a tile id in `legend` (space: the first entry). */
export function fromMap(rows: string[], legend: Record<string, string>): Canvas {
  const width = Math.max(...rows.map((row) => row.length)) * 16, out = canvas(width, rows.length * 16);
  const blank = Object.values(legend)[0];
  rows.forEach((row, y) => { for (let x = 0; x < width / 16; x += 1) TILES[legend[row[x] ?? " "] ?? blank]?.draw(new Pen(out, x * 16, y * 16, 16)); });
  return out;
}

/** A sheet of tiles, eight to a row (128 pixels wide), for GB Studio's tilesets. */
export function tileSheet(ids: string[]): Canvas {
  const out = canvas(128, Math.ceil(ids.length / 8) * 16);
  ids.forEach((id, at) => TILES[id].draw(new Pen(out, (at % 8) * 16, Math.floor(at / 8) * 16, 16)));
  return out;
}

/** A window: light inside, a dark rounded border, as GB Studio draws its frame. */
export function frameBox(p: Pen, x: number, y: number, w: number, h: number) {
  p.rect(x, y, w, h, 0);
  p.rect(x + 2, y, w - 4, 1, 3); p.rect(x + 2, y + h - 1, w - 4, 1, 3); p.rect(x, y + 2, 1, h - 4, 3); p.rect(x + w - 1, y + 2, 1, h - 4, 3);
  p.dot(x + 1, y + 1, 3); p.dot(x + w - 2, y + 1, 3); p.dot(x + 1, y + h - 2, 3); p.dot(x + w - 2, y + h - 2, 3);
}

/** Text twice the size (each letter pixel a 2 × 2 block). */
function bigText(p: Pen, x: number, y: number, words: string, shade = 3) {
  const small = canvas(textWidth(words), 5, 255);
  new Pen(small).text(0, 0, words, shade);
  for (let sy = 0; sy < 5; sy += 1) for (let sx = 0; sx < small.width; sx += 1) if (small.pixels[sy * small.width + sx] !== 255) p.rect(x + sx * 2, y + sy * 2, 2, 2, shade);
}
const centred = (words: string, width = 160, scale = 1) => Math.round((width - textWidth(words) * scale) / 2);

// ---- UI pieces ----------------------------------------------------------------------------------------------------------------

export const ui = {
  frameRound: () => { const out = canvas(24, 24); frameBox(new Pen(out), 0, 0, 24, 24); return out; },
  frameDouble: () => { const out = canvas(24, 24), p = new Pen(out); p.fill(0); p.box(0, 0, 24, 24, 3); p.box(2, 2, 20, 20, 2); return out; },
  frameThick: () => { const out = canvas(24, 24), p = new Pen(out); p.fill(0); p.box(0, 0, 24, 24, 3); p.box(1, 1, 22, 22, 3); p.box(2, 2, 20, 20, 1); return out; },
  frameDark: () => { const out = canvas(24, 24), p = new Pen(out); p.fill(3); p.box(1, 1, 22, 22, 0); return out; },
  cursorArrow: () => { const out = canvas(8, 8), p = new Pen(out); for (let row = 0; row < 7; row += 1) p.rect(2, 1 + row, 4 - Math.abs(3 - row), 1, 3); return out; },
  cursorHand: () => { const out = canvas(8, 8), p = new Pen(out); p.rect(0, 3, 4, 2, 3); p.panel(3, 2, 4, 5, 1); return out; },
  cursorDot: () => { const out = canvas(8, 8), p = new Pen(out); p.oval(2, 2, 4, 4, 3); return out; },
};

// ---- scenes -------------------------------------------------------------------------------------------------------------------

const town = [
  "TTTTTTTTTTTTTTTTTTTT",
  "T..RRRR....RRRRR..pT",
  "T..RRRR....RRRRR...T",
  "T..WDWO....WOWDW.f.T",
  "T...,......,,,,,...T",
  "T,,,,,,,,,,,,,,,,,,T",
  "T,..F..,...s.,.FFF.T",
  "T,.....,.....,.....T",
  "T,..b..,..~~~,..b..T",
  "T,.....,..~~~,.....T",
  "T,,,,,,,..~~~,,,,,,T",
  "T..RRR.,.....,.RRR.T",
  "T..RRR.,..w..,.RRR.T",
  "T..WDW.,.....,.ODW.T",
  "T....,,,,,,,,,,,...T",
  "T.f..,.......,..f..T",
  "T..b.,..r....,.b...T",
  "TTTTT,TTTTTTT,TTTTTT",
];
const townLegend = { ".": "grass", T: "tree", R: "roof", W: "houseWall", D: "houseDoor", O: "houseWindow", ",": "path", F: "fence", f: "flowers", b: "bush", s: "sign", "~": "water", w: "well", r: "rock", p: "pine" };

const house = [
  "##########",
  "VVOVVcVOVV",
  "BBK|||||||",
  "::::::::bb",
  ":TT:::rr::",
  ":hT:::rr::",
  "::::::::P:",
  "::C:::::::",
  "####dd####",
];
const houseLegend = { ":": "woodFloor", "#": "wallTopIn", "|": "wallBase", V: "wall", O: "windowIn", B: "bookshelf", c: "clock", K: "fireplace", b: "bed", T: "table", h: "chair", r: "rug", P: "pottedPlant", C: "computer", d: "doorway" };

const shop = [
  "##########",
  "BBVOVVOVBB",
  "::::::::::",
  "==========",
  "::::::::::",
  ":j:::::x::",
  "::::rr::::",
  ":P::rr::j:",
  "####dd####",
];
const shopLegend = { ":": "tileFloor", "#": "wallTopIn", B: "bookshelf", V: "wallBase", O: "windowIn", "=": "counter", j: "jar", x: "crate", r: "rug", P: "pottedPlant", d: "doorway" };

const dungeon = [
  "WWWWLLWWWW",
  "BBBtBBtBBB",
  "S........S",
  "S.I....I.S",
  "S...^^...S",
  "S..#.k.#.S",
  "S.I..x.I.S",
  "S....v...S",
  "WWWWWWWWWW",
];
const dungeonLegend = { ".": "stoneFloor", W: "wallTop", B: "brickWall", t: "wallTorch", L: "lockedDoor", S: "brickWall", I: "pillar", "^": "spikes", "#": "block", k: "floorSwitch", x: "bones", v: "stairsDownDark" };

const level = [
  "..............................",
  "....cc..........cc............",
  "...............?..........cc..",
  "........?.?................L..",
  "..................====.....L..",
  ".............L.............L..",
  "....====.....L.....^^......L..",
  "GGGGGGGGGGGGGGGGGG~~GGGGGGGGGG",
  "dddddddddddddddddd~~dddddddddd",
];
const levelLegend = { ".": "sky", c: "cloud", "?": "questionBlock", "=": "platform", L: "ladder", "^": "spikesUp", G: "groundTop", d: "ground", "~": "waterSide" };

export const scenes = {
  title: (): Canvas => {
    const out = canvas(160, 144), p = new Pen(out);
    for (const [x, y] of [[12, 10], [140, 20], [30, 120], [130, 110], [80, 6], [150, 70], [8, 70]]) p.dot(x, y, 2);
    frameBox(p, 16, 28, 128, 48);
    bigText(p, centred("GAME TITLE", 160, 2), 40, "GAME TITLE");
    p.text(centred("A SUBTITLE"), 62, "A SUBTITLE", 2);
    p.text(centred("PRESS START"), 104, "PRESS START");
    p.text(centred("(C) 2026 YOU"), 132, "(C) 2026 YOU", 2);
    return out;
  },
  logo: (): Canvas => { const out = canvas(160, 144), p = new Pen(out); p.fill(3); p.round(48, 40, 64, 48, 1, 0); p.text(centred("LOGO"), 61, "LOGO"); p.text(centred("YOUR STUDIO"), 100, "YOUR STUDIO", 1); return out; },
  menu: (): Canvas => {
    const out = canvas(160, 144), p = new Pen(out);
    p.fill(1);
    frameBox(p, 8, 8, 144, 24); p.text(16, 18, "MENU");
    frameBox(p, 8, 40, 80, 96);
    ["NEW GAME", "CONTINUE", "OPTIONS", "CREDITS"].forEach((item, at) => p.text(24, 52 + at * 16, item));
    for (let row = 0; row < 5; row += 1) p.rect(14, 52 + row, 3 - Math.abs(2 - row), 1, 3);
    frameBox(p, 96, 40, 56, 96); p.text(104, 52, "INFO"); for (let row = 0; row < 5; row += 1) p.rect(104, 64 + row * 10, 40 - row * 6, 2, 2);
    return out;
  },
  dialogue: (): Canvas => {
    const out = fromMap(town.slice(0, 9).map((row) => row.slice(0, 10)), townLegend), p = new Pen(out);
    frameBox(p, 0, 96, 160, 48); p.panel(8, 104, 32, 32, 0, 2); p.text(13, 117, "FACE", 2);
    p.text(48, 108, "HELLO THERE!"); p.text(48, 118, "THIS IS WHERE"); p.text(48, 128, "THE WORDS GO."); p.rect(148, 132, 4, 4, 3);
    return out;
  },
  battle: (): Canvas => {
    const out = canvas(160, 144), p = new Pen(out);
    p.fill(0); p.rect(0, 56, 160, 1, 2);
    p.oval(56, 8, 48, 40, 1); p.text(centred("ENEMY"), 26, "ENEMY", 3);
    frameBox(p, 0, 64, 160, 32); p.text(8, 72, "AN ENEMY APPEARS!"); p.text(8, 84, "WHAT WILL YOU DO?", 2);
    frameBox(p, 0, 96, 88, 48); ["FIGHT", "MAGIC", "ITEM", "RUN"].forEach((item, at) => p.text(16 + (at % 2) * 36, 108 + Math.floor(at / 2) * 16, item));
    frameBox(p, 88, 96, 72, 48); p.text(96, 104, "HERO"); p.text(96, 116, "HP 24/30", 2); p.rect(96, 126, 56, 4, 2); p.rect(96, 126, 44, 4, 3);
    return out;
  },
  room: (): Canvas => {
    // A point-and-click room: back wall, floor and ceiling in perspective, a door, a window, a desk.
    const out = canvas(160, 144), p = new Pen(out);
    p.fill(1); p.panel(32, 24, 96, 72, 0, 3);
    p.line(0, 0, 32, 24, 3); p.line(159, 0, 127, 24, 3); p.line(0, 143, 32, 95, 3); p.line(159, 143, 127, 95, 3);
    for (let x = 0; x < 160; x += 16) p.line(x, 143, 32 + x * 0.6, 96, 2);
    p.panel(44, 40, 24, 56, 2); p.dot(63, 70, 0);
    p.panel(84, 36, 32, 24, 1); p.rect(99, 36, 1, 24, 3); p.rect(84, 47, 32, 1, 3);
    p.panel(80, 76, 40, 8, 2); p.rect(84, 84, 2, 12, 3); p.rect(114, 84, 2, 12, 3);
    p.panel(132, 60, 12, 40, 2); p.text(4, 4, "ROOM", 2);
    return out;
  },
  space: (): Canvas => {
    const out = canvas(320, 144), p = new Pen(out);
    p.fill(3);
    for (let at = 0; at < 90; at += 1) p.dot((at * 97) % 320, (at * 61) % 144, at % 3 === 0 ? 0 : at % 3 === 1 ? 1 : 2);
    p.oval(230, 20, 56, 56, 2, 1); p.oval(244, 30, 12, 8, null, 1); p.rect(200, 47, 116, 1, 1);
    return out;
  },
  house: () => fromMap(house, houseLegend),
  shop: () => fromMap(shop, shopLegend),
  town: () => fromMap(town, townLegend),
  dungeon: () => fromMap(dungeon, dungeonLegend),
  level: () => fromMap(level, levelLegend),
  cave: (): Canvas => drawCave({ style: "cave", columns: 2, rows: 2, cell: 16, seed: 7, fill: 46, smooth: 4, rooms: 8, roomSize: 5, connected: true, stairs: true }),
  overworld: (): Canvas => drawWorld({ columns: 3, rows: 3, seed: 3, water: 35, mountains: 18, forest: 35, towns: 3, scale: 5, island: true, roads: true, theme: "" }),
};
