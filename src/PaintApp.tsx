/**
 * GB Cartographer: a small painter for GB Studio pictures (backgrounds, sprite sheets, tilesets) and any Game Boy PNG.
 * Each open file is one flat picture in the four GB shades; tiles (8 × 8) may wear a palette from the project.
 * A tint only changes how the plain tiles look while painting. Saving writes one flat PNG, and for a project
 * picture also its tile palettes (see server/endpoints.ts).
 */
import { BoxSelect, ChevronDown, Circle, CircleHelp, Download, DropletOff, Eraser, FlipHorizontal2, FolderOpen, FolderTree, Ghost, Grid3x3, Hand, Image, LayoutGrid, Magnet, Minus, Move, PaintBucket, Palette as PaletteIcon, Pause, Pencil, Pipette, Play, Plus, RectangleHorizontal, Redo2, Save, Slash, SprayCan, Square, Star, Type, Undo2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { LogoMark } from "./ui/LogoMark";
import { FONTS, applyFont, loadFont, type FontChoice } from "./ui/theme";
import PaletteManager from "./PaletteManager";
import BackupsWindow from "./BackupsWindow";
import { attachMiddlePan, attachWheelZoom, nextStep } from "./ui/wheelZoom";
import { CELL, CLEAR, GB_SHADES, KEY_GREEN, assignSlots, spriteShades, cellsWide, clipRect, colorize, countUniqueTiles, dot, drop, ellipsePoints, fillRect, floodFill, lift, linePoints, mirrorPoints, namedSlot, quantize, rectFrom, shadeLut, snapRect, spray, toRgba, type Floating, type Mirror, type Palette, type Rect } from "./paint";

type ToolId = "pencil" | "eraser" | "spray" | "line" | "rect" | "rectFill" | "ellipse" | "fill" | "fillErase" | "eyedropper" | "palette" | "select" | "move" | "hand";

/** id, label, icon, key, one-clause hint (status bar), the longer explanation (the ? help). */
const TOOLS = [
  ["pencil", "Pencil", Pencil, "B", "drag to paint · Shift-click line · right-click picks a shade", "Drag to paint with the active shade. Shift-click draws a straight line from the last point. Right-click picks the shade under the pointer."],
  ["eraser", "Eraser", Eraser, "E", "drag to erase", "Drag to erase to the lightest shade, or to see-through in a picture that has see-through pixels."],
  ["spray", "Spray can", SprayCan, "S", "drag to scatter pixels", "Drag to scatter pixels of the active shade inside the brush."],
  ["line", "Line", Slash, "L", "drag from one end to the other", "Drag from one end of the line to the other."],
  ["rect", "Rectangle", Square, "R", "drag a box", "Drag a box to outline it in the active shade."],
  ["rectFill", "Filled rectangle", RectangleHorizontal, "Shift+R", "drag a box to fill", "Drag a box to fill it with the active shade."],
  ["ellipse", "Ellipse", Circle, "O", "drag a box; the ellipse fills it", "Drag a box; the ellipse fills it."],
  ["fill", "Flood fill", PaintBucket, "G", "click an area to fill", "Click an area to fill it with the active shade."],
  ["fillErase", "Flood erase", DropletOff, "Shift+G", "click an area to erase", "Click an area to erase it."],
  ["eyedropper", "Pick", Pipette, "I", "click to pick a shade, or a tile's palette", "Click a pixel to paint with its shade. Reached from the palette brush, it picks the tile's palette instead and goes back to the brush."],
  ["palette", "Palette brush", PaletteIcon, "P", "drag over tiles · Shift-click line · [ ] size · right-click picks", "Pick a palette on the right, then drag over tiles to give it to them. Shift-click draws a straight line of tiles. [ and ] set the brush to 1, 2 × 2 or 3 × 3 tiles. Right-click picks a tile's palette. On a project background or sprite sheet, Save writes each tile's palette into GB Studio as its slot; None leaves a tile's slot as it is."],
  ["select", "Select", BoxSelect, "M", "drag a box · drag inside to move · Alt copies", "Drag a box to select. Drag inside it to move the selection (Alt copies). Arrow keys nudge, Delete clears, Esc drops it."],
  ["move", "Move", Move, "V", "drag the selection or the whole picture", "Drag the selection, or the whole picture when nothing is selected (Alt copies)."],
  ["hand", "Pan", Hand, "H", "drag to pan · Space or middle button with any tool", "Drag to pan. Space or the middle mouse button pans with any tool."],
] as const;
const KIND_ICONS = { backgrounds: Image, sprites: Ghost, tilesets: LayoutGrid, fonts: Type } as const;

const MIRRORS: Mirror[] = ["off", "x", "y", "xy"];
const MIRROR_LABEL = { off: "Mirror off", x: "Mirror ↔", y: "Mirror ↕", xy: "Mirror ↔↕" } as const;
const ZOOMS = [0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48] as const;
const BUILT_IN_TINTS: Palette[] = [
  { name: "GB greens", colors: [...GB_SHADES] },
  { name: "Gray", colors: ["#FFFFFF", "#AAAAAA", "#555555", "#000000"] },
  { name: "Pocket", colors: ["#C4CFA1", "#8B956D", "#4D533C", "#1F1F1F"] },
];
const TINT_KEY = "gb-cartographer.tint";
const GRID_KEY = "gb-cartographer.grid";
const BUDGET_KEY = "gb-cartographer.tile-budget";
/** GB Studio's background tile budgets (gb/limits.ts): Color Only scenes also merge flipped tiles. */
const BUDGETS = [{ id: "colorOnly", label: "Color Only · 384", limit: 384, flips: true }, { id: "monochrome", label: "GB / Color + Mono · 192", limit: 192, flips: false }] as const;
const CUSTOM_TINT_KEY = "gb-cartographer.custom-tint";
const PROJECT_PANEL_KEY = "gb-cartographer.project-panel";
const PROJECT_KIND_KEY = "gb-cartographer.project-kind";
const NAMED_SLOTS_KEY = "gb-cartographer.named-slots";
/** GB Studio draws dialogue boxes and menus with the eighth background palette. */
const UI_SLOT = 7;
/** A backup version's time from its name (2026-10-09T23-12-05-123Z.png). */
const versionTime = (id: string) => Date.parse(id.replace(/^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)-(\d{3})Z.*$/, "$1:$2:$3.$4Z"));
/** The dev server and the desktop app serve the open GB Studio project (server/endpoints.ts). */
const PROJECT_URL = "./__cartographer/gbstudio-assets";
const ASSET_URL = "./__cartographer/gbstudio-asset";
/** What the system file manager is called here. */
const FILE_MANAGER_LABEL = /Mac/i.test(navigator.userAgent) ? "Show in Finder" : /Win/i.test(navigator.userAgent) ? "Show in Explorer" : "Show in folder";
/** Bumped when the server's previews change, so cached thumbnails are fetched again (2: sprites show their first frame). */
const PREVIEW_VERSION = 2;
const ASSET_KINDS = [["backgrounds", "Backgrounds"], ["sprites", "Sprites"], ["tilesets", "Tilesets"], ["fonts", "Fonts"]] as const;
type AssetKind = typeof ASSET_KINDS[number][0];
/** Backgrounds and sprite sheets carry palette slots GB Studio reads; tilesets and fonts are plain pictures. */
const hasSlots = (kind: AssetKind) => kind === "backgrounds" || kind === "sprites" || kind === "tilesets";
const UNDO_LIMIT = 60;
const UNDO_BYTES = 96 * 1024 * 1024;

/** The parts of the File System Access API used here (Chromium and the desktop app; other browsers download). */
interface FileHandle { name: string; getFile(): Promise<File>; createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }
type PickerWindow = Window & {
  showOpenFilePicker?: (options: object) => Promise<FileHandle[]>;
  showSaveFilePicker?: (options: object) => Promise<FileHandle>;
  __gbcFlushSession?: () => Promise<boolean>;
  /** The desktop app's bridge (electron/preload.ts): a native folder dialog. */
  gbc?: { platform: string; chooseProject(): Promise<string | null> };
};
const PNG_TYPES = [{ description: "PNG image", accept: { "image/png": [".png"] } }];

/** One PNG under the GB Studio project's assets folder. */
interface Asset { kind: AssetKind; file: string; name: string; width: number; height: number; mtime: number }
/** A project palette also carries its file's modification time, sent back with a rewrite (changed-on-disk check). */
interface Project { name: string; path: string; assets: Asset[]; palettes: (Palette & { mtime?: number })[] }
/** A sprite sheet's frames: 8 × 16 slices placed at frame-local x, y (see server/assets.ts). */
interface SpriteFrame { tiles: { x: number; y: number; sliceX: number; sliceY: number; flipX: boolean; flipY: boolean }[] }
interface SpriteAnimation { name: string; frames: SpriteFrame[] }
/** What the server knows about an asset besides its pixels (see assetInfo in server/assets.ts). */
interface AssetInfo { mtime: number; tileColors: number[]; slots: string[]; slotScene?: string | null; metaMtime: number | null; animations?: SpriteAnimation[] }
/** A picture to open: a file (with a handle to save back to), or a project asset with its info. */
/** A file to open; `replace` names an open picture (by id) that it reloads in place (same tab, same zoom). */
interface Opening { file: File; handle?: FileHandle; asset?: Asset; info?: AssetInfo; replace?: number }

interface Snapshot { pixels: Uint8Array; cells: Uint8Array }
interface Doc extends Snapshot {
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
  asset?: { kind: AssetKind; file: string; name: string; mtime: number; slots?: string[]; /** The scene whose palette list the slots are; null: the project's default palettes. */ slotScene?: string | null; metaMtime?: number | null; /** Each cell's slot when the picture was opened (-1 unknown): only cells moved off it are written back. */ opened?: number[]; /** A sprite sheet's animations, for the frames strip. */ animations?: SpriteAnimation[]; /** The project folder it came from: Save refuses to write it into another project. */ project?: string };
  /** A sprite sheet: see-through pixels are GB Studio's key green in the file. */
  keyGreen?: boolean;
  zoom: number;
  sel: Rect | null;
  float: Floating | null;
}
type Point = { x: number; y: number };
type Drag =
  | { kind: "stroke" | "spray" | "cells"; last: Point }
  | { kind: "shape"; start: Point; base: Uint8Array }
  | { kind: "marquee"; start: Point }
  | { kind: "move"; start: Point; ox: number; oy: number }
  | { kind: "pan"; x: number; y: number; left: number; top: number };

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Per-browser convenience only.
  }
}

/** The open pictures are kept in IndexedDB between launches (typed arrays and file handles store as they are). */
/**
 * The open pictures are kept in IndexedDB between launches. The database has its own name: the archived editor used
 * "gb-cartographer" (with an "autosave" store) on the same desktop address, and opening that one failed silently, so
 * the desktop app never kept its session (2026-10-09). Any failure is reported once in the console and resolves null.
 */
const SESSION_DB = "gb-cartographer-session";
let sessionWarned = false;
function sessionStore<T>(mode: IDBTransactionMode, run: (objects: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const fail = (resolve: (value: null) => void, error: unknown) => {
    if (!sessionWarned) { sessionWarned = true; console.error("GB Cartographer could not keep its session:", error); }
    resolve(null);
  };
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(SESSION_DB, 1);
      open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains("session")) open.result.createObjectStore("session"); };
      open.onerror = () => fail(resolve, open.error);
      open.onsuccess = () => {
        try {
          const db = open.result;
          const transaction = db.transaction("session", mode);
          const request = run(transaction.objectStore("session"));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => fail(resolve, request.error);
          transaction.oncomplete = () => db.close();
        } catch (error) {
          fail(resolve, error);
        }
      };
    } catch (error) {
      fail(resolve, error);
    }
  });
}

let nextDocId = 1;

/** A small "?" that shows its explanation when clicked (the text stays out of the way otherwise). */
function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`gbp-help-button ${open ? "open" : ""}`} aria-label={label} aria-expanded={open} title={label} onClick={() => setOpen(!open)}>?</button>
      {open && <p className="gbp-note gbp-help-text">{children}</p>}
    </>
  );
}

export default function PaintApp() {
  const docs = useRef<Doc[]>([]);
  const [, bump] = useReducer((count: number) => count + 1, 0);
  const [activeId, setActiveId] = useState(0);
  const [tool, setToolState] = useState<ToolId>("pencil");
  const [shade, setShade] = useState(3);
  const [brush, setBrush] = useState(1);
  /** The palette brush's size in tiles (1, 2 × 2 or 3 × 3). */
  const [cellBrush, setCellBrush] = useState(1);
  const [mirror, setMirror] = useState<Mirror>("off");
  const [grid, setGrid] = useState<0 | 8 | 16>(() => readStored(GRID_KEY, 8));
  const [budgetId, setBudgetId] = useState<string>(() => readStored(BUDGET_KEY, "colorOnly"));
  const [tileCount, setTileCount] = useState(0);
  const [snap, setSnap] = useState(false);
  const [palettes, setPalettes] = useState<Palette[]>([]);
  const [activePalette, setActivePalette] = useState(0);
  const [tint, setTint] = useState(() => readStored(TINT_KEY, "GB greens"));
  const [customTint, setCustomTint] = useState<string[]>(() => readStored(CUSTOM_TINT_KEY, [...GB_SHADES]));
  const [copiedColors, setCopiedColors] = useState<string[] | null>(null);
  const [paletteFilter, setPaletteFilter] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  /** Whether the page is served by something that can open a project (the dev server or the desktop app). */
  const [served, setServed] = useState(false);
  const [showPalettes, setShowPalettes] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  /** Whether the user was warned this session that GB Studio is open (it may overwrite project JSON when it saves). */
  const gbStudioWarned = useRef(false);
  const shadeInputs = useRef<(HTMLInputElement | null)[]>([]);
  const [recent, setRecent] = useState<{ name: string; path: string }[]>([]);
  /** The right-click menu on a picture card: where it opened and for which asset. */
  const [assetMenu, setAssetMenu] = useState<{ x: number; y: number; asset: Asset } | null>(null);
  /** The project menu (open another, the demo, recent, close), anchored under the button that opened it. */
  const [projectMenu, setProjectMenu] = useState<{ x: number; y: number } | null>(null);
  /** The "Put in slot" menu for a palette of the open picture (its index in the picture's palettes, from 1). */
  /** The Backups window, open on a file (a path inside the project) or on the newest backup. */
  const [backups, setBackups] = useState<{ file?: string } | null>(null);
  const [slotMenu, setSlotMenu] = useState<{ x: number; y: number; palette: number } | null>(null);
  /** Palettes named like DWC-2-Computer D save as their base palette's slot (or the number in the name). */
  const [namedSlots, setNamedSlots] = useState<boolean>(() => readStored(NAMED_SLOTS_KEY, false));
  const namedSlotsRef = useRef(namedSlots);
  namedSlotsRef.current = namedSlots;
  /** Bumped when palette slots change, so thumbnails are drawn again. */
  const [slotsVersion, setSlotsVersion] = useState(0);
  const projectRef = useRef<Project | null>(null);
  /** The frames strip: which animation and frame of the open sprite sheet is current, and whether it plays. */
  const [frame, setFrame] = useState({ animation: 0, index: 0 });
  const [playing, setPlaying] = useState(false);
  /** The font sample: a sentence drawn with the open font sheet's glyphs (ASCII from 32, 16 glyphs a row). */
  const [sampleText, setSampleText] = useState("The quick brown fox jumps over the lazy dog. 0123456789");
  const sampleCanvas = useRef<HTMLCanvasElement>(null);
  const frameCanvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const [sideTab, setSideTab] = useState<"palettes" | "picture">("palettes");
  const [font, setFont] = useState<FontChoice>(() => loadFont());
  const [showProject, setShowProject] = useState<boolean>(() => readStored(PROJECT_PANEL_KEY, true));
  const [projectKind, setProjectKind] = useState<AssetKind>(() => readStored(PROJECT_KIND_KEY, "backgrounds"));
  const [projectFilter, setProjectFilter] = useState("");
  const [toast, setToast] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const brushRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const lastPoint = useRef<Point | null>(null);
  const clip = useRef<Floating | null>(null);
  const spaceDown = useRef(false);
  const paintTool = useRef<ToolId>("pencil");
  const palettesRef = useRef<Palette[]>([]);
  const palettesReady = useRef<Promise<void> | null>(null);
  const sessionTimer = useRef(0);

  const doc = docs.current.find((item) => item.id === activeId) ?? null;
  const tintColors = tint === "Custom" ? customTint : [...BUILT_IN_TINTS, ...palettes].find((item) => item.name === tint)?.colors ?? GB_SHADES;
  const docPalettes = doc?.palettes ?? palettes;
  // On a sprite sheet a palette's color 0 is see-through, so its colors 1-3 dress the shades.
  const shown = (colors: readonly string[]) => doc?.keyGreen ? spriteShades(colors) : colors;
  const luts = [tintColors, ...docPalettes.map((palette) => shown(palette.colors))].map((colors) => shadeLut(colors));
  const picked = activePalette ? docPalettes[activePalette - 1] : undefined;
  const swatchColors = picked ? shown(picked.colors) : tintColors;
  const clonePalettes = (list: readonly Palette[]): Palette[] => list.map(({ name, colors, id }) => ({ name, colors: [...colors], ...(id ? { id } : {}) }));
  const blank = (target: Doc) => target.hasAlpha ? CLEAR : 0;

  function say(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? "" : current), 4000);
  }

  function setTool(next: ToolId) {
    if (doc && next !== "select" && next !== "move" && next !== "hand") dropFloat(doc);
    if (next !== "eyedropper" && next !== "hand") paintTool.current = next;
    setToolState(next);
  }

  // ---- session -------------------------------------------------------------------------------------------------

  function writeSession() {
    window.clearTimeout(sessionTimer.current);
    const value = {
      active: docs.current.findIndex((item) => item.id === activeId),
      docs: docs.current.map(({ name, width, height, pixels, cells, hasAlpha, palettes, dirty, handle, asset, keyGreen, zoom, float }) => {
        const flat = pixels.slice();
        if (float) drop(flat, width, height, float);
        return { name, width, height, pixels: flat, cells, hasAlpha, palettes, dirty, handle, asset, keyGreen, zoom };
      }),
    };
    return sessionStore("readwrite", (objects) => objects.put(value, "open")).then(() => true);
  }

  function scheduleSession() {
    window.clearTimeout(sessionTimer.current);
    sessionTimer.current = window.setTimeout(() => void writeSession(), 800);
  }

  function touch(target: Doc) {
    target.dirty = true;
    scheduleSession();
    bump();
  }

  // ---- undo and the floating selection ---------------------------------------------------------------------------

  function pushUndo(target: Doc) {
    target.undo.push({ pixels: target.pixels.slice(), cells: target.cells.slice() });
    while (target.undo.length > UNDO_LIMIT || (target.undo.length > 1 && target.undo.length * target.pixels.length > UNDO_BYTES)) target.undo.shift();
    target.redo = [];
  }

  /** Flattens the floating piece into the picture where it sits. */
  function dropFloat(target: Doc) {
    if (!target.float) return;
    drop(target.pixels, target.width, target.height, target.float);
    target.float = null;
  }

  function stepHistory(from: "undo" | "redo") {
    if (!doc || !doc[from].length) return;
    dropFloat(doc);
    doc[from === "undo" ? "redo" : "undo"].push({ pixels: doc.pixels, cells: doc.cells });
    Object.assign(doc, doc[from].pop());
    doc.sel = null;
    touch(doc);
  }

  /** Lifts the selection so it can move; `copy` leaves the picture underneath as it is. */
  function floatSelection(target: Doc, copy: boolean): Floating | null {
    if (target.float) {
      if (copy) drop(target.pixels, target.width, target.height, target.float);
      return target.float;
    }
    const rect = clipRect(target.sel ?? { x: 0, y: 0, w: target.width, h: target.height }, target.width, target.height);
    if (!rect) return null;
    pushUndo(target);
    target.float = lift(target.pixels, target.width, rect, copy ? undefined : blank(target));
    target.sel = rect;
    return target.float;
  }

  function moveFloat(target: Doc, x: number, y: number) {
    if (!target.float) return;
    target.float.x = x;
    target.float.y = y;
    target.sel = { x, y, w: target.float.w, h: target.float.h };
  }

  function clearSelection() {
    if (!doc?.sel) return;
    if (doc.float) doc.float = null;
    else {
      pushUndo(doc);
      fillRect(doc.pixels, doc.width, doc.height, doc.sel, blank(doc));
    }
    doc.sel = null;
    touch(doc);
  }

  function copySelection() {
    if (!doc?.sel) return false;
    const rect = clipRect(doc.sel, doc.width, doc.height);
    clip.current = doc.float ? { ...doc.float, pixels: doc.float.pixels.slice() } : rect ? lift(doc.pixels, doc.width, rect) : null;
    return clip.current !== null;
  }

  function pasteClip() {
    const scroller = scrollerRef.current, wrap = wrapRef.current;
    if (!doc || !clip.current || !scroller || !wrap) return;
    dropFloat(doc);
    pushUndo(doc);
    // The top-left corner of what is in view, on a tile boundary.
    const view = scroller.getBoundingClientRect(), box = wrap.getBoundingClientRect();
    const corner = (edge: number, size: number) => Math.min(Math.max(0, Math.ceil((edge / doc.zoom) / CELL) * CELL), Math.max(0, size - CELL));
    doc.float = { ...clip.current, pixels: clip.current.pixels.slice(), x: corner(view.left - box.left, doc.width), y: corner(view.top - box.top, doc.height) };
    doc.sel = { x: doc.float.x, y: doc.float.y, w: doc.float.w, h: doc.float.h };
    setToolState("select");
    touch(doc);
  }

  // ---- files -------------------------------------------------------------------------------------------------------

  function fitZoom(width: number, height: number): number {
    const scroller = scrollerRef.current;
    // A window that is not laid out yet (opened in the background) has no size: go by the window then.
    const room = Math.min(((scroller?.clientWidth || window.innerWidth - 270) - 64) / width, ((scroller?.clientHeight || window.innerHeight - 130) - 64) / height);
    return [...ZOOMS].reverse().find((step) => step <= room) ?? ZOOMS[0];
  }

  async function openFiles(files: Opening[]) {
    await palettesReady.current;
    let last = 0;
    for (const { file, handle, asset, info, replace } of files) {
      try {
        const bitmap = await createImageBitmap(file, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(bitmap, 0, 0);
        const keyGreen = asset?.kind === "sprites";
        const picture = quantize(context.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height, palettesRef.current, keyGreen);
        // A background's tile colors (GB Studio's per-tile palettes) dress the cells when the scene's palettes are known.
        const dressed = info?.tileColors.length ? assignSlots(picture.cells, info.tileColors, info.slots, picture.palettes) : 0;
        const old = replace !== undefined ? docs.current.findIndex((item) => item.id === replace) : -1;
        const id = old >= 0 ? replace! : nextDocId++;
        if (old < 0) last = id;
        const opened: Doc = { id, name: asset?.name ?? file.name, width: bitmap.width, height: bitmap.height, pixels: picture.pixels, cells: picture.cells, hasAlpha: picture.hasAlpha || keyGreen, palettes: picture.palettes, undo: [], redo: [], dirty: false, handle, asset: asset && info ? { kind: asset.kind, file: asset.file, name: asset.name, mtime: info.mtime, ...(hasSlots(asset.kind) ? { slots: info.slots, slotScene: info.slotScene ?? null, metaMtime: info.metaMtime, opened: info.tileColors.map((value) => value < 0 ? -1 : value & 7) } : {}), ...(asset.kind === "sprites" && info.animations?.length ? { animations: info.animations } : {}), project: projectRef.current?.path } : undefined, keyGreen: keyGreen || undefined, zoom: old >= 0 ? docs.current[old].zoom : fitZoom(bitmap.width, bitmap.height), sel: null, float: null };
        if (old >= 0) docs.current[old] = opened;
        else docs.current.push(opened);
        if (old >= 0) continue;
        const made = picture.palettes.length - palettesRef.current.length;
        if (picture.snapped) say(`${file.name}: ${picture.snapped} color${picture.snapped === 1 ? "" : "s"} in tiles of more than four colors became the nearest shade.`);
        else if (made) say(`${file.name}: tiles in colors outside the library keep them as ${made} palette${made === 1 ? "" : "s"} of the file.${asset ? " Save writes them as GB greens in order of brightness, which may differ from how GB Studio reads the colors." : ""}`);
        else if (dressed) say(`${asset?.name}: ${dressed} tile${dressed === 1 ? "" : "s"} wear the palettes GB Studio gives them.`);
        else if (picture.near) say(`${file.name}: ${picture.near} color${picture.near === 1 ? "" : "s"} a hair off the GB greens read as those greens.`);
      } catch {
        say(`${file.name} could not be read as a picture.`);
      }
    }
    if (last) setActiveId(last);
    scheduleSession();
    bump();
  }

  async function pickFiles() {
    const picker = (window as PickerWindow).showOpenFilePicker;
    if (picker) {
      try {
        const handles = await picker.call(window, { multiple: true, types: PNG_TYPES });
        await openFiles(await Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle }))));
      } catch {
        // The picker was closed.
      }
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png";
    input.multiple = true;
    input.onchange = () => void openFiles([...input.files ?? []].map((file) => ({ file })));
    input.click();
  }

  const assetQuery = (asset: { kind: AssetKind; file: string }) => new URLSearchParams({ kind: asset.kind, file: asset.file });

  /** Reads the open GB Studio project (its pictures and palettes), or notes that none is open. */
  async function loadProject(): Promise<void> {
    const asJson = <T,>(response: Response) => response.ok && response.headers.get("content-type")?.includes("json") ? response.json() as Promise<T> : null;
    const ping = await fetch("./__cartographer/ping", { cache: "no-cache" }).then((response) => asJson<{ ok?: boolean; project?: { path: string } | null; recent?: { name: string; path: string }[] }>(response)).catch(() => null);
    setServed(Boolean(ping?.ok));
    setRecent(ping?.recent ?? []);
    const opened = ping?.ok && ping.project ? await fetch(PROJECT_URL, { cache: "no-cache" }).then((response) => asJson<{ ok?: boolean } & Project>(response)).catch(() => null) : null;
    if (opened?.ok) {
      palettesRef.current = opened.palettes.filter((palette) => palette.colors?.length === 4);
      projectRef.current = { name: opened.name, path: opened.path, assets: opened.assets, palettes: opened.palettes };
      setProject(projectRef.current);
    } else {
      palettesRef.current = [];
      projectRef.current = null;
      setProject(null);
    }
    setPalettes(palettesRef.current);
  }

  /** Opens a project folder by path (a Recent entry). */
  /** Pictures opened from the current project (older sessions did not record the project: they count too). */
  const projectDocs = () => docs.current.filter((item) => item.asset && (!item.asset.project || item.asset.project === projectRef.current?.path));

  /**
   * Before the project changes: unsaved pictures of the current project are saved (or, if the user says so,
   * discarded). Returns false when the user backs out.
   */
  async function readyToLeaveProject(): Promise<boolean> {
    const dirty = projectDocs().filter((item) => item.dirty);
    if (!dirty.length) return true;
    const names = dirty.map((item) => item.name).join(", ");
    if (window.confirm(`Save your changes to ${names} before leaving ${projectRef.current?.name ?? "this project"}?`)) {
      await save(false);
      return !projectDocs().some((item) => item.dirty);
    }
    return window.confirm(`Leave ${projectRef.current?.name ?? "this project"} and discard the changes to ${names}?`);
  }

  /** After the project changed: the old project's pictures close (their files belong to that project). */
  function closeDocsOf(oldPath: string | undefined) {
    if (!oldPath || oldPath === projectRef.current?.path) return;
    const keep = docs.current.filter((item) => !(item.asset && (!item.asset.project || item.asset.project === oldPath)));
    if (keep.length === docs.current.length) return;
    docs.current = keep;
    if (!keep.some((item) => item.id === activeId)) setActiveId(keep[0]?.id ?? 0);
    scheduleSession();
    bump();
  }

  /** Opens a project folder by path (a Recent entry). */
  async function openProjectPath(path: string) {
    if (path === projectRef.current?.path) return;
    if (!await readyToLeaveProject()) return;
    const oldPath = projectRef.current?.path;
    const response = await fetch("./__cartographer/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
    const result = await response.json() as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) return say(result.error ?? response.statusText);
    palettesReady.current = loadProject();
    await palettesReady.current;
    closeDocsOf(oldPath);
    setShowProject(true);
  }

  /** Closes the project: back to the start screen; its pictures close too. */
  async function closeProject() {
    if (!projectRef.current || !await readyToLeaveProject()) return;
    const oldPath = projectRef.current.path;
    await fetch("./__cartographer/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: "" }) });
    palettesReady.current = loadProject();
    await palettesReady.current;
    closeDocsOf(oldPath);
  }

  /** Asks for a GB Studio project folder: the desktop app's folder dialog, or a typed path on the dev server. `demo` opens a copy of the shipped demo instead. */
  async function chooseProject(demo = false) {
    const native = (window as PickerWindow).gbc;
    if (!await readyToLeaveProject()) return;
    const oldPath = projectRef.current?.path;
    try {
      if (demo) {
        const response = await fetch("./__cartographer/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demo: true }) });
        const result = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok || !result.ok) return say(result.error ?? response.statusText);
      } else if (native) {
        if (!await native.chooseProject()) return;
      } else {
        const path = window.prompt("Path of the GB Studio project: its .gbsproj file, or the folder that holds it:", project?.path ?? "");
        if (!path) return;
        const response = await fetch("./__cartographer/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
        const result = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok || !result.ok) return say(result.error ?? response.statusText);
      }
      palettesReady.current = loadProject();
      await palettesReady.current;
      closeDocsOf(oldPath);
      setShowProject(true);
    } catch (error) {
      say(`Could not open the project: ${(error as Error).message}`);
    }
  }

  /**
   * Before project JSON is written: if GB Studio seems to be running, ask once per session. GB Studio keeps the
   * project in memory and writes it back when it saves, which would undo changes made here.
   */
  async function okToWriteProjectJson(): Promise<boolean> {
    if (gbStudioWarned.current) return true;
    const status = await fetch("./__cartographer/gbstudio-running", { cache: "no-cache" }).then((response) => response.ok ? response.json() as Promise<{ running?: boolean }> : null).catch(() => null);
    if (!status?.running) return true;
    gbStudioWarned.current = true;
    return window.confirm("GB Studio looks open. It keeps the project in memory and may overwrite palettes and tile colors written here when it saves. Close it, or reload the project there afterwards.\n\nWrite anyway?");
  }

  /** Doc palettes (by GB Studio id) whose colors or name differ from the project's: the active picture's copy wins. */
  function editedProjectPalettes(): { id: string; name: string; colors: string[] }[] {
    const byId = new Map(palettesRef.current.filter((item) => item.id).map((item) => [item.id!, item]));
    const edited = new Map<string, { id: string; name: string; colors: string[] }>();
    for (const item of [...docs.current].sort((a, b) => (a === doc ? -1 : b === doc ? 1 : 0))) {
      for (const own of item.palettes) {
        const base = own.id ? byId.get(own.id) : undefined;
        if (!own.id || !base || edited.has(own.id)) continue;
        if (base.colors.join() !== own.colors.join() || base.name !== own.name) edited.set(own.id, { id: own.id, name: own.name, colors: [...own.colors] });
      }
    }
    return [...edited.values()];
  }

  /**
   * Writes a palette into the project (new without `id`, else rewritten in place), then rereads the project and
   * passes new colors on to open pictures whose copy of that palette was unchanged. Resolves to the palette's id.
   */
  async function writeProjectPalette(palette: { id?: string; name: string; colors: string[] }): Promise<string | null> {
    try {
      const mtime = palette.id ? projectRef.current?.palettes.find((item) => item.id === palette.id)?.mtime : undefined;
      const post = (force: boolean) => fetch("./__cartographer/gbstudio-palette", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...palette, ...(mtime !== undefined ? { mtime } : {}), force }) });
      let response = await post(false);
      if (response.status === 409) {
        if (!window.confirm(`${palette.name} changed on disk since the project was read (GB Studio or another app saved it). Replace it with these colors?`)) return null;
        response = await post(true);
      }
      const result = await response.json() as { ok?: boolean; error?: string; id?: string };
      if (!response.ok || !result.ok || !result.id) {
        say(`Could not write the palette: ${result.error ?? response.statusText}`);
        return null;
      }
      const before = new Map(palettesRef.current.filter((item) => item.id).map((item) => [item.id!, item.colors.join()]));
      await loadProject();
      for (const item of docs.current) {
        for (const own of item.palettes) {
          if (own.id !== result.id || before.get(result.id) !== own.colors.join()) continue;
          own.colors = [...palette.colors];
          own.name = palette.name;
        }
        if (!palette.id) item.palettes.push({ id: result.id, name: palette.name, colors: [...palette.colors] });
      }
      scheduleSession();
      bump();
      return result.id;
    } catch (error) {
      say(`Could not write the palette: ${(error as Error).message}`);
      return null;
    }
  }

  /** Opens a project asset as a picture (or shows it, when it is already open). */
  async function openAsset(asset: Asset) {
    const open = docs.current.find((item) => item.asset?.kind === asset.kind && item.asset.file === asset.file);
    if (open) return setActiveId(open.id);
    try {
      const [png, info] = await Promise.all([
        fetch(`${ASSET_URL}?${assetQuery(asset)}`, { cache: "no-cache" }).then((response) => response.ok ? response.blob() : Promise.reject(new Error(response.statusText))),
        fetch(`${ASSET_URL}-info?${assetQuery(asset)}`, { cache: "no-cache" }).then((response) => response.ok ? response.json() as Promise<AssetInfo> : Promise.reject(new Error(response.statusText))),
      ]);
      await openFiles([{ file: new File([png], asset.file, { type: "image/png" }), asset, info }]);
    } catch (error) {
      say(`Could not open ${asset.name}: ${(error as Error).message}`);
    }
  }

  /**
   * Puts a backed-up version back into the project, then shows it: an open picture of that file (or of its sidecar)
   * reloads, the project's thumbnails and palettes are read again, and open pictures reread their slots.
   */
  async function restoreFromBackup(file: string, version: string): Promise<boolean> {
    const match = /^assets\/(backgrounds|sprites|tilesets|fonts)\/([^/]+\.png)(\.gbsres)?$/i.exec(file);
    const open = match ? docs.current.find((item) => item.asset?.kind === match[1] && item.asset.file === match[2] && (!item.asset.project || item.asset.project === projectRef.current?.path)) : undefined;
    if (open?.dirty && !window.confirm(`${open.name} has unsaved changes. Restoring replaces them with the backup. Go on?`)) return false;
    if (!file.endsWith(".png") && !await okToWriteProjectJson()) return false;
    try {
      const response = await fetch("./__cartographer/backup-restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file, version }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) { say(`Could not restore ${file}: ${result.error ?? response.statusText}`); return false; }
    } catch (error) {
      say(`Could not restore ${file}: ${(error as Error).message}`);
      return false;
    }
    await loadProject();
    if (open) await reloadAsset(open);
    await rereadSlots();
    setSlotsVersion((value) => value + 1);
    say(`Restored ${file.split("/").pop()} from ${new Date(versionTime(version)).toLocaleString()}`);
    return true;
  }

  /** Reads an open project picture again from disk, in place (a restore, or GB Studio changed it). */
  async function reloadAsset(target: Doc): Promise<boolean> {
    const asset = target.asset;
    if (!asset) return false;
    try {
      const [png, info] = await Promise.all([
        fetch(`${ASSET_URL}?${assetQuery(asset)}`, { cache: "no-cache" }).then((response) => response.ok ? response.blob() : Promise.reject(new Error(response.statusText))),
        fetch(`${ASSET_URL}-info?${assetQuery(asset)}`, { cache: "no-cache" }).then((response) => response.ok ? response.json() as Promise<AssetInfo> : Promise.reject(new Error(response.statusText))),
      ]);
      const listed = projectRef.current?.assets.find((item) => item.kind === asset.kind && item.file === asset.file);
      await openFiles([{ file: new File([png], asset.file, { type: "image/png" }), asset: listed ?? { kind: asset.kind, file: asset.file, name: asset.name } as Asset, info, replace: target.id }]);
      return true;
    } catch (error) {
      say(`Could not reload ${asset.name}: ${(error as Error).message}`);
      return false;
    }
  }

  /** Writes the picture over its GB Studio asset (the server keeps a backup and refuses a file that changed on disk). */
  async function saveAsset(target: Doc, blob: Blob): Promise<boolean> {
    const asset = target.asset!;
    if (asset.project && asset.project !== projectRef.current?.path) {
      say(`${asset.name} belongs to ${asset.project}. Open that project to save it, or use Export.`);
      return false;
    }
    const post = (force: boolean) => fetch(`${ASSET_URL}?${assetQuery(asset)}&mtime=${asset.mtime}${force ? "&force=1" : ""}`, { method: "POST", body: blob });
    let response = await post(false);
    if (response.status === 409) {
      if (!window.confirm(`${asset.name} changed on disk since you opened it (GB Studio or another app saved it). Replace it with this picture?`)) return false;
      response = await post(true);
    }
    const result = await response.json() as { ok?: boolean; error?: string; mtime?: number };
    if (response.status === 404) throw new Error(`${asset.file} is no longer in the project folder (it was moved or deleted). Put it back, or Export copy to save elsewhere.`);
    if (!response.ok || !result.ok) throw new Error(result.error ?? response.statusText);
    asset.mtime = result.mtime ?? asset.mtime;
    target.dirty = false;
    // The thumbnail in the project panel shows the new file.
    setProject((current) => current && { ...current, assets: current.assets.map((item) => item.kind === asset.kind && item.file === asset.file ? { ...item, mtime: asset.mtime } : item) });
    const notes = [`Saved ${asset.name} into the GB Studio project`];
    if (hasSlots(asset.kind) && asset.slots?.length) notes.push(...await saveTileColors(target));
    say(notes.join(". "));
    return true;
  }

  /**
   * Writes a background's or sprite sheet's tile palettes into GB Studio as palette slots: a tile wearing one of
   * the eight palettes gets that slot (with named slots on, a Chorbi-style variant gets its base palette's);
   * "None" and palettes outside the eight leave the tile's slot as it is. Only
   * cells whose slot differs from the one they were opened with are sent, so a sprite slice that several frames
   * show in different palettes keeps them unless the user paints it.
   */
  async function saveTileColors(target: Doc): Promise<string[]> {
    const asset = target.asset!;
    const slotOf = new Map<number, number>();
    const slotNames = asset.slots!.map((id) => target.palettes.find((palette) => palette.id === id)?.name);
    target.palettes.forEach((palette, index) => {
      const slot = palette.id ? asset.slots!.indexOf(palette.id) : -1;
      const named = slot < 0 && namedSlotsRef.current ? namedSlot(palette.name, slotNames) : -1;
      if (slot >= 0 || named >= 0) slotOf.set(index + 1, slot >= 0 ? slot : named);
    });
    let outside = 0;
    const slots = Array.from(target.cells, (wear, cell) => {
      if (!wear) return null;
      const slot = slotOf.get(wear);
      if (slot === undefined) outside += 1;
      return slot === undefined || slot === asset.opened?.[cell] ? null : slot;
    });
    if (!await okToWriteProjectJson()) return ["Tile palettes not written"];
    const post = (force: boolean) => fetch(`./__cartographer/gbstudio-tile-colors?${new URLSearchParams({ kind: asset.kind, file: asset.file })}${asset.metaMtime != null ? `&metaMtime=${asset.metaMtime}` : ""}${force ? "&force=1" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slots }) });
    let response = await post(false);
    if (response.status === 409) {
      if (!window.confirm(`The palettes of ${asset.name} changed in GB Studio since you opened it. Replace them with this picture's?`)) return ["Tile palettes not written"];
      response = await post(true);
    }
    const result = await response.json() as { ok?: boolean; error?: string; mtime?: number; changed?: boolean; cells?: number };
    if (!response.ok || !result.ok) return [`Tile palettes not written: ${result.error ?? response.statusText}`];
    asset.metaMtime = result.mtime ?? asset.metaMtime;
    const notes: string[] = [];
    if (result.changed) notes.push(`${result.cells} tile palette${result.cells === 1 ? "" : "s"} written to GB Studio`);
    if (outside) notes.push(`${outside} tile${outside === 1 ? "" : "s"} wear palettes outside the eight slots and keep their slot`);
    return notes;
  }

  /**
   * Open pictures of the current project reread their palette slots (a scene's palette list may have changed since
   * the session was kept); those from an older session, or tilesets opened before they had palette slots, also
   * learn their tile slots as opened.
   */
  async function rereadSlots() {
    const path = projectRef.current?.path;
    if (!path) return;
    const ours = docs.current.filter((item) => item.asset && hasSlots(item.asset.kind) && (!item.asset.project || item.asset.project === path));
    await Promise.all(ours.map(async (item) => {
      const asset = item.asset!;
      const info = await fetch(`${ASSET_URL}-info?${assetQuery(asset)}`, { cache: "no-cache" }).then((response) => response.ok ? response.json() as Promise<AssetInfo> : null).catch(() => null);
      if (!info) return;
      if (!asset.slots) Object.assign(asset, { metaMtime: info.metaMtime, opened: info.tileColors.map((value) => value < 0 ? -1 : value & 7), project: path });
      Object.assign(asset, { slots: info.slots, slotScene: info.slotScene ?? null });
    }));
    if (ours.length) bump();
  }

  /**
   * Puts one of the open picture's palettes into slot `slot` (0–7) in GB Studio: the scene's palette list, or the
   * project's default palettes. Open pictures that take their slots from the same place learn the new ones, and
   * the toast says how many tiles wore the palette that was moved out.
   */
  async function putInSlot(paletteIndex: number, slot: number) {
    const target = doc, asset = target?.asset, palette = target?.palettes[paletteIndex - 1];
    if (!target || !asset?.slots || !palette) return;
    if (!palette.id) return say(`${palette.name} is not in the project yet: add it from the palette manager first.`);
    if (asset.project && asset.project !== projectRef.current?.path) return say(`${asset.name} belongs to ${asset.project}. Open that project to change its slots.`);
    if (slot === UI_SLOT && asset.kind !== "sprites" && !window.confirm(`Slot 8 is the UI palette: GB Studio draws dialogue boxes and menus with it. Put ${palette.name} there anyway?`)) return;
    if (!await okToWriteProjectJson()) return;
    const old = asset.slots[slot];
    const oldPalette = target.palettes.find((item) => item.id === old);
    try {
      const post = (expected?: string) => fetch(`./__cartographer/gbstudio-palette-slot?${assetQuery(asset)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot, paletteId: palette.id, ...(expected !== undefined ? { expected } : {}) }) });
      let response = await post(old ?? "");
      if (response.status === 409) {
        const { current } = await response.json() as { current?: string };
        const now = target.palettes.find((item) => item.id === current)?.name ?? "another palette";
        if (!window.confirm(`Slot ${slot + 1} changed on disk: it now holds ${now}. Replace it with ${palette.name}?`)) { await rereadSlots(); bump(); return; }
        response = await post();
      }
      const result = await response.json() as { ok?: boolean; error?: string; slots?: string[]; scene?: string | null };
      if (!response.ok || !result.ok || !result.slots) return say(`Could not put ${palette.name} in slot ${slot + 1}: ${result.error ?? response.statusText}`);
      await rereadSlots();
      const where = result.scene ? `${result.scene}'s palettes` : `the project's default ${asset.kind === "sprites" ? "sprite" : "background"} palettes`;
      const oldIndex = oldPalette ? target.palettes.indexOf(oldPalette) + 1 : 0;
      const left = oldIndex && !result.slots.includes(old) ? target.cells.reduce((count, wear) => count + (wear === oldIndex ? 1 : 0), 0) : 0;
      say(`${palette.name} is in slot ${slot + 1} of ${where}${oldPalette && oldPalette !== palette ? ` (it held ${oldPalette.name})` : ""}.${left ? ` ${left} tile${left === 1 ? "" : "s"} here wear ${oldPalette!.name}, now outside the eight: in GB Studio they show slot ${slot + 1} until repainted.` : ""} Save to write this picture's tiles.`);
      setSlotsVersion((version) => version + 1);
      scheduleSession();
      bump();
    } catch (error) {
      say(`Could not put ${palette.name} in slot ${slot + 1}: ${(error as Error).message}`);
    }
  }

  function pngBlob(target: Doc): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    canvas.getContext("2d")!.putImageData(new ImageData(toRgba(target.pixels, target.cells, target.width, [], target.keyGreen ? KEY_GREEN : undefined), target.width, target.height), 0, 0);
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No PNG")), "image/png"));
  }

  /**
   * Writes one picture as a flat PNG in the GB greens (palettes and tint are only for looking): into its GB Studio
   * project, over its file, or (`copy`, or no file to write to) to a place the user picks. Returns what happened.
   */
  async function saveDoc(target: Doc, copy: boolean, askWhere: boolean): Promise<string | null> {
    dropFloat(target);
    try {
      const blob = await pngBlob(target);
      if (!copy && target.asset) return await saveAsset(target, blob) ? target.asset.name : null;
      const picker = (window as PickerWindow).showSaveFilePicker;
      let handle = copy ? undefined : target.handle;
      if (!handle && !askWhere) return null;
      if (!handle && picker) handle = await picker.call(window, { suggestedName: target.name, types: PNG_TYPES });
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        if (!copy || !target.handle) Object.assign(target, { handle, name: handle.name, dirty: false });
        return handle.name;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = target.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      target.dirty = false;
      return `${target.name} (downloaded)`;
    } catch (error) {
      if ((error as Error).name !== "AbortError") say(`Could not save ${target.name}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Save (Ctrl+S) saves every changed picture that has somewhere to go; the active one is asked where when it has
   * none. Export copy (Ctrl+E) saves a copy of the active picture only.
   */
  async function save(copy: boolean) {
    if (!doc) return;
    bump();
    if (copy) {
      const name = await saveDoc(doc, true, true);
      if (name) say(`Exported ${name}`);
    } else {
      const changed = docs.current.filter((item) => item.dirty || item === doc);
      const saved: string[] = [];
      for (const item of changed) {
        const name = await saveDoc(item, false, item === doc);
        if (name) saved.push(name);
      }
      // Palettes recolored in the sidebar go into the project too (the manager's "Save into project" does the same).
      const edited = project ? editedProjectPalettes() : [];
      let written = 0;
      if (edited.length && await okToWriteProjectJson()) for (const palette of edited) if (await writeProjectPalette(palette)) written += 1;
      const note = written ? ` · ${written} palette${written === 1 ? "" : "s"} written to the project` : "";
      if (saved.length > 1) say(`Saved ${saved.length} pictures: ${saved.join(", ")}${note}`);
      else if (saved.length === 1 && !doc.asset) say(`Saved ${saved[0]}${note}`);
      else if (written) say(`${written} palette${written === 1 ? "" : "s"} written to the project`);
    }
    scheduleSession();
    bump();
  }

  function closeDoc(target: Doc) {
    if (target.dirty && !window.confirm(`Close ${target.name} without saving?`)) return;
    const index = docs.current.indexOf(target);
    docs.current.splice(index, 1);
    if (target.id === activeId) setActiveId(docs.current[Math.min(index, docs.current.length - 1)]?.id ?? 0);
    scheduleSession();
    bump();
  }

  /** Recolors the picked palette in this picture only (the library keeps its own colors). */
  function recolorPalette(colors: readonly string[]) {
    if (!doc || !picked) return;
    picked.colors = colors.map((color) => color.toUpperCase());
    touch(doc);
  }

  const libraryColors = picked ? palettes.find((palette) => (picked.id ? palette.id === picked.id : palette.name === picked.name))?.colors : undefined;
  const normalizeHex = (color: string) => /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000";

  /** A shade square's color: the picked palette's color at that position, or the tint's (which becomes Custom). */
  function changeShadeColor(index: number, color: string) {
    if (picked) return recolorPalette(picked.colors.map((old, at) => at === index ? color : old));
    const next = tintColors.map((old, at) => at === index ? color : old);
    setCustomTint(next);
    setTint("Custom");
  }

  // ---- painting ----------------------------------------------------------------------------------------------------

  function pointAt(event: { clientX: number; clientY: number }): Point {
    const box = wrapRef.current!.getBoundingClientRect();
    return { x: Math.floor((event.clientX - box.left) / box.width * doc!.width), y: Math.floor((event.clientY - box.top) / box.height * doc!.height) };
  }

  const inside = (target: Doc, { x, y }: Point) => x >= 0 && y >= 0 && x < target.width && y < target.height;

  function mark(target: Doc, { x, y }: Point, value: number) {
    for (const [mx, my] of mirrorPoints(x, y, target.width, target.height, mirror)) dot(target.pixels, target.width, target.height, mx, my, brush, value);
  }

  /**
   * The palette brush covers `cellBrush` × `cellBrush` tiles around the pointer (8 × 8 each, or on a sprite sheet
   * the 8 × 16 pairs GB Studio's sprite tiles are made of).
   */
  function setCell(target: Doc, point: Point) {
    if (!inside(target, point)) return;
    const cw = cellsWide(target.width), ch = Math.ceil(target.height / CELL);
    const tall = target.keyGreen ? 2 : 1;
    const offset = Math.floor((cellBrush - 1) / 2);
    const cx0 = (point.x >> 3) - offset, cy0 = (target.keyGreen ? point.y >> 4 << 1 : point.y >> 3) - offset * tall;
    for (let by = 0; by < cellBrush * tall; by += 1) {
      for (let bx = 0; bx < cellBrush; bx += 1) {
        const cx = cx0 + bx, cy = cy0 + by;
        if (cx >= 0 && cy >= 0 && cx < cw && cy < ch) target.cells[cy * cw + cx] = activePalette;
      }
    }
  }

  function drawShape(target: Doc, a: Point, b: Point, value: number) {
    if (tool === "rectFill") return fillRect(target.pixels, target.width, target.height, rectFrom(a.x, a.y, b.x, b.y), value);
    const points = tool === "line" ? linePoints(a.x, a.y, b.x, b.y)
      : tool === "ellipse" ? ellipsePoints(a.x, a.y, b.x, b.y)
      : [...linePoints(a.x, a.y, b.x, a.y), ...linePoints(b.x, a.y, b.x, b.y), ...linePoints(b.x, b.y, a.x, b.y), ...linePoints(a.x, b.y, a.x, a.y)];
    for (const [x, y] of points) dot(target.pixels, target.width, target.height, x, y, brush, value);
  }

  function pickShade(target: Doc, point: Point) {
    if (!inside(target, point)) return;
    const flat = target.float ? target.pixels.slice() : target.pixels;
    if (target.float) drop(flat, target.width, target.height, target.float);
    setShade(flat[point.y * target.width + point.x]);
  }

  function pointerDown(event: React.PointerEvent) {
    if (!doc || event.button === 1) return;
    const scroller = scrollerRef.current!;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "hand" || spaceDown.current) {
      drag.current = { kind: "pan", x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
      return;
    }
    const point = pointAt(event);
    if (event.button === 2) {
      if (tool === "palette" && inside(doc, point)) setActivePalette(doc.cells[(point.y >> 3) * cellsWide(doc.width) + (point.x >> 3)]);
      else pickShade(doc, point);
      return;
    }
    const value = tool === "eraser" || tool === "fillErase" || (shade === CLEAR && !doc.hasAlpha) ? blank(doc) : shade;
    if (tool === "eyedropper") {
      // Came here from the palette brush: pick the tile's palette instead of a shade.
      if (paintTool.current === "palette") { if (inside(doc, point)) setActivePalette(doc.cells[(point.y >> 3) * cellsWide(doc.width) + (point.x >> 3)]); }
      else pickShade(doc, point);
      setToolState(paintTool.current);
    } else if (tool === "select" || tool === "move") {
      const sel = doc.sel;
      if (tool === "move" || (sel && point.x >= sel.x && point.y >= sel.y && point.x < sel.x + sel.w && point.y < sel.y + sel.h)) {
        const floating = floatSelection(doc, event.altKey);
        if (floating) drag.current = { kind: "move", start: point, ox: floating.x, oy: floating.y };
      } else {
        dropFloat(doc);
        doc.sel = null;
        drag.current = { kind: "marquee", start: point };
      }
    } else if (tool === "palette") {
      pushUndo(doc);
      for (const [x, y] of event.shiftKey && lastPoint.current ? linePoints(lastPoint.current.x, lastPoint.current.y, point.x, point.y) : [[point.x, point.y]]) setCell(doc, { x, y });
      drag.current = { kind: "cells", last: point };
      lastPoint.current = point;
    } else if (tool === "fill" || tool === "fillErase") {
      pushUndo(doc);
      if (!floodFill(doc.pixels, doc.width, doc.height, point.x, point.y, value)) doc.undo.pop();
    } else if (tool === "pencil" || tool === "eraser") {
      pushUndo(doc);
      for (const [x, y] of event.shiftKey && lastPoint.current ? linePoints(lastPoint.current.x, lastPoint.current.y, point.x, point.y) : [[point.x, point.y]]) mark(doc, { x, y }, value);
      drag.current = { kind: "stroke", last: point };
      lastPoint.current = point;
    } else if (tool === "spray") {
      pushUndo(doc);
      for (const [x, y] of mirrorPoints(point.x, point.y, doc.width, doc.height, mirror)) spray(doc.pixels, doc.width, doc.height, x, y, brush, value);
      drag.current = { kind: "spray", last: point };
    } else {
      pushUndo(doc);
      drag.current = { kind: "shape", start: point, base: doc.pixels.slice() };
      drawShape(doc, point, point, value);
    }
    touch(doc);
  }

  function pointerMove(event: React.PointerEvent) {
    if (!doc) return;
    const point = pointAt(event);
    if (readoutRef.current) readoutRef.current.textContent = inside(doc, point) ? `${point.x}, ${point.y} · tile ${point.x >> 3}, ${point.y >> 3}` : "";
    const outline = brushRef.current;
    if (outline) {
      const cells = tool === "palette", tall = cells && doc.keyGreen;
      const cellH = tall ? 2 * CELL : CELL, cellOffset = Math.floor((cellBrush - 1) / 2);
      const size = cells ? CELL * cellBrush : brush, offset = cells ? 0 : Math.floor((brush - 1) / 2);
      const [x, y] = cells ? [(point.x & ~7) - cellOffset * CELL, (tall ? point.y & ~15 : point.y & ~7) - cellOffset * cellH] : [point.x - offset, point.y - offset];
      const visible = inside(doc, point) && tool !== "hand" && tool !== "select" && tool !== "move";
      Object.assign(outline.style, { display: visible ? "block" : "none", left: `${x * doc.zoom}px`, top: `${y * doc.zoom}px`, width: `${size * doc.zoom}px`, height: `${(cells ? cellH * cellBrush : size) * doc.zoom}px` });
    }
    const state = drag.current;
    if (!state) return;
    const value = tool === "eraser" || (shade === CLEAR && !doc.hasAlpha) ? blank(doc) : shade;
    if (state.kind === "pan") {
      const scroller = scrollerRef.current!;
      scroller.scrollLeft = state.left - (event.clientX - state.x);
      scroller.scrollTop = state.top - (event.clientY - state.y);
      return;
    }
    if (state.kind === "stroke") {
      for (const [x, y] of linePoints(state.last.x, state.last.y, point.x, point.y)) mark(doc, { x, y }, value);
      state.last = lastPoint.current = point;
    } else if (state.kind === "spray") {
      for (const [x, y] of mirrorPoints(point.x, point.y, doc.width, doc.height, mirror)) spray(doc.pixels, doc.width, doc.height, x, y, brush, value);
    } else if (state.kind === "cells") {
      for (const [x, y] of linePoints(state.last.x, state.last.y, point.x, point.y)) setCell(doc, { x, y });
      state.last = lastPoint.current = point;
    } else if (state.kind === "shape") {
      doc.pixels.set(state.base);
      drawShape(doc, state.start, point, value);
    } else if (state.kind === "marquee") {
      const rect = rectFrom(state.start.x, state.start.y, point.x, point.y);
      doc.sel = clipRect(snap ? snapRect(rect, CELL) : rect, doc.width, doc.height);
    } else if (state.kind === "move") {
      const step = (distance: number) => snap ? Math.round(distance / CELL) * CELL : distance;
      moveFloat(doc, state.ox + step(point.x - state.start.x), state.oy + step(point.y - state.start.y));
    }
    bump();
  }

  function pointerUp() {
    const state = drag.current;
    drag.current = null;
    if (!doc || !state || state.kind === "pan") return;
    if (state.kind === "marquee" && doc.sel && doc.sel.w < 2 && doc.sel.h < 2) doc.sel = null;
    if (state.kind !== "marquee") touch(doc);
    else bump();
  }

  function zoomBy(direction: 1 | -1): number | null {
    if (!doc) return null;
    const next = nextStep(ZOOMS, doc.zoom, direction);
    flushSync(() => { doc.zoom = next; bump(); });
    return next;
  }

  // ---- keys --------------------------------------------------------------------------------------------------------

  function keyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.matches?.("input, select, textarea")) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (event.ctrlKey || event.metaKey) {
      const action = key === "o" ? pickFiles
        : key === "s" || key === "e" ? () => void save(event.shiftKey || key === "e")
        : key === "z" ? () => stepHistory(event.shiftKey ? "redo" : "undo")
        : key === "y" ? () => stepHistory("redo")
        : key === "c" ? copySelection
        : key === "x" ? () => { if (copySelection()) clearSelection(); }
        : key === "a" ? () => { if (doc) { dropFloat(doc); doc.sel = { x: 0, y: 0, w: doc.width, h: doc.height }; setToolState("select"); bump(); } }
        : key === "=" || key === "+" ? () => zoomBy(1)
        : key === "-" ? () => zoomBy(-1)
        : null;
      if (!action) return;
      event.preventDefault();
      void action();
      return;
    }
    if (event.altKey) return;
    if (key === " ") {
      spaceDown.current = true;
      event.preventDefault();
      return;
    }
    const found = TOOLS.find(([, , , keys]) => keys.toLowerCase() === `${event.shiftKey ? "shift+" : ""}${key}`);
    if (found) return setTool(found[0]);
    if (event.shiftKey && key === "m") return setMirror(MIRRORS[(MIRRORS.indexOf(mirror) + 1) % MIRRORS.length]);
    if (key >= "1" && key <= "4") return setShade(Number(key) - 1);
    if (key === "0" && doc?.hasAlpha) return setShade(CLEAR);
    if (key === "[") return tool === "palette" ? setCellBrush(Math.max(1, cellBrush - 1)) : setBrush(Math.max(1, brush - 1));
    if (key === "]") return tool === "palette" ? setCellBrush(Math.min(3, cellBrush + 1)) : setBrush(Math.min(16, brush + 1));
    if (!doc) return;
    if (key === "Escape") {
      dropFloat(doc);
      doc.sel = null;
      return touch(doc);
    }
    if (key === "Delete" || key === "Backspace") return clearSelection();
    const arrow = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[key];
    if (arrow && doc.sel) {
      event.preventDefault();
      const floating = floatSelection(doc, false);
      const step = event.shiftKey || snap ? CELL : 1;
      if (floating) moveFloat(doc, floating.x + arrow[0] * step, floating.y + arrow[1] * step);
      touch(doc);
    }
  }

  // Listeners registered once call the handlers of the latest render.
  const latest = useRef({ keyDown, zoomBy, openFiles, pasteClip, writeSession, zoom: doc?.zoom ?? 1 });
  latest.current = { keyDown, zoomBy, openFiles, pasteClip, writeSession, zoom: doc?.zoom ?? 1 };

  useEffect(() => {
    // The project's palettes come first: reading a picture needs them to recognise colored tiles.
    palettesReady.current = loadProject();
    void palettesReady.current
      .then(() => sessionStore<{ active: number; docs: Omit<Doc, "id" | "undo" | "redo" | "sel" | "float">[] }>("readonly", (objects) => objects.get("open")))
      .then((session) => {
        if (!session?.docs?.length || docs.current.length) return;
        docs.current = session.docs.map((saved) => ({ ...saved, palettes: saved.palettes ?? clonePalettes(palettesRef.current), id: nextDocId++, undo: [], redo: [], sel: null, float: null }));
        setActiveId(docs.current[Math.max(0, session.active)]?.id ?? docs.current[0].id);
        void rereadSlots();
      });
    const onKeyDown = (event: KeyboardEvent) => latest.current.keyDown(event);
    const onKeyUp = (event: KeyboardEvent) => { if (event.key === " ") spaceDown.current = false; };
    const onPaste = (event: ClipboardEvent) => {
      const images = [...event.clipboardData?.files ?? []].filter((file) => file.type.startsWith("image/"));
      if (clip.current) latest.current.pasteClip();
      else if (images.length) void latest.current.openFiles(images.map((file) => ({ file })));
    };
    const onHide = () => void latest.current.writeSession();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("paste", onPaste);
    window.addEventListener("pagehide", onHide);
    // The desktop app waits for this before its window closes.
    (window as PickerWindow).__gbcFlushSession = () => latest.current.writeSession();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const detachWheel = attachWheelZoom(scroller, () => latest.current.zoom, (direction) => latest.current.zoomBy(direction), () => wrapRef.current);
    const detachPan = attachMiddlePan(scroller);
    return () => { detachWheel(); detachPan(); };
  }, []);

  useEffect(() => { document.title = doc ? `${doc.name}${doc.dirty ? " *" : ""} · GB Cartographer` : "GB Cartographer"; });
  useEffect(() => { store(TINT_KEY, tint); store(CUSTOM_TINT_KEY, customTint); store(GRID_KEY, grid); store(BUDGET_KEY, budgetId); store(PROJECT_PANEL_KEY, showProject); store(PROJECT_KIND_KEY, projectKind); }, [tint, customTint, grid, budgetId, showProject, projectKind]);

  const budget = BUDGETS.find((item) => item.id === budgetId) ?? BUDGETS[0];
  // The tile count trails painting by a moment, so a big picture is not recounted on every pointer move.
  useEffect(() => {
    if (!doc) return;
    const timer = window.setTimeout(() => {
      let pixels = doc.pixels;
      if (doc.float) {
        pixels = pixels.slice();
        drop(pixels, doc.width, doc.height, doc.float);
      }
      setTileCount(countUniqueTiles(pixels, doc.width, doc.height, budget.flips));
    }, 150);
    return () => window.clearTimeout(timer);
  });

  const animations = doc?.asset?.animations ?? [];
  const animation = animations[Math.min(frame.animation, Math.max(0, animations.length - 1))];
  const frames = animation?.frames ?? [];
  const current = frames[Math.min(frame.index, Math.max(0, frames.length - 1))];
  useEffect(() => { setFrame({ animation: 0, index: 0 }); setPlaying(false); }, [activeId]);
  useEffect(() => { void rereadSlots(); }, [project]);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = window.setInterval(() => setFrame((at) => ({ ...at, index: (at.index + 1) % frames.length })), 125);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);
  // Frame thumbnails: each frame's slices copied from the drawn sheet, after the sheet itself is drawn.
  useLayoutEffect(() => {
    const sheet = canvasRef.current;
    if (!sheet || !frames.length) return;
    frames.forEach((item, index) => {
      const canvas = frameCanvases.current[index];
      if (!canvas) return;
      const width = Math.max(16, ...item.tiles.map((tile) => tile.x + 8)), height = Math.max(16, ...item.tiles.map((tile) => tile.y + 16));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const context = canvas.getContext("2d")!;
      context.clearRect(0, 0, width, height);
      for (const tile of item.tiles) {
        context.save();
        context.translate(tile.x + (tile.flipX ? 8 : 0), tile.y + (tile.flipY ? 16 : 0));
        context.scale(tile.flipX ? -1 : 1, tile.flipY ? -1 : 1);
        context.drawImage(sheet, tile.sliceX, tile.sliceY, 8, 16, 0, 0, 8, 16);
        context.restore();
      }
    });
  });

  const isFont = doc?.asset?.kind === "fonts" || (doc?.width === 128 && doc?.height === 112 && !doc.asset);
  // The font sample: each character's 8 × 8 glyph copied from the drawn sheet, wrapped at the strip's width.
  useLayoutEffect(() => {
    const sheet = canvasRef.current, canvas = sampleCanvas.current;
    if (!sheet || !canvas || !doc || !isFont) return;
    const columns = Math.max(1, Math.floor(doc.width / 8)), perLine = 40;
    const lines = sampleText.match(new RegExp(`.{1,${perLine}}(\\s|$)|.{1,${perLine}}`, "g")) ?? [""];
    canvas.width = perLine * 8;
    canvas.height = Math.max(1, lines.length) * 8;
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    lines.forEach((line, row) => {
      [...line.trimEnd()].forEach((char, column) => {
        const index = char.charCodeAt(0) - 32;
        if (index < 0 || index >= columns * Math.floor(doc.height / 8)) return;
        context.drawImage(sheet, (index % columns) * 8, Math.floor(index / columns) * 8, 8, 8, column * 8, row * 8, 8, 8);
      });
    });
  });

  // The picture is redrawn after every render: the pixels change in place, and `bump` is what announces it.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    if (canvas.width !== doc.width || canvas.height !== doc.height) Object.assign(canvas, { width: doc.width, height: doc.height });
    let pixels = doc.pixels;
    if (doc.float) {
      pixels = pixels.slice();
      drop(pixels, doc.width, doc.height, doc.float);
    }
    const image = new ImageData(doc.width, doc.height);
    colorize(pixels, doc.cells, doc.width, luts, new Uint32Array(image.data.buffer));
    canvas.getContext("2d")!.putImageData(image, 0, 0);
  });

  async function onDrop(event: React.DragEvent) {
    event.preventDefault();
    // Handles must be asked for before the first await: the drop's items are gone after it.
    const items = [...event.dataTransfer.items].filter((item) => item.kind === "file").map((item) => ({
      file: item.getAsFile(),
      handle: (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileHandle | null> }).getAsFileSystemHandle?.().catch(() => null),
    }));
    const files: { file: File; handle?: FileHandle }[] = [];
    for (const { file, handle } of items) if (file) files.push({ file, handle: await handle ?? undefined });
    await openFiles(files);
  }

  const hint = TOOLS.find(([id]) => id === tool)!;
  const gridLines = doc && grid && grid * doc.zoom >= 3 ? `${grid * doc.zoom}px` : null;
  const matches = (name: string, filter: string) => !filter.trim() || name.toLowerCase().includes(filter.trim().toLowerCase());
  const shownAssets = project ? project.assets.filter((asset) => asset.kind === projectKind && matches(asset.name, projectFilter)) : [];
  const kindLabel = ASSET_KINDS.find(([kind]) => kind === projectKind)?.[1] ?? "";
  // A project background or sprite sheet carries its eight palette slots: shown as a strip, and first in the list.
  const sceneSlots = doc?.asset?.slots ?? [];
  const slotOf = (palette: Palette) => palette.id ? sceneSlots.indexOf(palette.id) : -1;
  const slotPalettes = sceneSlots.map((id) => docPalettes.findIndex((palette) => palette.id === id));
  const slotNames = slotPalettes.map((index) => index >= 0 ? docPalettes[index].name : undefined);
  const paletteList = [{ name: "None (GB greens)", colors: [...GB_SHADES] } as Palette, ...docPalettes].map((palette, index) => {
    const slot = index ? slotOf(palette) : -1;
    return { palette, index, slot, named: index && slot < 0 && namedSlots && sceneSlots.length ? namedSlot(palette.name, slotNames) : -1 };
  });
  const slotWhere = doc?.asset?.slotScene ? `${doc.asset.slotScene}'s palettes` : doc?.asset?.kind === "sprites" ? "the project's default sprite palettes (every scene without its own)" : "the project's default background palettes (every scene without its own)";
  const openSlotMenu = (event: ReactMouseEvent, palette: number) => { if (!sceneSlots.length || !palette) return; event.preventDefault(); setSlotMenu({ x: event.clientX, y: event.clientY, palette }); };
  const shownPalettes = paletteList
    .filter(({ palette, index }) => index === activePalette || matches(palette.name, paletteFilter))
    .sort((a, b) => (a.index === 0 ? -1 : b.index === 0 ? 1 : a.slot >= 0 && b.slot >= 0 ? a.slot - b.slot : a.slot >= 0 ? -1 : b.slot >= 0 ? 1 : a.index - b.index));
  const pickPalette = (index: number) => { setActivePalette(index); if (index && tool !== "palette") setTool("palette"); };
  const paletteHelp = doc?.asset?.kind === "tilesets" && sceneSlots.length ? "Each 8 × 8 tile wears one of the project's eight default background palettes. Save writes the tileset in the GB greens and each tile's palette into GB Studio as its slot. None leaves a tile's slot as it is." : doc?.asset?.kind === "sprites" && sceneSlots.length ? "Each 8 × 16 sprite tile wears one of the scene's eight sprite palettes; a palette's colors 1–3 dress the shades and color 0 is see-through. Save writes the sheet in the GB greens and each tile's palette as its slot." : doc?.asset?.kind === "backgrounds" && sceneSlots.length ? "Each 8 × 8 tile wears one of the scene's eight palettes. Save writes the picture in the GB greens and each tile's palette into GB Studio as its slot. None leaves a tile's slot as it is." : "Each 8 × 8 tile wears one palette, or none. Palettes are only for looking here: saving always writes the GB greens.";

  return (
    <div className="gbp-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => void onDrop(event)}>
      <header className="gbp-bar">
        <button className="gbp-brand" aria-haspopup="menu" title={served ? "Projects: open, switch or close" : "GB Cartographer"} onClick={(event) => { if (!served) return; const r = event.currentTarget.getBoundingClientRect(); setProjectMenu({ x: r.left, y: r.bottom + 6 }); }}><LogoMark size={22} /><b>GB Cartographer</b><span className="gbp-alpha" title="Alpha release: expect bugs, and keep your GB Studio project backed up">Alpha</span>{served && <ChevronDown size={14} />}</button>
        <span className="gbp-seg" role="group" aria-label="File">
          <button className="quiet-button" title="Open PNG files · Ctrl+O (or drop them on the window)" onClick={() => void pickFiles()}><FolderOpen size={14} />Open</button>
          <button className="quiet-button" disabled={!doc} title={`Save every changed picture · Ctrl+S${doc?.asset ? ` (this one over ${doc.asset.file} in the project; old files go to the backups folder)` : doc?.handle ? ` (this one over ${doc.name})` : " (this one asks where)"}`} onClick={() => void save(false)}><Save size={14} />Save</button>
          <button className="quiet-button" disabled={!doc} title="Export a copy, in the GB greens · Ctrl+E" onClick={() => void save(true)}><Download size={14} />Export</button>
        </span>
        <span className="gbp-seg" role="group" aria-label="Project and palettes">
          {project && <button className={`quiet-button ${showProject ? "active-tool" : ""}`} aria-pressed={showProject} title={`Show or hide the project's pictures (${project.path})`} onClick={() => setShowProject(!showProject)}><FolderTree size={14} />Project</button>}
          {served && !project && <button className="quiet-button" title="Open a GB Studio project folder: its backgrounds, sprites, tilesets and fonts open here and save back into it" onClick={() => void chooseProject()}><FolderTree size={14} />Open project…</button>}
          <button className="quiet-button" title="Palette manager: the project's palettes, a library, and your own" onClick={() => setShowPalettes(true)}><PaletteIcon size={14} />Palettes</button>
        </span>
        <button className="icon-button" aria-label="Undo" title="Undo · Ctrl+Z" disabled={!doc?.undo.length} onClick={() => stepHistory("undo")}><Undo2 size={15} /></button>
        <button className="icon-button" aria-label="Redo" title="Redo · Ctrl+Shift+Z" disabled={!doc?.redo.length} onClick={() => stepHistory("redo")}><Redo2 size={15} /></button>
        <span className="gbp-spacer" />
        {doc && (
          <label className={`gbp-tiles ${tileCount > budget.limit ? "over" : ""}`} title={`Unique 8 × 8 tiles in this picture, as GB Studio counts them (${budget.flips ? "identical and flipped tiles merge" : "identical tiles merge"}). The budget follows the scene's color mode (Picture tab).`}>
            <span>TILES</span>
            <span className="gbp-tiles-track" aria-hidden="true"><b style={{ width: `${Math.min(1, tileCount / budget.limit) * 100}%` }} /></span>
            <span className="gbp-tiles-count">{tileCount}/{budget.limit}</span>
          </label>
        )}
        <span className="gbp-seg gbp-zoom" role="group" aria-label="Zoom">
          <button className="icon-button small" aria-label="Zoom out" disabled={!doc} onClick={() => zoomBy(-1)}><Minus size={12} /></button>
          <b>{doc ? `${doc.zoom * 100}%` : "–"}</b>
          <button className="icon-button small" aria-label="Zoom in" disabled={!doc} onClick={() => zoomBy(1)}><Plus size={12} /></button>
        </span>
        <button className={`icon-button ${grid ? "active-tool" : ""}`} aria-label="Tile grid" title={`Tile grid: ${grid ? `${grid} px` : "off"} (click for off / 8 px / 16 px)`} onClick={() => setGrid(grid === 0 ? 8 : grid === 8 ? 16 : 0)}><Grid3x3 size={15} />{grid > 0 && <small>{grid}</small>}</button>
        <button className={`icon-button ${snap ? "active-tool" : ""}`} aria-label="Snap selections to tiles" aria-pressed={snap} title="Snap selections and moves to 8 px tiles" onClick={() => setSnap(!snap)}><Magnet size={15} /></button>
        <button className={`icon-button ${showHelp ? "active-tool" : ""}`} aria-label="Help" title="Tools, keys and what Save writes · ?" onClick={() => setShowHelp(!showHelp)}><CircleHelp size={15} /></button>
      </header>
      <div className="map-tabs" role="tablist" aria-label="Open pictures">
        {docs.current.map((item) => (
          <div key={item.id} role="tab" aria-selected={item.id === activeId} className={`map-tab ${item.id === activeId ? "active" : ""}`} title={`${item.name} · ${item.width} × ${item.height} px`} onClick={() => setActiveId(item.id)}>
            <span className={item.dirty ? "gbp-unsaved" : ""}>{item.name}{item.dirty ? " *" : ""}</span>
            <button aria-label={`Close ${item.name}`} onClick={(event) => { event.stopPropagation(); closeDoc(item); }}><X size={12} /></button>
          </div>
        ))}
        <button className="map-tab-add" aria-label="Open PNG files" title="Open PNG files" onClick={() => void pickFiles()}>+</button>
      </div>
      <div className="gbp-body">
        {project && showProject && (
          <>
            <nav className="gbp-rail" aria-label="Asset folders">
              {ASSET_KINDS.map(([kind, label]) => { const Icon = KIND_ICONS[kind]; const count = project.assets.filter((asset) => asset.kind === kind).length; return <button key={kind} className={`icon-button ${projectKind === kind ? "active-tool" : ""}`} aria-pressed={projectKind === kind} aria-label={`${label} (${count})`} title={`${label} · ${count}`} onClick={() => setProjectKind(kind)}><Icon size={16} /><b>{count}</b></button>; })}
            </nav>
            <aside className="gbp-project" aria-label="GB Studio project">
              <h2 title={project.path}><span className="gbp-project-name">{project.name}</span></h2>
              <input type="search" className="gbp-filter" placeholder={`Filter ${kindLabel.toLowerCase()}`} aria-label={`Filter ${kindLabel.toLowerCase()} by name`} value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} />
              <div className="gbp-assets" role="list">
                {shownAssets.map((asset) => {
                  const openDoc = docs.current.find((item) => item.asset?.kind === asset.kind && item.asset.file === asset.file);
                  return (
                    <button key={asset.file} role="listitem" onContextMenu={(event) => { event.preventDefault(); setAssetMenu({ x: event.clientX, y: event.clientY, asset }); }} className={`gbp-asset ${openDoc && openDoc.id === activeId ? "selected" : openDoc ? "open" : ""}`} title={`${asset.file} · ${asset.width} × ${asset.height} px${openDoc ? " · open" : ""}`} onClick={() => void openAsset(asset)}>
                      <img className="gbp-asset-thumb" loading="lazy" decoding="async" alt="" src={`${ASSET_URL}-preview?${assetQuery(asset)}&v=${Math.round(asset.mtime)}&pv=${PREVIEW_VERSION}&s=${slotsVersion}`} />
                      <span className="gbp-asset-meta"><span className={`gbp-asset-name ${openDoc?.dirty ? "gbp-unsaved" : ""}`}>{asset.name}{openDoc?.dirty ? " *" : ""}</span><span className="gbp-asset-size">{asset.width}×{asset.height}</span></span>
                    </button>
                  );
                })}
                {shownAssets.length === 0 && <p className="gbp-note">No {projectKind} match.</p>}
              </div>
            </aside>
          </>
        )}
        <aside className="gbp-tools pixel-toolbar vertical" role="toolbar" aria-label="Paint tools">
          {TOOLS.map(([id, label, Icon, keys]) => <button key={id} className={`tool-button ${tool === id ? "active" : ""}`} aria-label={label} aria-pressed={tool === id} title={`${label} · ${keys}`} onClick={() => setTool(id)}><Icon size={17} /></button>)}
          <button className={`tool-button ${mirror !== "off" ? "active" : ""}`} aria-label={MIRROR_LABEL[mirror]} title={`${MIRROR_LABEL[mirror]}: paint both halves at once · Shift+M`} onClick={() => setMirror(MIRRORS[(MIRRORS.indexOf(mirror) + 1) % MIRRORS.length])}><FlipHorizontal2 size={17} /></button>
          {tool === "palette" ? (
            <span className="gbp-brush" role="group" aria-label="Palette brush size" title="Palette brush: 1, 2 × 2 or 3 × 3 tiles · [ smaller, ] bigger">
              <button className="tool-button" aria-label="Smaller palette brush" disabled={cellBrush <= 1} onClick={() => setCellBrush(cellBrush - 1)}><Minus size={12} /></button>
              <b>{cellBrush}×{cellBrush}</b>
              <button className="tool-button" aria-label="Bigger palette brush" disabled={cellBrush >= 3} onClick={() => setCellBrush(cellBrush + 1)}><Plus size={12} /></button>
            </span>
          ) : (
            <span className="gbp-brush" role="group" aria-label="Brush size" title="Brush size · [ smaller, ] bigger">
              <button className="tool-button" aria-label="Smaller brush" disabled={brush <= 1} onClick={() => setBrush(brush - 1)}><Minus size={12} /></button>
              <b>{brush}</b>
              <button className="tool-button" aria-label="Bigger brush" disabled={brush >= 16} onClick={() => setBrush(brush + 1)}><Plus size={12} /></button>
            </span>
          )}
        </aside>
        <div className="gbp-scroller" ref={scrollerRef}>
          {doc && frames.length > 0 && (
            <div className="gbp-frames" role="group" aria-label="Frames">
              {animations.length > 1 && (
                <select aria-label="Animation" value={frame.animation} onChange={(event) => setFrame({ animation: Number(event.target.value), index: 0 })}>
                  {animations.map((item, index) => <option key={index} value={index}>{item.name} · {item.frames.length}</option>)}
                </select>
              )}
              <button className="icon-button small" aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play the animation (8 frames a second)"} disabled={frames.length < 2} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={12} /> : <Play size={12} />}</button>
              <div className="gbp-frames-list">
                {frames.map((_, index) => (
                  <button key={index} className={`gbp-frame ${index === frame.index ? "selected" : ""}`} title={`Frame ${index + 1}`} onClick={() => { setFrame({ ...frame, index }); setPlaying(false); }}>
                    <canvas ref={(element) => { frameCanvases.current[index] = element; }} />
                    <small>{index + 1}</small>
                  </button>
                ))}
              </div>
              <span className="gbp-frames-label">{animations.length > 1 ? animation.name : "frame"} {frame.index + 1} of {frames.length}</span>
            </div>
          )}
          {doc && isFont && (
            <div className="gbp-frames gbp-sample" role="group" aria-label="Font sample">
              <input type="text" aria-label="Sample text" value={sampleText} onChange={(event) => setSampleText(event.target.value)} spellCheck={false} />
              <canvas ref={sampleCanvas} className="gbp-sample-canvas" />
            </div>
          )}
          {doc ? (
            <div className={`gbp-stage ${tool === "hand" ? "pan" : ""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onContextMenu={(event) => event.preventDefault()}>
              <div className="gbp-wrap" ref={wrapRef} style={{ width: doc.width * doc.zoom, height: doc.height * doc.zoom }}>
                <canvas ref={canvasRef} />
                {gridLines && <div className="gbp-grid" style={{ backgroundSize: `${gridLines} ${gridLines}` }} />}
                {current && current.tiles.map((tile, index) => <div key={index} className="gbp-frame-slice" style={{ left: tile.sliceX * doc.zoom, top: tile.sliceY * doc.zoom, width: 8 * doc.zoom, height: 16 * doc.zoom }} />)}
                {doc.sel && <div className={`gbp-selection ${doc.float ? "floating" : ""}`} style={{ left: doc.sel.x * doc.zoom, top: doc.sel.y * doc.zoom, width: doc.sel.w * doc.zoom, height: doc.sel.h * doc.zoom }} />}
                <div className="gbp-brush-outline" ref={brushRef} />
              </div>
            </div>
          ) : served && !project ? (
            <div className="gbp-start">
              <img className="gbp-start-icon" src={`${import.meta.env.BASE_URL}app-icon.png`} alt="" width={96} height={96} />
              <h1>GB Cartographer</h1>
              <p className="gbp-start-sub">A pixel painter for GB Studio projects <span className="gbp-alpha">Alpha</span></p>
              <p className="gbp-start-alpha">This is an alpha release: expect bugs. Save writes into your GB Studio project, so keep it backed up and close GB Studio while you work.</p>
              <div className="gbp-start-cards">
                <button className="gbp-start-card primary" onClick={() => void chooseProject()}><span className="gbp-start-ic"><FolderTree size={18} /></span><b>Open a GB Studio project</b><span>The folder with the .gbsproj file. Backgrounds, sprites, tilesets and fonts open here and save back.</span></button>
                <button className="gbp-start-card" onClick={() => void chooseProject(true)}><span className="gbp-start-ic"><Star size={18} /></span><b>Try the demo</b><span>A small project with CC0 and MIT art, credited inside. Opens a copy you can paint in.</span></button>
                <button className="gbp-start-card" onClick={() => void pickFiles()}><span className="gbp-start-ic"><FolderOpen size={18} /></span><b>Open PNG files</b><span>Any Game Boy picture on its own. Drop files anywhere, or paste from the clipboard.</span><kbd>Ctrl+O</kbd></button>
              </div>
              {recent.length > 0 && (
                <div className="gbp-start-recent">
                  <span className="eyebrow">Recent</span>
                  {recent.map((item) => <button key={item.path} className="gbp-start-row" title={item.path} onClick={() => void openProjectPath(item.path)}><b>{item.name}</b><small>{item.path}</small></button>)}
                </div>
              )}
              <p className="gbp-start-foot">Save writes only the PNG, a background's tile palettes, a sprite's slice palettes and palette files into your project. The old file is kept in the backups folder.</p>
            </div>
          ) : (
            <div className="gbp-empty">
              <LogoMark size={56} />
              <p>{project ? `Pick a picture of ${project.name} on the left, drop PNG files here, or` : "Drop PNG files here, or"}</p>
              <button className="quiet-button" onClick={() => void pickFiles()}><FolderOpen size={14} />Open PNG files</button>
            </div>
          )}
        </div>
        <aside className="gbp-side">
          <div className="gbp-side-shades">
            <div className="pixel-swatches">
              {swatchColors.slice(0, 4).map((color, index) => (
                <button key={index} className={shade === index ? "selected" : ""} style={{ background: color }} aria-label={`Shade ${index + 1}`} title={`Shade ${index + 1} · ${index + 1} · click again to change this color${picked ? ` of ${picked.name}` : " of the tint"}`} onClick={() => { if (shade === index) shadeInputs.current[index]?.click(); else { setShade(index); if (tool === "eyedropper") setToolState(paintTool.current); } }}>
                  <kbd>{index + 1}</kbd>
                  <input type="color" tabIndex={-1} aria-label={`Change color ${index + 1}`} ref={(element) => { shadeInputs.current[index] = element; }} value={normalizeHex(color)} onClick={(event) => event.stopPropagation()} onChange={(event) => changeShadeColor(index, event.target.value.toUpperCase())} />
                </button>
              ))}
            </div>
            {doc?.hasAlpha && <button className={`transparent-swatch ${shade === CLEAR ? "selected" : ""}`} title="See-through · 0" onClick={() => setShade(CLEAR)}><kbd>0</kbd>Transparent</button>}
          </div>
          <div className="gbp-side-tabs" role="tablist" aria-label="Inspector">
            <button role="tab" aria-selected={sideTab === "palettes"} className={sideTab === "palettes" ? "selected" : ""} onClick={() => setSideTab("palettes")}>Palettes</button>
            <button role="tab" aria-selected={sideTab === "picture"} className={sideTab === "picture" ? "selected" : ""} onClick={() => setSideTab("picture")}>Picture</button>
          </div>
          {sideTab === "palettes" ? (
            <div className="gbp-side-pane">
              {sceneSlots.length > 0 && (
                <div className="gbp-slots" role="group" aria-label={doc?.asset?.kind === "sprites" ? "Sprite palette slots" : "The scene's palette slots"}>
                  {slotPalettes.map((paletteIndex, slot) => {
                    const palette = paletteIndex >= 0 ? docPalettes[paletteIndex] : null;
                    return (
                      <button key={slot} className={`gbp-slot-button ${palette && activePalette === paletteIndex + 1 ? "selected" : ""}`} disabled={!palette} title={palette ? `Slot ${slot + 1} · ${palette.name}` : `Slot ${slot + 1}: no palette`} onClick={() => palette && pickPalette(paletteIndex + 1)} onContextMenu={(event) => openSlotMenu(event, paletteIndex + 1)}>
                        <b>{slot + 1}</b>
                        <span className="gbp-chips">{(palette?.colors ?? ["#222", "#222", "#222", "#222"]).map((color, at) => <i key={at} style={{ background: color }} />)}</span>
                        <span className="gbp-slot-name">{palette?.name ?? "—"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {sceneSlots.length > 0 && (
                <label className="gbp-check" title="Palettes named like DWC-2-Computer D (a D / N / S variant) save as their base palette's slot, or the number in the name (WIN-1-Snow saves as slot 1)">
                  <input type="checkbox" checked={namedSlots} onChange={(event) => { setNamedSlots(event.target.checked); store(NAMED_SLOTS_KEY, event.target.checked); }} />
                  Named slots: variants save as their base's
                </label>
              )}
              <div className="gbp-side-row">
                <input type="search" className="gbp-filter" placeholder="Filter palettes" aria-label="Filter palettes by name" value={paletteFilter} onChange={(event) => setPaletteFilter(event.target.value)} />
                <HelpTip label="About the palette brush">{paletteHelp}</HelpTip>
              </div>
              <div className="gbp-palettes" role="listbox" aria-label="Palettes">
                {shownPalettes.map(({ palette, index, slot, named }) => (
                  <button key={`${index}-${palette.name}`} role="option" aria-selected={activePalette === index} className={activePalette === index ? "selected" : ""} title={index && sceneSlots.length ? "Right-click: put in a slot" : undefined} onClick={() => pickPalette(index)} onContextMenu={(event) => openSlotMenu(event, index)}>
                    <span className="gbp-chips">{palette.colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>
                    <span>{palette.name}</span>
                    {slot >= 0 && <small className="gbp-slot" title={doc?.asset?.kind === "sprites" ? `Sprite palette slot ${slot + 1}` : `Palette slot ${slot + 1} of this background's scene`}>{slot + 1}</small>}
                    {named >= 0 && <small className="gbp-slot named" title={`Saves as slot ${named + 1} (named slots)`}>{named + 1}</small>}
                  </button>
                ))}
              </div>
              {doc && picked && (
                <div className="gbp-palette-edit">
                  <h2>{picked.name} in this picture</h2>
                  <div className="gbp-palette-colors">
                    {picked.colors.map((color, index) => <input key={index} type="color" aria-label={`${picked.name} color ${index + 1}`} title={`Color ${index + 1}: ${color}`} value={color} onChange={(event) => recolorPalette(picked.colors.map((old, at) => at === index ? event.target.value : old))} />)}
                  </div>
                  <div className="gbp-palette-actions">
                    {picked.id && project && <button className="quiet-button primary" disabled={!libraryColors || libraryColors.join() === picked.colors.join()} title={`Rewrite ${picked.name} in the GB Studio project with these colors (Save does this too)`} onClick={() => void (async () => { if (await okToWriteProjectJson() && await writeProjectPalette({ id: picked.id, name: picked.name, colors: [...picked.colors] })) say(`${picked.name} written to the project`); })()}>Save to project</button>}
                    {sceneSlots.length > 0 && <button className="quiet-button" title={`Put ${picked.name} in one of ${slotWhere}`} onClick={(event) => { const r = event.currentTarget.getBoundingClientRect(); setSlotMenu({ x: r.left, y: r.bottom + 4, palette: activePalette }); }}>Slot…</button>}
                    <button className="quiet-button" disabled={!libraryColors || libraryColors.join() === picked.colors.join()} title="Back to the colors the project has" onClick={() => libraryColors && recolorPalette(libraryColors)}>Revert</button>
                    <button className="quiet-button" title="Copy these four colors, to paste onto a palette here or in another tab" onClick={() => { setCopiedColors([...picked.colors]); say(`Copied the colors of ${picked.name}`); }}>Copy values</button>
                    <button className="quiet-button" disabled={!copiedColors} title="Replace these four colors with the copied ones" onClick={() => copiedColors && recolorPalette(copiedColors)}>Paste values</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="gbp-side-pane gbp-picture">
              {doc ? (
                <dl>
                  <dt>Picture</dt><dd>{doc.name}</dd>
                  <dt>Size</dt><dd>{doc.width} × {doc.height} px · {Math.ceil(doc.width / CELL)} × {Math.ceil(doc.height / CELL)} tiles</dd>
                  {doc.asset && <><dt>File</dt><dd>assets/{doc.asset.kind}/{doc.asset.file}</dd></>}
                  <dt>Unique tiles</dt><dd>{tileCount} of {budget.limit}</dd>
                </dl>
              ) : <p className="gbp-note">No picture open.</p>}
              <label className="gbp-field">Tile budget
                <select aria-label="Tile budget" value={budget.id} onChange={(event) => setBudgetId(event.target.value)}>
                  {BUDGETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="gbp-field" title="Preview colors for tiles without a palette. Saving always writes the GB greens.">Tint
                <select value={tint} onChange={(event) => setTint(event.target.value)}>
                  {BUILT_IN_TINTS.map(({ name }) => <option key={name}>{name}</option>)}
                  {palettes.length > 0 && <optgroup label="Palettes">{palettes.map(({ name }) => <option key={name}>{name}</option>)}</optgroup>}
                  <option>Custom</option>
                </select>
              </label>
              {tint === "Custom" && <div className="gbp-palette-colors">{customTint.map((color, index) => <input key={index} type="color" aria-label={`Tint shade ${index + 1}`} value={color} onChange={(event) => setCustomTint(customTint.map((old, at) => at === index ? event.target.value.toUpperCase() : old))} />)}</div>}
              <label className="gbp-field">Font
                <select value={font} onChange={(event) => { const next = event.target.value as FontChoice; setFont(next); applyFont(next); }}>
                  {FONTS.map((item) => <option key={item.id} value={item.id} title={item.title}>{item.label}</option>)}
                </select>
              </label>
            </div>
          )}
        </aside>
      </div>
      <footer className="gbp-status">
        <span className="gbp-status-hint"><b>{hint[1]}</b> · {hint[4]}</span>
        <span ref={readoutRef} className="gbp-readout" />
        <span className="gbp-spacer" />
        {doc?.sel && <span>sel {doc.sel.w} × {doc.sel.h} at {doc.sel.x}, {doc.sel.y}</span>}
        {doc && <span title={doc.asset ? `assets/${doc.asset.kind}/${doc.asset.file}` : doc.name}>{doc.width} × {doc.height} · {doc.width / CELL} × {doc.height / CELL} tiles</span>}
      </footer>
      {toast && <div className="gbp-toast" role="status">{toast}</div>}
      {projectMenu && (
        <div className="gbp-menu-backdrop" onMouseDown={() => setProjectMenu(null)} onContextMenu={(event) => { event.preventDefault(); setProjectMenu(null); }}>
          <div className="gbp-menu" role="menu" style={{ left: Math.min(projectMenu.x, window.innerWidth - 260), top: Math.max(8, Math.min(projectMenu.y, window.innerHeight - 260)) }} onMouseDown={(event) => event.stopPropagation()}>
            <button role="menuitem" onClick={() => { setProjectMenu(null); void chooseProject(); }}>Open another project…</button>
            <button role="menuitem" onClick={() => { setProjectMenu(null); void chooseProject(true); }}>Open the demo project</button>
            {recent.filter((item) => item.path !== project?.path).length > 0 && <><hr /><span className="gbp-menu-label">Recent</span></>}
            {recent.filter((item) => item.path !== project?.path).slice(0, 5).map((item) => <button key={item.path} role="menuitem" title={item.path} onClick={() => { setProjectMenu(null); void openProjectPath(item.path); }}>{item.name}</button>)}
            {project && <>
              <hr />
              <button role="menuitem" onClick={() => { setProjectMenu(null); void fetch("./__cartographer/reveal", { method: "POST" }); }}>{FILE_MANAGER_LABEL}</button>
              <button role="menuitem" onClick={() => { setProjectMenu(null); setBackups({}); }}>Backups…</button>
              <button role="menuitem" onClick={() => { setProjectMenu(null); void fetch("./__cartographer/reveal?backups=1", { method: "POST" }); }}>Show backups folder</button>
              <hr />
              <button role="menuitem" onClick={() => { setProjectMenu(null); void closeProject(); }}>Close project</button>
            </>}
          </div>
        </div>
      )}
      {slotMenu && doc && docPalettes[slotMenu.palette - 1] && (
        <div className="gbp-menu-backdrop" onMouseDown={() => setSlotMenu(null)} onContextMenu={(event) => { event.preventDefault(); setSlotMenu(null); }}>
          <div className="gbp-menu gbp-slot-menu" role="menu" style={{ left: Math.min(slotMenu.x, window.innerWidth - 300), top: Math.max(8, Math.min(slotMenu.y, window.innerHeight - 450)) }} onMouseDown={(event) => event.stopPropagation()}>
            <span className="gbp-menu-label">Put {docPalettes[slotMenu.palette - 1].name} in slot</span>
            {slotPalettes.map((index, slot) => {
              const holder = index >= 0 ? docPalettes[index] : null;
              const here = index === slotMenu.palette - 1;
              return (
                <button key={slot} role="menuitem" disabled={here || !docPalettes[slotMenu.palette - 1].id} onClick={() => { const palette = slotMenu.palette; setSlotMenu(null); void putInSlot(palette, slot); }}>
                  <b>{slot + 1}</b>
                  <span className="gbp-chips">{(holder?.colors ?? ["#222", "#222", "#222", "#222"]).map((color, at) => <i key={at} style={{ background: color }} />)}</span>
                  <span>{holder?.name ?? "—"}{here ? " (here)" : ""}{slot === UI_SLOT && doc.asset?.kind !== "sprites" ? <small className="gbp-menu-tag" title="GB Studio draws dialogue boxes and menus with slot 8">UI</small> : null}</span>
                </button>
              );
            })}
            <hr />
            <p className="gbp-menu-note">{docPalettes[slotMenu.palette - 1].id ? `Writes ${slotWhere} in GB Studio right away. Tiles wearing the palette moved out show the new one there.` : "Add this palette to the project first (palette manager)."}</p>
          </div>
        </div>
      )}
      {assetMenu && (
        <div className="gbp-menu-backdrop" onMouseDown={() => setAssetMenu(null)} onContextMenu={(event) => { event.preventDefault(); setAssetMenu(null); }}>
          <div className="gbp-menu" role="menu" style={{ left: Math.min(assetMenu.x, window.innerWidth - 220), top: Math.min(assetMenu.y, window.innerHeight - 130) }} onMouseDown={(event) => event.stopPropagation()}>
            <button role="menuitem" onClick={() => { void openAsset(assetMenu.asset); setAssetMenu(null); }}>Open</button>
            <button role="menuitem" onClick={() => { void fetch(`./__cartographer/reveal?${assetQuery(assetMenu.asset)}`, { method: "POST" }); setAssetMenu(null); }}>{FILE_MANAGER_LABEL}</button>
            <button role="menuitem" onClick={() => { void navigator.clipboard?.writeText(`${project?.path ?? ""}/assets/${assetMenu.asset.kind}/${assetMenu.asset.file}`).then(() => say("Copied the file path")); setAssetMenu(null); }}>Copy file path</button>
            <button role="menuitem" onClick={() => { setBackups({ file: `assets/${assetMenu.asset.kind}/${assetMenu.asset.file}` }); setAssetMenu(null); }}>Earlier versions…</button>
            <hr />
            <button role="menuitem" onClick={() => { void fetch("./__cartographer/reveal", { method: "POST" }); setAssetMenu(null); }}>Show project folder</button>
          </div>
        </div>
      )}
      {showHelp && (
        <div className="gbp-modal-backdrop" onClick={() => setShowHelp(false)}>
          <div className="gbp-modal gbp-help" role="dialog" aria-label="Help" onClick={(event) => event.stopPropagation()}>
            <header className="gbp-modal-head"><h2>Tools and keys</h2><span className="gbp-spacer" /><button className="icon-button small" aria-label="Close" onClick={() => setShowHelp(false)}><X size={14} /></button></header>
            <div className="gbp-help-body">
              <table>
                <tbody>
                  {TOOLS.map(([id, label, Icon, keys, , long]) => <tr key={id}><td><Icon size={14} /></td><td><b>{label}</b></td><td><kbd>{keys}</kbd></td><td>{long}</td></tr>)}
                  <tr><td /><td><b>Mirror</b></td><td><kbd>Shift+M</kbd></td><td>Paint both halves at once: off, left-right, top-bottom, both.</td></tr>
                  <tr><td /><td><b>Shades</b></td><td><kbd>1–4</kbd> <kbd>0</kbd></td><td>Pick a shade; 0 is see-through in a picture that has it.</td></tr>
                  <tr><td /><td><b>Brush</b></td><td><kbd>[</kbd> <kbd>]</kbd></td><td>Smaller or bigger: pixels, or tiles with the palette brush.</td></tr>
                  <tr><td /><td><b>Files</b></td><td><kbd>Ctrl+O</kbd> <kbd>Ctrl+S</kbd> <kbd>Ctrl+E</kbd></td><td>Open PNGs, save, export a copy. Ctrl+Z / Ctrl+Shift+Z undo and redo; Ctrl+C / X / V and Ctrl+A work on the selection; Ctrl+= / Ctrl+- zoom; Esc drops the selection.</td></tr>
                </tbody>
              </table>
              <p className="gbp-note">What Save writes into a GB Studio project: the PNG (same size), a background's tile palettes (<code>tileColors</code>), a sprite sheet's slice palettes (<code>paletteIndex</code>), palette files from the palette manager, and when you put a palette in a slot, the scene's palette list or the project's default palettes. Nothing else. The old file is copied to the backups folder first.</p>
            </div>
          </div>
        </div>
      )}
      {backups && project && (
        <BackupsWindow projectName={project.name} initialFile={backups.file} onClose={() => setBackups(null)} onRestore={restoreFromBackup} />
      )}
      {showPalettes && (
        <PaletteManager
          projectName={project?.name ?? null}
          projectPalettes={project?.palettes ?? []}
          sceneSlots={sceneSlots}
          picture={doc ? { pixels: (() => { const flat = doc.pixels.slice(); if (doc.float) drop(flat, doc.width, doc.height, doc.float); return flat; })(), width: doc.width, height: doc.height, sprite: Boolean(doc.keyGreen) } : null}
          onClose={() => setShowPalettes(false)}
          onWriteProject={writeProjectPalette}
          onPick={(id) => { const index = docPalettes.findIndex((item) => item.id === id); if (index >= 0) { setActivePalette(index + 1); setTool("palette"); } }}
        />
      )}
    </div>
  );
}
