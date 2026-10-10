/**
 * Wireframe sprites, emotes and avatars. Sprite sheets are 16 pixels tall, frames 16 wide side by side, in GB
 * Studio's classic layout so it sets their animations up by itself: 1 frame still, 3 frames facing down / up /
 * right, 6 frames walking (down, down step, up, up step, right, right step), any other count one looping animation.
 * Sprites and emotes keep shade 0 out (it is see-through on sprites): shade 1 is the lightest that shows, CLEAR
 * around them. Avatars are background tiles, so they use all four shades.
 */
import { CLEAR, Pen, canvas, type Canvas } from "./pen";

/** A sheet of `frames` 16 × 16 frames, each drawn by `draw(pen, frame)`. */
export function sheet(frames: number, draw: (p: Pen, frame: number) => void, height = 16): Canvas {
  const out = canvas(frames * 16, height, CLEAR);
  for (let frame = 0; frame < frames; frame += 1) draw(new Pen(out, frame * 16, 0, 16, height), frame);
  return out;
}

// ---- people -------------------------------------------------------------------------------------------------------------

type Facing = "down" | "up" | "right";
export interface Look {
  hat?: "cap" | "helmet" | "pointy" | "hood" | "band";
  /** Hair shade (none: bald or covered). */
  hair?: number;
  beard?: boolean;
  /** Shirt (body) shade. */
  shirt: number;
  apron?: boolean;
  skull?: boolean;
  /** Something held at the side. */
  held?: "spear" | "staff" | "sword";
}

/** A person, facing down, up or right, standing (step 0) or mid-step (1). */
export function person(p: Pen, look: Look, facing: Facing, step: number) {
  const top = look.hat === "pointy" ? 3 : 0;
  // Legs and arms first, so the body's outline sits on top.
  if (facing === "right") {
    if (step) { p.rect(5, 13, 2, 3, 3); p.rect(9, 13, 2, 2, 3); } else p.rect(6, 13, 4, 3, 3);
  } else if (step) { p.rect(5, 13, 2, 2, 3); p.rect(9, 13, 2, 3, 3); } else { p.rect(5, 13, 2, 3, 3); p.rect(9, 13, 2, 3, 3); }
  p.panel(4, 8, 8, 6, look.shirt);
  if (look.apron && facing !== "up") p.rect(6, 9, 4, 4, 1);
  if (look.skull) { p.rect(5, 10, 6, 1, 1); p.rect(5, 12, 6, 1, 1); }
  if (facing === "right") { p.rect(7, 9 + step, 2, 3, 3); }
  else { p.rect(3, 9 + step, 1, 3, 3); p.rect(12, 10 - step, 1, 3, 3); }
  // Head.
  p.round(4, top, 8, 8 - top + (top ? 0 : 0), 1);
  const hairShade = look.hair;
  if (facing === "up") { p.rect(5, top + 1, 6, 6 - top, hairShade ?? 1); }
  else {
    if (hairShade !== undefined) { p.rect(5, top + 1, 6, 2, hairShade); if (facing === "right") p.rect(5, top + 3, 2, 3, hairShade); }
    if (look.skull) { p.rect(facing === "right" ? 8 : 5, top + 3, 2, 2, 3); p.rect(9, top + 3, 2, 2, 3); }
    else if (facing === "right") p.dot(9, top + 4, 3);
    else { p.dot(6, top + 4, 3); p.dot(9, top + 4, 3); }
    if (look.beard) { p.rect(5, top + 5, 6, 3, 1); p.box(5, top + 5, 6, 4, 3); }
  }
  if (look.hat === "cap") { p.panel(4, 0, 8, 3, 2); if (facing === "down") p.rect(3, 3, 10, 1, 3); if (facing === "right") p.rect(9, 3, 5, 1, 3); }
  if (look.hat === "helmet") { p.panel(3, 0, 10, 4, 2); p.rect(7, 0, 2, 4, 3); if (facing !== "up") p.rect(4, 4, 8, 1, 3); }
  if (look.hat === "band") p.rect(4, 2, 8, 1, 3);
  if (look.hat === "hood") { p.rect(4, 0, 8, 2, 2); p.rect(4, 0, 1, 7, 2); p.rect(11, 0, 1, 7, 2); p.box(3, 0, 10, 8, 3); }
  if (look.hat === "pointy") { p.peak(3, 0, 10, 5, 2); }
  if (look.held && facing !== "up") {
    const x = facing === "right" ? 12 : 13;
    if (look.held === "spear") { p.rect(x, 2, 1, 14, 3); p.peak(x - 1, 0, 3, 3, 1); }
    if (look.held === "staff") { p.rect(x, 3, 1, 13, 3); p.oval(x - 1, 0, 3, 3, 1); }
    if (look.held === "sword") { p.rect(x, 6, 1, 6, 1); p.box(x - 1, 5, 3, 8, 3); p.rect(x - 1, 11, 3, 1, 3); }
  }
}

/** A walking sheet (six frames, classic layout). */
export const walker = (look: Look) => sheet(6, (p, frame) => person(p, look, (["down", "down", "up", "up", "right", "right"] as const)[frame], frame % 2));

/** A side-view hero for a platformer: front, blink, jump, jump (arms up), stand, run. */
export const sideHero = () => sheet(6, (p, frame) => {
  const look: Look = { hat: "cap", shirt: 2 };
  if (frame < 2) { person(p, look, "down", 0); if (frame === 1) { p.rect(6, 4, 1, 1, 1); p.rect(9, 4, 1, 1, 1); } return; }
  if (frame < 4) { person(p, look, "right", 1); p.rect(7, 5, 2, 4, 3); p.rect(10, 5 + frame - 2, 2, 1, 3); return; }
  person(p, look, "right", frame - 4);
});

// ---- animals and creatures ----------------------------------------------------------------------------------------------

/** A four-legged animal side-on (cat or dog), tail up or down by frame. */
function beast(p: Pen, kind: "cat" | "dog", frame: number) {
  p.oval(2, 7, 11, 6, 2);
  for (const x of [3, 5, 9, 11]) p.rect(x, 12, 1, 3 + (frame && (x === 5 || x === 11) ? -1 : 0), 3);
  p.oval(9, 3, 7, 7, 1);
  if (kind === "cat") { p.peak(9, 0, 3, 4, 1); p.peak(13, 0, 3, 4, 1); } else { p.rect(9, 3, 2, 5, 3); }
  p.dot(13, 6, 3);
  if (kind === "dog") p.dot(15, 7, 3);
  if (frame) p.line(2, 8, 0, 3, 3); else p.line(2, 9, 0, 11, 3);
}

export const creatures = {
  cat: () => sheet(2, (p, frame) => beast(p, "cat", frame)),
  dog: () => sheet(2, (p, frame) => beast(p, "dog", frame)),
  bird: () => sheet(2, (p, frame) => { p.oval(4, 6, 9, 7, 1); p.oval(10, 3, 5, 5, 1); p.dot(12, 5, 3); p.rect(15, 5, 1, 1, 3); if (frame) p.peak(4, 1, 7, 6, 2); else p.peak(4, 9, 7, 5, 2); p.rect(6, 13, 1, 2, 3); p.rect(9, 13, 1, 2, 3); }),
  chicken: () => sheet(2, (p, frame) => { p.oval(2, 6, 11, 8, 1); p.oval(9, 1 + frame, 6, 6, 1); p.rect(11, 0 + frame, 2, 1, 2); p.dot(13, 3 + frame, 3); p.rect(15, 4 + frame, 1, 1, 2); p.rect(5, 14, 1, 2, 3); p.rect(9, 14, 1, 2, 3); p.line(3, 9, 7, 9, 2); }),
  fish: () => sheet(2, (p, frame) => { p.oval(3, 4, 10, 8, 1); p.peak(0, 4 + frame, 5, 8 - frame, 2); p.dot(10, 7, 3); p.rect(6, 6, 1, 4, 2); }),
  slime: () => sheet(2, (p, frame) => { const h = frame ? 8 : 10; p.oval(1 + frame, 16 - h, 14 - frame * 2, h, 1); p.dot(6, 16 - h + 3, 3); p.dot(9, 16 - h + 3, 3); p.dot(4, 16 - h + 2, 2); }),
  bat: () => sheet(2, (p, frame) => { p.oval(5, 5, 6, 6, 2); p.dot(7, 7, 1); p.dot(9, 7, 1); if (frame) { p.peak(0, 1, 6, 6, 2); p.peak(10, 1, 6, 6, 2); } else { p.line(0, 11, 5, 7, 3); p.line(15, 11, 10, 7, 3); p.line(1, 12, 5, 9, 3); p.line(14, 12, 10, 9, 3); } p.dot(6, 4, 3); p.dot(9, 4, 3); }),
  ghost: () => sheet(2, (p, frame) => { const y = frame; p.round(3, y, 10, 13, 1); for (let x = 3; x < 13; x += 3) p.peak(x, 12 + y, 4, 3, 1); p.rect(5, 4 + y, 2, 3, 3); p.rect(9, 4 + y, 2, 3, 3); }),
  spider: () => sheet(2, (p, frame) => { p.oval(4, 5, 8, 7, 2); p.dot(6, 7, 1); p.dot(9, 7, 1); for (let leg = 0; leg < 3; leg += 1) { const y = 6 + leg * 2 + (frame && leg === 1 ? 1 : 0); p.line(4, y, 0, y + 2 - leg, 3); p.line(11, y, 15, y + 2 - leg, 3); } p.rect(7, 0, 1, 5, 3); }),
};

// ---- things ------------------------------------------------------------------------------------------------------------

export const things = {
  sign: () => sheet(1, (p) => { p.rect(7, 9, 2, 7, 3); p.panel(1, 2, 14, 8, 1); p.rect(3, 4, 10, 1, 2); p.rect(3, 6, 7, 1, 2); }),
  rock: () => sheet(1, (p) => { p.oval(1, 4, 14, 11, 1); p.rect(8, 9, 5, 3, 2); p.line(4, 7, 6, 9, 3); }),
  pot: () => sheet(1, (p) => { p.oval(2, 4, 12, 11, 1); p.panel(5, 1, 6, 4, 2); p.rect(4, 8, 8, 1, 2); }),
  crate: () => sheet(1, (p) => { p.panel(1, 1, 14, 14, 2); p.box(3, 3, 10, 10, 3); p.line(3, 3, 12, 12, 3); p.line(12, 3, 3, 12, 3); }),
  barrel: () => sheet(1, (p) => { p.panel(2, 2, 12, 13, 2); p.oval(2, 0, 12, 4, 1); p.rect(2, 6, 12, 1, 3); p.rect(2, 11, 12, 1, 3); }),
  bush: () => sheet(1, (p) => { p.oval(1, 3, 14, 12, 1); p.dot(5, 7, 2); p.dot(10, 6, 2); p.dot(8, 11, 2); }),
  key: () => sheet(1, (p) => { p.oval(1, 4, 7, 7, null); p.rect(7, 7, 8, 2, 3); p.rect(11, 9, 1, 3, 3); p.rect(14, 9, 1, 2, 3); }),
  heart: () => sheet(1, (p) => p.bitmap(1, 2, [
    "..333....333..",
    ".31113..31113.",
    "31211131111113",
    "31211111111113",
    "31111111111113",
    ".311111111113.",
    "..3111111113..",
    "...31111113...",
    "....311113....",
    ".....3113.....",
    "......33......",
  ])),
  potion: () => sheet(1, (p) => { p.oval(3, 5, 10, 10, 2); p.rect(6, 1, 4, 5, 1); p.box(6, 1, 4, 5, 3); p.rect(5, 0, 6, 1, 3); p.dot(5, 8, 1); }),
  sword: () => sheet(1, (p) => { p.line(3, 12, 12, 3, 3); p.line(4, 12, 13, 3, 1); p.line(2, 9, 6, 13, 3); p.rect(1, 13, 2, 2, 3); }),
  shield: () => sheet(1, (p) => { p.round(2, 1, 12, 9, 1); p.peak(2, 9, 12, 6, 1); p.rect(7, 2, 2, 11, 2); p.rect(3, 6, 10, 2, 2); }),
  gem: () => sheet(1, (p) => { p.peak(2, 1, 12, 5, 1); p.rect(2, 5, 12, 1, 3); for (let row = 0; row < 8; row += 1) { p.rect(3 + row * 0.6 | 0, 6 + row, 10 - (row * 1.2 | 0), 1, 2); p.dot(2 + (row * 0.75 | 0), 6 + row, 3); p.dot(13 - (row * 0.75 | 0), 6 + row, 3); } }),
  scroll: () => sheet(1, (p) => { p.panel(3, 2, 10, 12, 1); p.oval(1, 1, 4, 4, 2); p.oval(11, 11, 4, 4, 2); p.rect(5, 5, 6, 1, 2); p.rect(5, 8, 5, 1, 2); }),
  bomb: () => sheet(1, (p) => { p.oval(2, 4, 12, 12, 3); p.dot(5, 7, 1); p.rect(9, 1, 1, 4, 2); p.dot(10, 0, 1); }),
  mushroom: () => sheet(1, (p) => { p.oval(1, 1, 14, 9, 1); p.dot(5, 4, 2); p.dot(10, 3, 2); p.panel(5, 8, 6, 7, 1); }),
  coinStill: () => sheet(1, (p) => { p.oval(3, 2, 10, 12, 1); p.rect(7, 5, 2, 6, 2); }),
  ship: () => sheet(1, (p) => { p.peak(1, 1, 14, 13, 1); p.rect(6, 6, 4, 4, 2); p.rect(3, 14, 3, 2, 3); p.rect(10, 14, 3, 2, 3); }),
  bullet: () => sheet(1, (p) => { p.oval(5, 5, 6, 6, 1); }),
  asteroid: () => sheet(1, (p) => { p.oval(1, 2, 14, 12, 2); p.oval(4, 5, 4, 3, null, 3); p.dot(10, 9, 3); }),
};

/** Two-state things (first frame, second frame) and loops. */
export const animated = {
  chest: () => sheet(2, (p, open) => { p.panel(1, 6, 14, 9, 2); p.rect(1, 9, 14, 1, 3); if (open) { p.panel(1, 1, 14, 6, 3); p.rect(3, 3, 10, 2, 1); } else { p.round(1, 3, 14, 5, 2); p.panel(6, 8, 4, 4, 1); } }),
  door: () => sheet(2, (p, open) => { p.panel(1, 0, 14, 16, 2); if (open) p.rect(3, 2, 10, 14, 3); else { p.rect(4, 2, 1, 14, 3); p.rect(11, 2, 1, 14, 3); p.dot(9, 9, 1); } }),
  lever: () => sheet(2, (p, on) => { p.panel(3, 11, 10, 4, 2); if (on) p.line(8, 11, 12, 4, 3); else p.line(8, 11, 4, 4, 3); p.oval(on ? 10 : 2, 2, 4, 4, 1); }),
  switch: () => sheet(2, (p, down) => { p.panel(1, 11, 14, 4, 2); p.panel(4, down ? 9 : 6, 8, down ? 3 : 6, 1); }),
  checkbox: () => sheet(2, (p, on) => { p.panel(3, 3, 10, 10, 1); if (on) { p.line(5, 8, 7, 10, 3); p.line(7, 10, 11, 5, 3); } }),
  torch: () => sheet(2, (p, frame) => { p.rect(7, 9, 2, 7, 3); p.rect(5, 8, 6, 2, 2); p.oval(5 + frame, 1, 6, 8, 1); p.rect(7 + frame, 4, 2, 3, 2); }),
  savePoint: () => sheet(2, (p, frame) => { p.peak(4, 1, 8, 6, frame ? 1 : 2); for (let row = 0; row < 6; row += 1) { p.rect(5 + (row >> 1), 7 + row, 6 - (row >> 1) * 2, 1, frame ? 1 : 2); p.dot(4 + (row >> 1), 7 + row, 3); p.dot(11 - (row >> 1), 7 + row, 3); } if (frame) { p.dot(1, 2, 2); p.dot(14, 5, 2); p.dot(2, 12, 2); } }),
  cursorHand: () => sheet(2, (p, grab) => { if (grab) { p.round(3, 5, 10, 9, 1); p.rect(5, 5, 1, 3, 3); p.rect(8, 5, 1, 3, 3); } else { p.panel(5, 0, 3, 8, 1); p.round(3, 6, 10, 9, 1); p.rect(8, 6, 1, 3, 3); p.rect(10, 6, 1, 3, 3); } }),
  pointer: () => sheet(2, (p, frame) => { for (let row = 0; row < 11; row += 1) { p.rect(2 + frame, 2 + row, Math.min(row, 7), 1, 1); p.dot(2 + frame, 2 + row, 3); p.dot(2 + frame + Math.min(row, 7), 2 + row, 3); } p.rect(2 + frame, 12, 8, 1, 3); }),
  enemyShip: () => sheet(2, (p, frame) => { p.oval(1, 3, 14, 8, 2); p.oval(5, 1, 6, 5, 1); p.rect(3, 11, 2, 2 + frame * 2, 1); p.rect(11, 11, 2, 2 + frame * 2, 1); }),
  mine: () => sheet(2, (p, frame) => { p.oval(3, 3, 10, 10, 2); for (const [x, y] of [[7, 0], [7, 13], [0, 7], [13, 7]]) p.rect(x, y, x === 7 ? 2 : 3, x === 7 ? 3 : 2, 3); p.oval(6, 6, 4, 4, frame ? 1 : 3); }),
  coin: () => sheet(4, (p, frame) => { const w = [10, 6, 2, 6][frame]; p.oval(8 - w / 2, 2, w, 12, 1); if (w > 4) p.rect(7, 5, 2, 6, 2); }),
  fire: () => sheet(4, (p, frame) => { const lean = [0, 1, 0, -1][frame]; p.oval(3, 6, 10, 10, 1); p.peak(4 + lean, 0 + (frame % 2), 8, 9, 1); p.oval(6, 9, 4, 5, 2); }),
  sparkle: () => sheet(4, (p, frame) => { const r = [1, 3, 5, 3][frame]; p.rect(8 - r, 7, r * 2 + 1, 1, 1); p.rect(7, 8 - r - 1, 1, r * 2 + 1, 1); p.dot(7, 7, 3); if (frame === 2) { p.dot(4, 4, 2); p.dot(11, 11, 2); p.dot(11, 4, 2); p.dot(4, 11, 2); } }),
  explosion: () => sheet(4, (p, frame) => { const r = [3, 6, 7, 7][frame]; p.oval(8 - r, 8 - r, r * 2, r * 2, frame === 3 ? null : 1, frame === 3 ? 2 : 3); if (frame >= 1) p.oval(8 - r / 2, 8 - r / 2, r, r, frame === 3 ? null : 2, frame === 3 ? 1 : 3); }),
  splash: () => sheet(4, (p, frame) => { const h = [3, 7, 9, 5][frame]; p.oval(1, 12, 14, 4, 1); for (const x of [3, 7, 11]) p.rect(x + (x === 7 ? 0 : (x - 7) / 4 * frame), 13 - h + (x === 7 ? 0 : 2), 2, h - (x === 7 ? 0 : 2), 1); }),
};

// ---- emotes (16 × 16 bubbles) ----------------------------------------------------------------------------------------------

function bubble(p: Pen) { p.round(1, 0, 14, 12, 1); p.peak(4, 11, 5, 4, 1); p.rect(5, 11, 3, 1, 1); }

export const emotes: Record<string, { name: string; draw: (p: Pen) => void }> = {
  shock: { name: "Shock", draw: (p) => { bubble(p); p.rect(7, 2, 2, 5, 3); p.rect(7, 8, 2, 2, 3); } },
  question: { name: "Question", draw: (p) => { bubble(p); p.rect(6, 2, 4, 1, 3); p.rect(10, 3, 1, 2, 3); p.rect(8, 5, 2, 1, 3); p.rect(7, 6, 1, 1, 3); p.rect(7, 8, 2, 2, 3); } },
  love: { name: "Love", draw: (p) => { bubble(p); p.rect(4, 3, 3, 3, 3); p.rect(9, 3, 3, 3, 3); p.rect(5, 6, 6, 2, 3); p.rect(7, 8, 2, 1, 3); p.rect(6, 4, 4, 2, 3); } },
  music: { name: "Music", draw: (p) => { bubble(p); p.rect(6, 2, 1, 6, 3); p.rect(10, 1, 1, 6, 3); p.rect(6, 2, 5, 1, 3); p.oval(4, 7, 3, 3, 3); p.oval(8, 6, 3, 3, 3); } },
  anger: { name: "Anger", draw: (p) => { bubble(p); for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { p.line(8 + dx, 6 + dy, 8 + dx * 3, 6 + dy * 3, 3); p.dot(8 + dx * 3 - dx, 6 + dy * 3, 3); } } },
  sweat: { name: "Sweat", draw: (p) => { bubble(p); p.peak(6, 2, 5, 4, 2); p.oval(6, 4, 5, 5, 2); } },
  sleep: { name: "Sleep", draw: (p) => { bubble(p); p.text(3, 4, "Z", 3); p.text(7, 2, "Z", 3); p.dot(12, 2, 3); } },
  pause: { name: "Pause", draw: (p) => { bubble(p); for (const x of [4, 7, 10]) p.rect(x, 5, 2, 2, 3); } },
  idea: { name: "Idea", draw: (p) => { bubble(p); p.oval(5, 1, 6, 6, 2); p.rect(6, 7, 4, 2, 3); p.dot(3, 3, 3); p.dot(12, 3, 3); } },
  happy: { name: "Happy", draw: (p) => { bubble(p); p.dot(5, 4, 3); p.dot(10, 4, 3); p.rect(5, 7, 6, 1, 3); p.dot(4, 6, 3); p.dot(11, 6, 3); } },
  sad: { name: "Sad", draw: (p) => { bubble(p); p.dot(5, 4, 3); p.dot(10, 4, 3); p.rect(5, 7, 6, 1, 3); p.dot(4, 8, 3); p.dot(11, 8, 3); p.dot(4, 5, 2); } },
  star: { name: "Star", draw: (p) => { bubble(p); p.bitmap(3, 1, [
    "....33....",
    "....33....",
    "3333333333",
    ".33333333.",
    "..333333..",
    "..33..33..",
    ".33....33.",
  ]); } },
};

export const emote = (id: keyof typeof emotes) => sheet(1, (p) => emotes[id].draw(p));

// ---- avatars (16 × 16 faces for dialogue, background tiles) --------------------------------------------------------------------

export function avatar(look: Look | "cat" | "robot" | "mystery"): Canvas {
  const out = canvas(16, 16, 0), p = new Pen(out);
  p.box(0, 0, 16, 16, 2);
  if (look === "cat") { p.oval(2, 4, 12, 11, 1); p.peak(2, 1, 5, 6, 1); p.peak(9, 1, 5, 6, 1); p.dot(5, 8, 3); p.dot(10, 8, 3); p.dot(7, 10, 2); p.dot(8, 10, 2); return out; }
  if (look === "robot") { p.panel(3, 3, 10, 11, 1); p.rect(7, 1, 2, 2, 3); p.rect(5, 6, 2, 2, 3); p.rect(9, 6, 2, 2, 3); p.rect(5, 10, 6, 1, 2); return out; }
  if (look === "mystery") { p.oval(3, 2, 10, 10, 3); p.rect(2, 11, 12, 5, 3); p.text(7, 4, "?", 0); return out; }
  p.panel(3, 12, 10, 4, look.shirt);
  p.round(3, look.hat === "pointy" ? 4 : 2, 10, look.hat === "pointy" ? 9 : 11, 1);
  const top = look.hat === "pointy" ? 4 : 2;
  if (look.hair !== undefined) p.rect(4, top + 1, 8, 2, look.hair);
  p.rect(5, top + 5, 2, 2, 3); p.rect(9, top + 5, 2, 2, 3);
  if (look.beard) { p.rect(4, top + 7, 8, 4, 0); p.box(4, top + 7, 8, 4, 3); } else p.rect(6, top + 8, 4, 1, 2);
  if (look.hat === "cap") { p.panel(3, 1, 10, 4, 2); p.rect(2, 4, 12, 1, 3); }
  if (look.hat === "helmet") { p.panel(2, 1, 12, 5, 2); p.rect(7, 1, 2, 5, 3); }
  if (look.hat === "pointy") p.peak(2, 0, 12, 5, 2);
  if (look.hat === "hood") { p.rect(2, 1, 12, 3, 2); p.rect(2, 1, 2, 12, 2); p.rect(12, 1, 2, 12, 2); }
  if (look.skull) { p.rect(4, top + 5, 3, 3, 3); p.rect(9, top + 5, 3, 3, 3); p.rect(5, top + 9, 6, 1, 3); }
  return out;
}
