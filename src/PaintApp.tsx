/**
 * GB Cartographer: a small painter for GB Studio pictures (backgrounds, sprite sheets, tilesets) and any Game Boy PNG.
 * Each open file is one flat picture in the four GB shades; tiles (8 × 8) may wear a palette from the project.
 * A tint only changes how the plain tiles look while painting. Saving writes one flat PNG, and for a project
 * picture also its tile palettes (see server/endpoints.ts).
 */
import { BoxSelect, Circle, Download, DropletOff, Eraser, FlipHorizontal2, FolderOpen, FolderTree, Grid3x3, Hand, Magnet, Minus, Move, PaintBucket, Palette as PaletteIcon, Pencil, Pipette, Plus, RectangleHorizontal, Redo2, Save, Slash, SprayCan, Square, Undo2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { LogoMark } from "./ui/LogoMark";
import { FONTS, THEMES, applyFont, applyTheme, loadFont, loadTheme, type FontChoice, type ThemeChoice } from "./ui/theme";
import PaletteManager from "./PaletteManager";
import { attachMiddlePan, attachWheelZoom, nextStep } from "./ui/wheelZoom";
import { CELL, CLEAR, GB_SHADES, KEY_GREEN, assignSlots, spriteShades, cellsWide, clipRect, colorize, countUniqueTiles, dot, drop, ellipsePoints, fillRect, floodFill, lift, linePoints, mirrorPoints, quantize, rectFrom, shadeLut, snapRect, spray, toRgba, type Floating, type Mirror, type Palette, type Rect } from "./paint";

type ToolId = "pencil" | "eraser" | "spray" | "line" | "rect" | "rectFill" | "ellipse" | "fill" | "fillErase" | "eyedropper" | "palette" | "select" | "move" | "hand";

const TOOLS = [
  ["pencil", "Pencil", Pencil, "B", "Drag to paint. Shift-click draws a straight line from the last point. Right-click picks a shade."],
  ["eraser", "Eraser", Eraser, "E", "Drag to erase to the lightest shade (see-through in a picture that has see-through pixels)."],
  ["spray", "Spray can", SprayCan, "S", "Drag to scatter pixels."],
  ["line", "Line", Slash, "L", "Drag from one end to the other."],
  ["rect", "Rectangle", Square, "R", "Drag a box to outline it."],
  ["rectFill", "Filled rectangle", RectangleHorizontal, "Shift+R", "Drag a box to fill it."],
  ["ellipse", "Ellipse", Circle, "O", "Drag a box; the ellipse fills it."],
  ["fill", "Flood fill", PaintBucket, "G", "Click an area to fill it with the active shade."],
  ["fillErase", "Flood erase", DropletOff, "Shift+G", "Click an area to erase it."],
  ["eyedropper", "Pick", Pipette, "I", "Click a pixel to paint with its shade; with the palette brush, click a tile to paint with its palette."],
  ["palette", "Palette brush", PaletteIcon, "P", "Pick a palette on the right, then drag over tiles to give it to them. Shift-click draws a straight line of tiles; [ ] set the brush to 1, 2 × 2 or 3 × 3 tiles; right-click picks a tile's palette."],
  ["select", "Select", BoxSelect, "M", "Drag a box; drag inside it to move (Alt copies). Arrows nudge, Delete clears, Esc drops it."],
  ["move", "Move", Move, "V", "Drag the selection, or the whole picture when nothing is selected (Alt copies)."],
  ["hand", "Pan", Hand, "H", "Drag to pan. Space or the middle button pans with any tool."],
] as const;

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
/** The dev server and the desktop app serve the open GB Studio project (server/endpoints.ts). */
const PROJECT_URL = "./__cartographer/gbstudio-assets";
const ASSET_URL = "./__cartographer/gbstudio-asset";
const ASSET_KINDS = [["backgrounds", "Backgrounds"], ["sprites", "Sprites"], ["tilesets", "Tilesets"], ["fonts", "Fonts"]] as const;
type AssetKind = typeof ASSET_KINDS[number][0];
/** Backgrounds and sprite sheets carry palette slots GB Studio reads; tilesets and fonts are plain pictures. */
const hasSlots = (kind: AssetKind) => kind === "backgrounds" || kind === "sprites";
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
interface Project { name: string; path: string; assets: Asset[]; palettes: Palette[] }
/** What the server knows about an asset besides its pixels (see assetInfo in scripts/gbstudioAssets.ts). */
interface AssetInfo { mtime: number; tileColors: number[]; slots: string[]; metaMtime: number | null }
/** A picture to open: a file (with a handle to save back to), or a project asset with its info. */
interface Opening { file: File; handle?: FileHandle; asset?: Asset; info?: AssetInfo }

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
  asset?: { kind: AssetKind; file: string; name: string; mtime: number; slots?: string[]; metaMtime?: number | null; /** Each cell's slot when the picture was opened (-1 unknown): only cells moved off it are written back. */ opened?: number[] };
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
function sessionStore<T>(mode: IDBTransactionMode, run: (objects: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open("gb-cartographer", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("session");
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const request = run(open.result.transaction("session", mode).objectStore("session"));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      };
    } catch {
      resolve(null);
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
  const [theme, setTheme] = useState<ThemeChoice>(() => loadTheme());
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
    for (const { file, handle, asset, info } of files) {
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
        last = nextDocId++;
        docs.current.push({ id: last, name: asset?.name ?? file.name, width: bitmap.width, height: bitmap.height, pixels: picture.pixels, cells: picture.cells, hasAlpha: picture.hasAlpha || keyGreen, palettes: picture.palettes, undo: [], redo: [], dirty: false, handle, asset: asset && info ? { kind: asset.kind, file: asset.file, name: asset.name, mtime: info.mtime, ...(hasSlots(asset.kind) ? { slots: info.slots, metaMtime: info.metaMtime, opened: info.tileColors.map((value) => value < 0 ? -1 : value & 7) } : {}) } : undefined, keyGreen: keyGreen || undefined, zoom: fitZoom(bitmap.width, bitmap.height), sel: null, float: null });
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
    const ping = await fetch("./__cartographer/ping", { cache: "no-cache" }).then((response) => asJson<{ ok?: boolean; project?: { path: string } | null }>(response)).catch(() => null);
    setServed(Boolean(ping?.ok));
    const opened = ping?.ok && ping.project ? await fetch(PROJECT_URL, { cache: "no-cache" }).then((response) => asJson<{ ok?: boolean } & Project>(response)).catch(() => null) : null;
    if (opened?.ok) {
      palettesRef.current = opened.palettes.filter((palette) => palette.colors?.length === 4);
      setProject({ name: opened.name, path: opened.path, assets: opened.assets, palettes: opened.palettes });
    } else {
      palettesRef.current = [];
      setProject(null);
    }
    setPalettes(palettesRef.current);
  }

  /** Asks for a GB Studio project folder: the desktop app's folder dialog, or a typed path on the dev server. `demo` opens a copy of the shipped demo instead. */
  async function chooseProject(demo = false) {
    const native = (window as PickerWindow).gbc;
    try {
      if (demo) {
        const response = await fetch("./__cartographer/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demo: true }) });
        const result = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok || !result.ok) return say(result.error ?? response.statusText);
      } else if (native) {
        if (!await native.chooseProject()) return;
      } else {
        const path = window.prompt("Path of the GB Studio project folder (the one with the .gbsproj file):", project?.path ?? "");
        if (!path) return;
        const response = await fetch("./__cartographer/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
        const result = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok || !result.ok) return say(result.error ?? response.statusText);
      }
      palettesReady.current = loadProject();
      await palettesReady.current;
      setShowProject(true);
    } catch (error) {
      say(`Could not open the project: ${(error as Error).message}`);
    }
  }

  /**
   * Writes a palette into the project (new without `id`, else rewritten in place), then rereads the project and
   * passes new colors on to open pictures whose copy of that palette was unchanged. Resolves to the palette's id.
   */
  async function writeProjectPalette(palette: { id?: string; name: string; colors: string[] }): Promise<string | null> {
    try {
      const response = await fetch("./__cartographer/gbstudio-palette", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(palette) });
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

  /** Writes the picture over its GB Studio asset (the server keeps a backup and refuses a file that changed on disk). */
  async function saveAsset(target: Doc, blob: Blob): Promise<boolean> {
    const asset = target.asset!;
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
   * the eight palettes gets that slot; "None" and palettes outside the eight leave the tile's slot as it is. Only
   * cells whose slot differs from the one they were opened with are sent, so a sprite slice that several frames
   * show in different palettes keeps them unless the user paints it.
   */
  async function saveTileColors(target: Doc): Promise<string[]> {
    const asset = target.asset!;
    const slotOf = new Map<number, number>();
    target.palettes.forEach((palette, index) => { const slot = palette.id ? asset.slots!.indexOf(palette.id) : -1; if (slot >= 0) slotOf.set(index + 1, slot); });
    let outside = 0;
    const slots = Array.from(target.cells, (wear, cell) => {
      if (!wear) return null;
      const slot = slotOf.get(wear);
      if (slot === undefined) outside += 1;
      return slot === undefined || slot === asset.opened?.[cell] ? null : slot;
    });
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

  function pngBlob(target: Doc): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    canvas.getContext("2d")!.putImageData(new ImageData(toRgba(target.pixels, target.cells, target.width, [], target.keyGreen ? KEY_GREEN : undefined), target.width, target.height), 0, 0);
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No PNG")), "image/png"));
  }

  /** Writes one flat PNG in the GB greens (palettes and tint are only for looking): over the opened file, or (`copy`, or no file to write to) to a place the user picks. */
  async function save(copy: boolean) {
    if (!doc) return;
    dropFloat(doc);
    bump();
    try {
      const blob = await pngBlob(doc);
      if (!copy && doc.asset) {
        if (await saveAsset(doc, blob)) scheduleSession();
        bump();
        return;
      }
      const picker = (window as PickerWindow).showSaveFilePicker;
      let handle = copy ? undefined : doc.handle;
      if (!handle && picker) handle = await picker.call(window, { suggestedName: doc.name, types: PNG_TYPES });
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        if (!copy || !doc.handle) Object.assign(doc, { handle, name: handle.name, dirty: false });
        say(`Saved ${handle.name}`);
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = doc.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        doc.dirty = false;
        say(`Downloaded ${doc.name}`);
      }
      scheduleSession();
      bump();
    } catch (error) {
      if ((error as Error).name !== "AbortError") say(`Could not save ${doc.name}: ${(error as Error).message}`);
    }
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

  const libraryColors = picked ? palettes.find((palette) => palette.name === picked.name)?.colors : undefined;

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

  useEffect(() => { document.title = doc ? `${doc.dirty ? "• " : ""}${doc.name} · GB Cartographer` : "GB Cartographer"; });
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

  const hint = TOOLS.find(([id]) => id === tool)![4];
  const gridLines = doc && grid && grid * doc.zoom >= 3 ? `${grid * doc.zoom}px` : null;
  const matches = (name: string, filter: string) => !filter.trim() || name.toLowerCase().includes(filter.trim().toLowerCase());
  const shownAssets = project ? project.assets.filter((asset) => asset.kind === projectKind && matches(asset.name, projectFilter)) : [];
  // A project background lists its scene's eight palettes first, each with its slot number.
  const sceneSlots = doc?.asset?.slots ?? [];
  const slotOf = (palette: Palette) => palette.id ? sceneSlots.indexOf(palette.id) : -1;
  const paletteList = [{ name: "None (GB greens)", colors: [...GB_SHADES] } as Palette, ...docPalettes].map((palette, index) => ({ palette, index, slot: index ? slotOf(palette) : -1 }));
  const shownPalettes = paletteList
    .filter(({ palette, index }) => index === activePalette || matches(palette.name, paletteFilter))
    .sort((a, b) => (a.index === 0 ? -1 : b.index === 0 ? 1 : a.slot >= 0 && b.slot >= 0 ? a.slot - b.slot : a.slot >= 0 ? -1 : b.slot >= 0 ? 1 : a.index - b.index));

  return (
    <div className="gbp-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => void onDrop(event)}>
      <header className="gbp-bar">
        <span className="gbp-brand"><LogoMark size={22} /><b>GB Cartographer</b></span>
        <button className="quiet-button" title="Open PNG files · Ctrl+O (or drop them on the window)" onClick={() => void pickFiles()}><FolderOpen size={14} />Open</button>
        {project && <button className={`quiet-button ${showProject ? "active-tool" : ""}`} aria-pressed={showProject} title={`Show or hide the GB Studio project's pictures (${project.path})`} onClick={() => setShowProject(!showProject)}><FolderTree size={14} />Project</button>}
        {served && !project && <button className="quiet-button" title="Open a GB Studio project folder: its backgrounds, sprites, tilesets and fonts open here and save back into it" onClick={() => void chooseProject()}><FolderTree size={14} />Open project…</button>}
        <button className="quiet-button" title="Palette manager: the project's palettes, a library, and your own; edit colors, add palettes to the project" onClick={() => setShowPalettes(true)}><PaletteIcon size={14} />Palettes</button>
        <button className="quiet-button" disabled={!doc} title={doc?.asset ? `Flatten and save over ${doc.asset.file} in the GB Studio project (the old file goes to the backups folder) · Ctrl+S` : doc?.handle ? `Flatten and save over ${doc.name}, in the GB greens · Ctrl+S` : "Flatten and save as a PNG, in the GB greens · Ctrl+S"} onClick={() => void save(false)}><Save size={14} />Save</button>
        <button className="quiet-button" disabled={!doc} title="Flatten and export a copy, in the GB greens · Ctrl+E" onClick={() => void save(true)}><Download size={14} />Export copy</button>
        <button className="icon-button" aria-label="Undo" title="Undo · Ctrl+Z" disabled={!doc?.undo.length} onClick={() => stepHistory("undo")}><Undo2 size={15} /></button>
        <button className="icon-button" aria-label="Redo" title="Redo · Ctrl+Shift+Z" disabled={!doc?.redo.length} onClick={() => stepHistory("redo")}><Redo2 size={15} /></button>
        <span className="gbp-spacer" />
        {doc && (
          <label className={`gbp-tiles ${tileCount > budget.limit ? "over" : ""}`} title={`Unique 8 × 8 tiles in this picture, as GB Studio counts them (${budget.flips ? "identical and flipped tiles merge" : "identical tiles merge"}). Pick the scene's color mode.`}>
            <span>TILES</span>
            <span className="gbp-tiles-track" aria-hidden="true"><b style={{ width: `${Math.min(1, tileCount / budget.limit) * 100}%` }} /></span>
            <span className="gbp-tiles-count">{tileCount}/{budget.limit}</span>
            <select aria-label="Tile budget" value={budget.id} onChange={(event) => setBudgetId(event.target.value)}>
              {BUDGETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        )}
        <button className={`icon-button ${grid ? "active-tool" : ""}`} aria-label="Tile grid" title={`Tile grid: ${grid ? `${grid} px` : "off"} (click for off / 8 px / 16 px)`} onClick={() => setGrid(grid === 0 ? 8 : grid === 8 ? 16 : 0)}><Grid3x3 size={15} />{grid > 0 && <small>{grid}</small>}</button>
        <button className={`icon-button ${snap ? "active-tool" : ""}`} aria-label="Snap selections to tiles" aria-pressed={snap} title="Snap selections and moves to 8 px tiles" onClick={() => setSnap(!snap)}><Magnet size={15} /></button>
        <span className="gbp-zoom" role="group" aria-label="Zoom">
          <button className="icon-button small" aria-label="Zoom out" disabled={!doc} onClick={() => zoomBy(-1)}><Minus size={12} /></button>
          <b>{doc ? `${doc.zoom * 100}%` : "–"}</b>
          <button className="icon-button small" aria-label="Zoom in" disabled={!doc} onClick={() => zoomBy(1)}><Plus size={12} /></button>
        </span>
        <label className="gbp-tint" title="Preview colors for tiles without a palette. Saving always writes the GB greens.">Tint
          <select value={tint} onChange={(event) => setTint(event.target.value)}>
            {BUILT_IN_TINTS.map(({ name }) => <option key={name}>{name}</option>)}
            {palettes.length > 0 && <optgroup label="Palettes">{palettes.map(({ name }) => <option key={name}>{name}</option>)}</optgroup>}
            <option>Custom</option>
          </select>
        </label>
        {tint === "Custom" && customTint.map((color, index) => <input key={index} type="color" className="gbp-tint-color" aria-label={`Tint shade ${index + 1}`} value={color} onChange={(event) => setCustomTint(customTint.map((old, at) => at === index ? event.target.value.toUpperCase() : old))} />)}
        <label className="gbp-tint" title="App theme">Theme
          <select value={theme} onChange={(event) => { const next = event.target.value as ThemeChoice; setTheme(next); applyTheme(next); }}>
            {THEMES.map((item) => <option key={item.id} value={item.id} title={item.title}>{item.label}</option>)}
          </select>
        </label>
        <label className="gbp-tint" title="App font">Font
          <select value={font} onChange={(event) => { const next = event.target.value as FontChoice; setFont(next); applyFont(next); }}>
            {FONTS.map((item) => <option key={item.id} value={item.id} title={item.title}>{item.label}</option>)}
          </select>
        </label>
      </header>
      <div className="map-tabs" role="tablist" aria-label="Open pictures">
        {docs.current.map((item) => (
          <div key={item.id} role="tab" aria-selected={item.id === activeId} className={`map-tab ${item.id === activeId ? "active" : ""}`} title={`${item.name} · ${item.width} × ${item.height} px`} onClick={() => setActiveId(item.id)}>
            <span>{item.dirty ? "• " : ""}{item.name}</span>
            <button aria-label={`Close ${item.name}`} onClick={(event) => { event.stopPropagation(); closeDoc(item); }}><X size={12} /></button>
          </div>
        ))}
        <button className="map-tab-add" aria-label="Open PNG files" title="Open PNG files" onClick={() => void pickFiles()}>+</button>
      </div>
      <div className="gbp-hint">{doc ? hint : project ? `Pick a background, sprite or tileset of ${project.name} on the left, or open PNG files. Save writes the picture back into the project.` : served ? "Open a GB Studio project to paint its backgrounds, sprites and tilesets, or open PNG files. Each picture is one flat sheet in the four GB shades." : "Open one or more Game Boy PNGs to touch them up. Each stays one flat picture."}</div>
      <div className="gbp-body">
        {project && showProject && (
          <aside className="gbp-project" aria-label="GB Studio project">
            <h2 title={project.path}><span className="gbp-project-name">{project.name}</span></h2>
            <div className="gbp-project-buttons"><button className="gbp-project-change" title="Open a copy of the sample project that ships with the app" onClick={() => void chooseProject(true)}>Demo</button><button className="gbp-project-change" title="Open another GB Studio project" onClick={() => void chooseProject()}>Change…</button></div>
            <div className="gbp-project-kinds" role="tablist" aria-label="Asset folders">
              {ASSET_KINDS.map(([kind, label]) => { const count = project.assets.filter((asset) => asset.kind === kind).length; return <button key={kind} role="tab" aria-selected={projectKind === kind} className={projectKind === kind ? "selected" : ""} onClick={() => setProjectKind(kind)}>{label}<small>{count}</small></button>; })}
            </div>
            <input type="search" className="gbp-filter" placeholder="Filter by name" aria-label="Filter assets by name" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} />
            <div className="gbp-assets" role="list">
              {shownAssets.map((asset) => {
                const openDoc = docs.current.find((item) => item.asset?.kind === asset.kind && item.asset.file === asset.file);
                return (
                  <button key={asset.file} role="listitem" className={`gbp-asset ${openDoc && openDoc.id === activeId ? "selected" : openDoc ? "open" : ""}`} title={`${asset.file} · ${asset.width} × ${asset.height} px${openDoc ? " · open" : ""}`} onClick={() => void openAsset(asset)}>
                    <img loading="lazy" decoding="async" alt="" src={`${ASSET_URL}?${assetQuery(asset)}&v=${Math.round(asset.mtime)}`} />
                    <span className="gbp-asset-name">{openDoc?.dirty ? "• " : ""}{asset.name}</span>
                    <span className="gbp-asset-size">{asset.width}×{asset.height}</span>
                  </button>
                );
              })}
              {shownAssets.length === 0 && <p className="gbp-note">No {projectKind} match.</p>}
            </div>
          </aside>
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
          {doc ? (
            <div className={`gbp-stage ${tool === "hand" ? "pan" : ""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onContextMenu={(event) => event.preventDefault()}>
              <div className="gbp-wrap" ref={wrapRef} style={{ width: doc.width * doc.zoom, height: doc.height * doc.zoom }}>
                <canvas ref={canvasRef} />
                {gridLines && <div className="gbp-grid" style={{ backgroundSize: `${gridLines} ${gridLines}` }} />}
                {doc.sel && <div className={`gbp-selection ${doc.float ? "floating" : ""}`} style={{ left: doc.sel.x * doc.zoom, top: doc.sel.y * doc.zoom, width: doc.sel.w * doc.zoom, height: doc.sel.h * doc.zoom }} />}
                <div className="gbp-brush-outline" ref={brushRef} />
              </div>
            </div>
          ) : (
            <div className="gbp-empty">
              <LogoMark size={56} />
              <p>{project ? `Pick a picture of ${project.name} on the left, drop PNG files here, or` : "Drop PNG files here, or"}</p>
              {served && !project && <button className="quiet-button" onClick={() => void chooseProject()}><FolderTree size={14} />Open a GB Studio project</button>}
              {served && !project && <button className="quiet-button" title="A sample project with CC0 and MIT art (credits inside it): opens a copy you can paint in" onClick={() => void chooseProject(true)}><FolderTree size={14} />Try the demo project</button>}
              <button className="quiet-button" onClick={() => void pickFiles()}><FolderOpen size={14} />Open PNG files</button>
            </div>
          )}
        </div>
        <aside className="gbp-side">
          <h2>Shades</h2>
          <div className="pixel-swatches">
            {swatchColors.slice(0, 4).map((color, index) => <button key={index} className={shade === index ? "selected" : ""} style={{ background: color }} aria-label={`Shade ${index + 1}`} title={`Shade ${index + 1} · ${index + 1}`} onClick={() => { setShade(index); if (tool === "eyedropper") setToolState(paintTool.current); }}><kbd>{index + 1}</kbd></button>)}
          </div>
          {doc?.hasAlpha && <button className={`transparent-swatch ${shade === CLEAR ? "selected" : ""}`} title="See-through · 0" onClick={() => setShade(CLEAR)}><kbd>0</kbd>Transparent</button>}
          <h2>Palettes <HelpTip label="About the palette brush">{doc?.asset?.kind === "sprites" && sceneSlots.length ? "Palette brush (P): each 8 × 16 sprite tile wears one palette; its colors 1–3 dress the shades and color 0 is see-through. Save writes the sheet in the GB greens and each tile's palette into GB Studio as its sprite palette slot (the eight numbered here). None leaves a tile's slot as it is." : doc?.asset?.kind === "backgrounds" && sceneSlots.length ? "Palette brush (P): each 8 × 8 tile wears one palette. Save writes the picture in the GB greens and each tile's palette into GB Studio as its slot (the scene's eight, numbered here). None leaves a tile's slot as it is." : "Palette brush (P): each 8 × 8 tile wears one palette, or none. Palettes are only for looking here: saving always writes the GB greens."}</HelpTip></h2>
          {docPalettes.length > 12 && <input type="search" className="gbp-filter" placeholder="Filter palettes" aria-label="Filter palettes by name" value={paletteFilter} onChange={(event) => setPaletteFilter(event.target.value)} />}
          <div className="gbp-palettes" role="listbox" aria-label="Palettes">
            {shownPalettes.map(({ palette, index, slot }) => (
              <button key={`${index}-${palette.name}`} role="option" aria-selected={activePalette === index} className={activePalette === index ? "selected" : ""} onClick={() => { setActivePalette(index); if (index && tool !== "palette") setTool("palette"); }}>
                <span className="gbp-chips">{palette.colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>
                <span>{palette.name}</span>
                {slot >= 0 && <small className="gbp-slot" title={doc?.asset?.kind === "sprites" ? `Sprite palette slot ${slot + 1}` : `Palette slot ${slot + 1} of this background's scene`}>{slot + 1}</small>}
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
                <button className="quiet-button" title="Copy these four colors, to paste onto a palette here or in another tab" onClick={() => { setCopiedColors([...picked.colors]); say(`Copied the colors of ${picked.name}`); }}>Copy values</button>
                <button className="quiet-button" disabled={!copiedColors} title="Replace these four colors with the copied ones" onClick={() => copiedColors && recolorPalette(copiedColors)}>Paste values</button>
                <button className="quiet-button" disabled={!libraryColors || libraryColors.join() === picked.colors.join()} title="Back to this palette's default colors" onClick={() => libraryColors && recolorPalette(libraryColors)}>Back to default</button>
              </div>
            </div>
          )}
        </aside>
      </div>
      <footer className="gbp-status">
        <span ref={readoutRef} className="gbp-readout" />
        <span className="gbp-spacer" />
        {doc?.sel && <span>Selection {doc.sel.w} × {doc.sel.h} at {doc.sel.x}, {doc.sel.y}</span>}
        {doc?.asset && <span title="Save writes this file in the GB Studio project">assets/{doc.asset.kind}/{doc.asset.file}</span>}
        {doc && <span>{doc.width} × {doc.height} px · {doc.width / CELL} × {doc.height / CELL} tiles</span>}
      </footer>
      {toast && <div className="gbp-toast" role="status">{toast}</div>}
      {showPalettes && (
        <PaletteManager
          projectName={project?.name ?? null}
          projectPalettes={project?.palettes ?? []}
          picture={doc ? { pixels: (() => { const flat = doc.pixels.slice(); if (doc.float) drop(flat, doc.width, doc.height, doc.float); return flat; })(), width: doc.width, height: doc.height, sprite: Boolean(doc.keyGreen) } : null}
          onClose={() => setShowPalettes(false)}
          onWriteProject={writeProjectPalette}
          onPick={(id) => { const index = docPalettes.findIndex((item) => item.id === id); if (index >= 0) { setActivePalette(index + 1); setTool("palette"); } }}
        />
      )}
    </div>
  );
}
