/**
 * The painter's shared types and constants: tools, zoom steps, tints, storage keys, the project's endpoints, and
 * the shape of an open picture (Doc). No React here.
 */
import { GB_SHADES, type Floating, type Mirror, type Palette, type Rect } from "../paint";

export type ToolId = "pencil" | "eraser" | "spray" | "line" | "rect" | "rectFill" | "ellipse" | "fill" | "fillErase" | "eyedropper" | "palette" | "select" | "move" | "hand" | "priority" | "stamp";

export const MIRRORS: Mirror[] = ["off", "x", "y", "xy"];
export const MIRROR_LABEL = { off: "Mirror off", x: "Mirror ↔", y: "Mirror ↕", xy: "Mirror ↔↕" } as const;
export const ZOOMS = [0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48] as const;
export const BUILT_IN_TINTS: Palette[] = [
  { name: "GB greens", colors: [...GB_SHADES] },
  { name: "Gray", colors: ["#FFFFFF", "#AAAAAA", "#555555", "#000000"] },
  { name: "Pocket", colors: ["#C4CFA1", "#8B956D", "#4D533C", "#1F1F1F"] },
];
export const TINT_KEY = "gb-cartographer.tint";
export const GRID_KEY = "gb-cartographer.grid";
export const BUDGET_KEY = "gb-cartographer.tile-budget";
/** GB Studio's background tile budgets (gb/limits.ts): Color Only scenes also merge flipped tiles. */
export const BUDGETS = [{ id: "colorOnly", label: "Color Only · 384", limit: 384, flips: true }, { id: "monochrome", label: "GB / Color + Mono · 192", limit: 192, flips: false }] as const;
export const CUSTOM_TINT_KEY = "gb-cartographer.custom-tint";
export const PROJECT_PANEL_KEY = "gb-cartographer.project-panel";
export const PROJECT_KIND_KEY = "gb-cartographer.project-kind";
export const NAMED_SLOTS_KEY = "gb-cartographer.named-slots";
export const SCREENS_KEY = "gb-cartographer.screens";
export const LOOK_KEY = "gb-cartographer.look";
export const PATTERN_KEY = "gb-cartographer.pattern";
/** GB Studio draws dialogue boxes and menus with the eighth background palette. */
export const UI_SLOT = 7;
/** A backup version's time from its name (2026-10-09T23-12-05-123Z.png). */
export const versionTime = (id: string) => Date.parse(id.replace(/^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)-(\d{3})Z.*$/, "$1:$2:$3.$4Z"));
/** The dev server and the desktop app serve the open GB Studio project (server/endpoints.ts). */
export const PROJECT_URL = "./__cartographer/gbstudio-assets";
export const ASSET_URL = "./__cartographer/gbstudio-asset";
/** What the system file manager is called here. */
export const FILE_MANAGER_LABEL = /Mac/i.test(navigator.userAgent) ? "Show in Finder" : /Win/i.test(navigator.userAgent) ? "Show in Explorer" : "Show in folder";
/** Bumped when the server's previews change, so cached thumbnails are fetched again (2: sprites show their first frame). */
export const PREVIEW_VERSION = 2;
export const ASSET_KINDS = [["backgrounds", "Backgrounds"], ["sprites", "Sprites"], ["tilesets", "Tilesets"], ["fonts", "Fonts"], ["emotes", "Emotes"], ["avatars", "Avatars"], ["ui", "UI (frame, cursor)"]] as const;
export type AssetKind = typeof ASSET_KINDS[number][0];
/** Backgrounds and sprite sheets carry palette slots GB Studio reads; tilesets and fonts are plain pictures. */
export const hasSlots = (kind: AssetKind) => kind === "backgrounds" || kind === "sprites" || kind === "tilesets";
/** Kinds GB Studio draws as sprites: key green is see-through in the file. */
export const isKeyed = (kind: AssetKind) => kind === "sprites" || kind === "emotes";
export const UNDO_LIMIT = 60;
export const UNDO_BYTES = 96 * 1024 * 1024;

/** The parts of the File System Access API used here (Chromium and the desktop app; other browsers download). */
export interface FileHandle { name: string; getFile(): Promise<File>; createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }
export type PickerWindow = Window & {
  showOpenFilePicker?: (options: object) => Promise<FileHandle[]>;
  showSaveFilePicker?: (options: object) => Promise<FileHandle>;
  __gbcFlushSession?: () => Promise<boolean>;
  /** The desktop app's bridge (electron/preload.ts): a native folder dialog. */
  gbc?: { platform: string; chooseProject(): Promise<string | null> };
};
export const PNG_TYPES = [{ description: "PNG image", accept: { "image/png": [".png"] } }];

/** One PNG under the GB Studio project's assets folder. */
export interface Asset { kind: AssetKind; file: string; name: string; width: number; height: number; mtime: number }
/** A project palette also carries its file's modification time, sent back with a rewrite (changed-on-disk check). */
export interface Project { name: string; path: string; assets: Asset[]; palettes: (Palette & { mtime?: number })[] }
/** A sprite sheet's frames: 8 × 16 slices placed at frame-local x, y (see server/assets.ts). */
export interface SpriteFrame { tiles: { x: number; y: number; sliceX: number; sliceY: number; flipX: boolean; flipY: boolean }[] }
export interface SpriteAnimation { name: string; frames: SpriteFrame[] }
/** What the server knows about an asset besides its pixels (see assetInfo in server/assets.ts). */
export interface AssetInfo { mtime: number; tileColors: number[]; slots: string[]; /** GB Studio's animSpeed (sprite sheets): 60 / (animSpeed + 1) fps; 255 none. */ animSpeed?: number | null; slotScene?: string | null; /** GB Studio's Automatic color: it reads the colors from the PNG, so a save in greens loses them. */ autoColor?: boolean; metaMtime: number | null; animations?: SpriteAnimation[] }
/** A picture to open: a file (with a handle to save back to), or a project asset with its info. */
/** A file to open; `replace` names an open picture (by id) that it reloads in place (same tab, same zoom). */
export interface Opening { file: File; handle?: FileHandle; asset?: Asset; info?: AssetInfo; replace?: number }

export interface Snapshot { pixels: Uint8Array; cells: Uint8Array; /** Per tile: draws over sprites (GB Studio's priority flag). */ priority?: Uint8Array; /** The picture's palettes (colors are editable, so undo brings them back). */ palettes?: Palette[] }
export interface Doc extends Snapshot {
  id: number;
  name: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  /** This picture's own copy of the library palettes: their colors can be edited per picture. */
  palettes: Palette[];
  undo: Snapshot[];
  redo: Snapshot[];
  dirty: boolean;
  handle?: FileHandle;
  /**
   * The GB Studio asset this picture was opened from (Save writes it back; `mtime` is the file's time when read).
   * A background or sprite sheet also carries its eight palette slot ids and its sidecar's time: Save writes each
   * tile's palette into the sidecar (a background's tileColors, a sprite's slices' paletteIndex) as a slot.
   */
  asset?: { kind: AssetKind; file: string; name: string; mtime: number; slots?: string[]; /** The scene whose palette list the slots are; null: the project's default palettes. */ slotScene?: string | null; metaMtime?: number | null; /** Each cell's slot when the picture was opened (-1 unknown): only cells moved off it are written back. */ opened?: number[]; /** Each cell's priority flag when opened. */ openedPriority?: number[]; /** A sprite sheet's animations, for the frames strip. */ animations?: SpriteAnimation[]; /** GB Studio's animSpeed for the sheet. */ animSpeed?: number | null; /** The project folder it came from: Save refuses to write it into another project. */ project?: string; /** GB Studio's Automatic color is on (Save asks first). */ autoColor?: boolean };
  /** The file changed on disk while this picture had unsaved changes: the times seen, until Reload or Keep mine. */
  changedOnDisk?: { mtime: number; metaMtime: number | null; /** Keep mine: the bar hides; Save still asks before replacing. */ kept?: boolean };
  /** Per tile (backgrounds and tilesets): 1 when it draws over sprites (bit 7 of GB Studio's tileColors). */
  priority?: Uint8Array;
  /** Resized since it was opened or saved: Save writes the new size (a project asset's size is otherwise fixed). */
  resized?: boolean;
  /** A font sheet: see-through pixels are magenta in the file (a variable-width glyph's unused columns). */
  keyMagenta?: boolean;
  /** A sprite sheet: see-through pixels are GB Studio's key green in the file. */
  keyGreen?: boolean;
  zoom: number;
  sel: Rect | null;
  float: Floating | null;
}
export type Point = { x: number; y: number };
export type Drag =
  | { kind: "stroke" | "spray" | "cells"; last: Point }
  | { kind: "priority"; last: Point; on: boolean }
  | { kind: "stamp"; origin: Point; last: Point }
  | { kind: "shape"; start: Point; base: Uint8Array }
  | { kind: "marquee"; start: Point }
  | { kind: "move"; start: Point; ox: number; oy: number }
  | { kind: "pan"; x: number; y: number; left: number; top: number };
