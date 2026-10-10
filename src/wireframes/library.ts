/**
 * The wireframe library (2026-10-10): placeholder art for everything a GB Studio game needs to start, to paint over
 * in your own way. All drawn here in code (the author's, CC0), nothing copied: people, creatures, things, emotes,
 * avatars, the UI frame and cursor, tile sheets and whole scenes. Each asset knows its GB Studio kind, so the store
 * can put it in a project's assets/<kind>/ as a new PNG (sprites in the classic 16-pixel-tall layout, which GB Studio
 * animates by itself). Later: auto-tiles and animated tiles (water, flowers).
 */
import type { AssetKind } from "../app/model";
import type { Canvas } from "./pen";
import { scenes, tileSheet, ui } from "./scenes";
import { animated, avatar, creatures, emote, emotes, sideHero, things, walker, type Look } from "./sprites";
import { DUNGEON, INDOOR, OUTDOOR, SIDE } from "./tiles";

export interface WireAsset {
  id: string; name: string; group: string; kind: AssetKind;
  /** What it is for, and how GB Studio reads it. */
  about?: string;
  make: () => Canvas;
}

const PEOPLE: [string, string, Look][] = [
  ["hero", "Hero", { hat: "cap", shirt: 2 }],
  ["villager", "Villager", { hair: 2, shirt: 1 }],
  ["elder", "Elder", { hair: 1, beard: true, shirt: 2 }],
  ["kid", "Kid", { hair: 3, hat: "band", shirt: 1 }],
  ["guard", "Guard", { hat: "helmet", shirt: 2, held: "spear" }],
  ["shopkeeper", "Shopkeeper", { hair: 3, shirt: 2, apron: true }],
  ["wizard", "Wizard", { hat: "pointy", beard: true, shirt: 2, held: "staff" }],
  ["knight", "Knight", { hat: "helmet", shirt: 1, held: "sword" }],
  ["traveler", "Traveler", { hat: "hood", shirt: 2 }],
  ["skeleton", "Skeleton", { skull: true, shirt: 3 }],
];

const WALKS = "Six frames: down, down step, up, up step, right, right step (GB Studio sets up walking in four directions; left is right flipped).";
const LOOP = (frames: number) => `${frames} frames, one looping animation.`;
const TWO = (a: string, b: string) => `Two frames: ${a}, ${b} (one animation; pick a frame from an event).`;

export const WIREFRAMES: WireAsset[] = [
  ...PEOPLE.map(([id, name, look]): WireAsset => ({ id: `person-${id}`, name, group: "People", kind: "sprites", about: WALKS, make: () => walker(look) })),
  { id: "person-side-hero", name: "Side-view hero", group: "People", kind: "sprites", about: "For platformers: front, blink, jump ×2, stand, run (right; left is flipped).", make: sideHero },
  ...Object.entries(creatures).map(([id, make]): WireAsset => ({ id: `creature-${id}`, name: id[0].toUpperCase() + id.slice(1), group: "Creatures", kind: "sprites", about: LOOP(2), make })),
  ...Object.entries(things).map(([id, make]): WireAsset => ({ id: `thing-${id}`, name: ({ coinStill: "Coin", ship: "Ship", bullet: "Bullet", asteroid: "Asteroid" } as Record<string, string>)[id] ?? id[0].toUpperCase() + id.slice(1), group: "Things", kind: "sprites", about: "One frame.", make })),
  ...Object.entries(animated).map(([id, make]): WireAsset => {
    const names: Record<string, [string, string]> = { chest: ["Chest", TWO("closed", "open")], door: ["Door", TWO("closed", "open")], lever: ["Lever", TWO("left", "right")], switch: ["Switch", TWO("up", "pressed")], checkbox: ["Checkbox", TWO("empty", "ticked")], torch: ["Torch", LOOP(2)], savePoint: ["Save point", LOOP(2)], cursorHand: ["Hand cursor", TWO("point", "grab")], pointer: ["Arrow pointer", LOOP(2)], enemyShip: ["Enemy ship", LOOP(2)], mine: ["Space mine", LOOP(2)], coin: ["Spinning coin", LOOP(4)], fire: ["Fire", LOOP(4)], sparkle: ["Sparkle", LOOP(4)], explosion: ["Explosion", LOOP(4)], splash: ["Splash", LOOP(4)] };
    return { id: `anim-${id}`, name: names[id]?.[0] ?? id, group: "Animated things", kind: "sprites", about: names[id]?.[1], make };
  }),
  ...Object.entries(emotes).map(([id, { name }]): WireAsset => ({ id: `emote-${id}`, name, group: "Emotes", kind: "emotes", about: "16 × 16, shown above an actor's head.", make: () => emote(id) })),
  ...[...PEOPLE.filter(([id]) => id !== "kid").map(([id, name, look]) => [id, name, look] as const), ["cat", "Cat", "cat"] as const, ["robot", "Robot", "robot"] as const, ["mystery", "Mystery", "mystery"] as const]
    .map(([id, name, look]): WireAsset => ({ id: `avatar-${id}`, name, group: "Avatars", kind: "avatars", about: "16 × 16 face for dialogue boxes.", make: () => avatar(look) })),
  { id: "ui-frame-round", name: "Frame (rounded)", group: "UI", kind: "ui", about: "GB Studio's window frame: 24 × 24, cut in 8 × 8 corners, edges and middle. It reads ui/frame.png.", make: ui.frameRound },
  { id: "ui-frame-double", name: "Frame (double line)", group: "UI", kind: "ui", about: "A window frame (ui/frame.png).", make: ui.frameDouble },
  { id: "ui-frame-thick", name: "Frame (thick)", group: "UI", kind: "ui", about: "A window frame (ui/frame.png).", make: ui.frameThick },
  { id: "ui-frame-dark", name: "Frame (dark)", group: "UI", kind: "ui", about: "A dark window frame (ui/frame.png).", make: ui.frameDark },
  { id: "ui-cursor-arrow", name: "Cursor (arrow)", group: "UI", kind: "ui", about: "The 8 × 8 menu cursor (ui/cursor.png).", make: ui.cursorArrow },
  { id: "ui-cursor-hand", name: "Cursor (hand)", group: "UI", kind: "ui", about: "The 8 × 8 menu cursor (ui/cursor.png).", make: ui.cursorHand },
  { id: "ui-cursor-dot", name: "Cursor (dot)", group: "UI", kind: "ui", about: "The 8 × 8 menu cursor (ui/cursor.png).", make: ui.cursorDot },
  { id: "tiles-outdoor", name: "Outdoor tiles", group: "Tile sheets", kind: "tilesets", about: `${Object.keys(OUTDOOR).length} tiles of 16 × 16: grass, paths, water, trees, houses…`, make: () => tileSheet(Object.keys(OUTDOOR)) },
  { id: "tiles-indoor", name: "Indoor tiles", group: "Tile sheets", kind: "tilesets", about: `${Object.keys(INDOOR).length} tiles: floors, walls, furniture.`, make: () => tileSheet(Object.keys(INDOOR)) },
  { id: "tiles-dungeon", name: "Dungeon tiles", group: "Tile sheets", kind: "tilesets", about: `${Object.keys(DUNGEON).length} tiles: stone, bricks, traps, doors.`, make: () => tileSheet(Object.keys(DUNGEON)) },
  { id: "tiles-side", name: "Side-view tiles", group: "Tile sheets", kind: "tilesets", about: `${Object.keys(SIDE).length} tiles for platformers: ground, platforms, ladders.`, make: () => tileSheet(Object.keys(SIDE)) },
  { id: "scene-title", name: "Title screen", group: "Scenes", kind: "backgrounds", make: scenes.title },
  { id: "scene-logo", name: "Logo splash", group: "Scenes", kind: "backgrounds", make: scenes.logo },
  { id: "scene-menu", name: "Menu", group: "Scenes", kind: "backgrounds", make: scenes.menu },
  { id: "scene-town", name: "Town", group: "Scenes", kind: "backgrounds", about: "2 × 2 screens.", make: scenes.town },
  { id: "scene-house", name: "House", group: "Scenes", kind: "backgrounds", make: scenes.house },
  { id: "scene-shop", name: "Shop", group: "Scenes", kind: "backgrounds", make: scenes.shop },
  { id: "scene-dungeon", name: "Dungeon room", group: "Scenes", kind: "backgrounds", make: scenes.dungeon },
  { id: "scene-cave", name: "Cave", group: "Scenes", kind: "backgrounds", about: "2 × 2 screens (the cave generator makes more).", make: scenes.cave },
  { id: "scene-overworld", name: "Overworld", group: "Scenes", kind: "backgrounds", about: "3 × 3 screens (the overworld generator makes more).", make: scenes.overworld },
  { id: "scene-level", name: "Platformer level", group: "Scenes", kind: "backgrounds", about: "3 screens wide.", make: scenes.level },
  { id: "scene-space", name: "Space", group: "Scenes", kind: "backgrounds", about: "2 screens wide, for shooters.", make: scenes.space },
  { id: "scene-battle", name: "Battle screen", group: "Scenes", kind: "backgrounds", make: scenes.battle },
  { id: "scene-dialogue", name: "Dialogue", group: "Scenes", kind: "backgrounds", make: scenes.dialogue },
  { id: "scene-room", name: "Point-and-click room", group: "Scenes", kind: "backgrounds", make: scenes.room },
];

export const WIREFRAME_GROUPS = [...new Set(WIREFRAMES.map((asset) => asset.group))];
