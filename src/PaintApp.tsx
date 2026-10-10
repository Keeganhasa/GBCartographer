/**
 * GB Cartographer: a small painter for GB Studio pictures (backgrounds, sprite sheets, tilesets) and any Game Boy PNG.
 * Each open file is one flat picture in the four GB shades; tiles (8 × 8) may wear a palette from the project.
 * A tint only changes how the plain tiles look while painting. Saving writes one flat PNG, and for a project
 * picture also its tile palettes (see server/endpoints.ts).
 */
import { ChevronDown, CircleHelp, Download, FilePlus, FlipHorizontal2, FolderOpen, FolderTree, Grid2x2, Grid3x3, Link2, Magnet, Map as MapIcon, Minus, Palette as PaletteIcon, Pause, Play, Plus, Redo2, Save, ScanSearch, Tv, Undo2, Video, X } from "lucide-react";
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { flushSync } from "react-dom";
import { LogoMark } from "./ui/LogoMark";
import { FONTS, applyFont, loadFont, type FontChoice } from "./ui/theme";
import PaletteManager from "./PaletteManager";
import BackupsWindow from "./BackupsWindow";
import { attachMiddlePan, attachWheelZoom, nextStep } from "./ui/wheelZoom";
import { CELL, CLEAR, GB_SHADES, KEY_GREEN, KEY_MAGENTA, assignSlots, spriteShades, cellsWide, clipRect, colorize, countUniqueTiles, dot, drop, ellipsePoints, fillRect, floodFill, closeShades, PATTERNS, type Pattern, linkGroups, syncLinked, mergeNearTiles, tileUsage, type TileUsage, dropCells, flipFloat, gbcCorrect, LOOK_SHADES, type Look, lift, liftCells, linePoints, mirrorPoints, onTiles, replaceShade, rotateFloat, namedSlot, quantize, rectFrom, shadeLut, snapRect, spray, toRgba, type Floating, type Mirror, type Palette } from "./paint";
import { ASSET_URL, BUDGETS, BUDGET_KEY, BUILT_IN_TINTS, CUSTOM_TINT_KEY, FILE_MANAGER_LABEL, GRID_KEY, MIRRORS, MIRROR_LABEL, NAMED_SLOTS_KEY, SCREENS_KEY, LOOK_KEY, PATTERN_KEY, PNG_TYPES, PROJECT_KIND_KEY, PROJECT_PANEL_KEY, PROJECT_URL, TINT_KEY, UI_SLOT, UNDO_BYTES, UNDO_LIMIT, ZOOMS, hasSlots, isKeyed, versionTime, type Asset, type AssetInfo, type AssetKind, type Doc, type Drag, type FileHandle, type Opening, type PickerWindow, type Point, type Project, type ToolId } from "./app/model";
import { TOOLS } from "./app/tools";
import { readStored, sessionStore, store } from "./app/storage";
import { HelpTip } from "./app/HelpTip";
import { HelpWindow } from "./app/HelpWindow";
import { AboutWindow } from "./app/AboutWindow";
import { HealthWindow } from "./app/HealthWindow";
import { SpriteOnBackground } from "./app/SpriteOnBackground";
import { DialoguePreview } from "./app/DialoguePreview";
import { MapRoom } from "./app/MapRoom";
import { NewPictureWindow, ResizeWindow, type NewPicture } from "./app/NewPictureWindow";
import { Menu } from "./app/Menu";
import { StartScreen } from "./app/StartScreen";
import { ProjectPanel } from "./app/ProjectPanel";
import { encodeGif } from "./gb/gif";

/** A new picture's id: one above every open one (a counter would restart when the module reloads in development). */
const newDocId = (docs: readonly { id: number }[]) => docs.reduce((top, item) => Math.max(top, item.id), 0) + 1;

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
  /** Outlines every 160 × 144 area of the picture: one Game Boy screen. */
  const [screens, setScreens] = useState<boolean>(() => readStored(SCREENS_KEY, false));
  /** How the picture shows while painting: plain, or like an original, Pocket or Color Game Boy screen. */
  const [look, setLook] = useState<Look>(() => readStored(LOOK_KEY, "plain"));
  /** The tile budget view: tiles used once and tiles that nearly match another, over the picture. */
  const [budgetView, setBudgetView] = useState(false);
  /** Linked tiles: painting one tile paints every identical copy (one-color tiles are not linked). */
  const [linked, setLinked] = useState(false);
  /** Seamless view: the tile under the pointer (or the selection) repeated 3 × 3 above the picture. */
  const [seamless, setSeamless] = useState(false);
  /** Camera walk: a 160 × 144 screen dragged over the picture (null: off). */
  const [camera, setCamera] = useState<{ x: number; y: number } | null>(null);
  const cameraCanvas = useRef<HTMLCanvasElement>(null);
  const cameraDrag = useRef<{ dx: number; dy: number } | null>(null);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const seamlessCanvas = useRef<HTMLCanvasElement>(null);
  /** The fill pattern for Flood fill and Filled rectangle (D cycles it). */
  const [pattern, setPattern] = useState<Pattern>(() => readStored(PATTERN_KEY, "solid"));
  const cyclePattern = () => { const next = PATTERNS[(PATTERNS.findIndex((item) => item.id === pattern) + 1) % PATTERNS.length]; setPattern(next.id); store(PATTERN_KEY, next.id); say(`Fill pattern: ${next.label}`); };
  /** During a stroke with linked tiles: the groups, the pixels before the stroke, and after the last step. */
  const linkStroke = useRef<{ link: ReturnType<typeof linkGroups>; base: Uint8Array; previous: Uint8Array } | null>(null);
  const [usage, setUsage] = useState<{ key: string; usage: TileUsage } | null>(null);
  const usageCanvas = useRef<HTMLCanvasElement>(null);
  const priorityCanvas = useRef<HTMLCanvasElement>(null);
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
  const [showAbout, setShowAbout] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [showDialogue, setShowDialogue] = useState(false);
  const [showMapRoom, setShowMapRoom] = useState(false);
  /** Try the sprite sheet's animation on one of the project's backgrounds: its frames, drawn when opened. */
  const [onBackground, setOnBackground] = useState<HTMLCanvasElement[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showResize, setShowResize] = useState(false);
  /** Whether the user was warned this session that GB Studio is open (it may overwrite project JSON when it saves). */
  const gbStudioWarned = useRef(false);
  /** Projects whose GB Studio version note was shown this session. */
  const versionNoted = useRef(new Set<string>());
  /** True while Save runs: the changed-on-disk check waits, since Save itself changes the files. */
  const saving = useRef(false);
  const shadeInputs = useRef<(HTMLInputElement | null)[]>([]);
  const [recent, setRecent] = useState<{ name: string; path: string }[]>([]);
  /** The right-click menu on a picture card: where it opened and for which asset. */
  const [assetMenu, setAssetMenu] = useState<{ x: number; y: number; asset: Asset } | null>(null);
  /** The project menu (open another, the demo, recent, close), anchored under the button that opened it. */
  const [projectMenu, setProjectMenu] = useState<{ x: number; y: number } | null>(null);
  /** The "Put in slot" menu for a palette of the open picture (its index in the picture's palettes, from 1). */
  /** The Backups window, open on a file (a path inside the project) or on the newest backup. */
  const [backups, setBackups] = useState<{ file?: string } | null>(null);
  /** The Export menu: a copy of the file, or an image to share (as shown or in greens, scaled). */
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null);
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
  const [toast, setToast] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const brushRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const lastPoint = useRef<Point | null>(null);
  const clip = useRef<Floating | null>(null);
  /** The palettes of the picture a clip was copied from, so its tile palettes land on the same palettes when pasted. */
  const clipPalettes = useRef<Palette[]>([]);
  const lastRecolor = useRef(0);
  /** The stamp tool's block: pixels, tile palettes when whole tiles, and the palettes they refer to. */
  const stamp = useRef<(Floating & { palettes: Palette[] }) | null>(null);
  /** Counts edits, so work that follows the pixels (the tile budget view) knows when to look again. */
  const editCount = useRef(0);
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
    // Picking the stamp with a selection makes the selection the stamp.
    if (next === "stamp" && doc?.sel) takeStamp(doc, doc.sel);
    if (doc && next !== "select" && next !== "move" && next !== "hand") dropFloat(doc);
    if (next !== "eyedropper" && next !== "hand") paintTool.current = next;
    setToolState(next);
  }

  // ---- session -------------------------------------------------------------------------------------------------

  function writeSession() {
    window.clearTimeout(sessionTimer.current);
    const value = {
      active: docs.current.findIndex((item) => item.id === activeId),
      docs: docs.current.map(({ name, width, height, pixels, cells, priority, hasAlpha, palettes, dirty, handle, asset, keyGreen, keyMagenta, resized, zoom, float }) => {
        // A floating piece is kept dropped in place, with its tile palettes.
        const flat = pixels.slice(), flatCells = cells.slice();
        if (float) { drop(flat, width, height, float); dropCells(flatCells, width, height, float); }
        return { name, width, height, pixels: flat, cells: flatCells, priority, hasAlpha, palettes, dirty, handle, asset, keyGreen, keyMagenta, resized, zoom };
      }),
    };
    return sessionStore("readwrite", (objects) => objects.put(value, "open")).then(() => true);
  }

  function scheduleSession() {
    window.clearTimeout(sessionTimer.current);
    sessionTimer.current = window.setTimeout(() => void writeSession(), 800);
  }

  function touch(target: Doc) {
    editCount.current += 1;
    target.dirty = true;
    scheduleSession();
    bump();
  }

  // ---- undo and the floating selection ---------------------------------------------------------------------------

  function pushUndo(target: Doc) {
    target.undo.push({ pixels: target.pixels.slice(), cells: target.cells.slice(), palettes: clonePalettes(target.palettes), ...(target.priority ? { priority: target.priority.slice() } : {}) });
    while (target.undo.length > UNDO_LIMIT || (target.undo.length > 1 && target.undo.length * target.pixels.length > UNDO_BYTES)) target.undo.shift();
    target.redo = [];
  }

  /** Flattens the floating piece into the picture where it sits. */
  function dropFloat(target: Doc) {
    if (!target.float) return;
    drop(target.pixels, target.width, target.height, target.float);
    dropCells(target.cells, target.width, target.height, target.float);
    target.float = null;
  }

  function stepHistory(from: "undo" | "redo") {
    if (!doc || !doc[from].length) return;
    dropFloat(doc);
    doc[from === "undo" ? "redo" : "undo"].push({ pixels: doc.pixels, cells: doc.cells, palettes: clonePalettes(doc.palettes), ...(doc.priority ? { priority: doc.priority } : {}) });
    const { palettes, ...rest } = doc[from].pop()!;
    Object.assign(doc, rest);
    // Palette colors come back too; a restored list that predates a palette added since keeps the newer ones.
    if (palettes) palettes.forEach((palette, index) => { if (doc.palettes[index]) doc.palettes[index] = palette; });
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
    // On tile edges the tiles' palettes go along (the tiles left behind wear none).
    if (onTiles(rect)) target.float.cells = liftCells(target.cells, target.width, rect, copy ? undefined : 0);
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
    clip.current = doc.float ? { ...doc.float, pixels: doc.float.pixels.slice(), ...(doc.float.cells ? { cells: doc.float.cells.slice() } : {}) } : rect ? { ...lift(doc.pixels, doc.width, rect), ...(onTiles(rect) ? { cells: liftCells(doc.cells, doc.width, rect) } : {}) } : null;
    clipPalettes.current = clonePalettes(doc.palettes);
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
    // Tile palettes land on the same palettes in this picture (matched by GB Studio id, else name and colors; added if missing).
    const cells = clip.current.cells?.map((wear) => {
      const palette = wear ? clipPalettes.current[wear - 1] : undefined;
      if (!palette) return 0;
      let index = doc.palettes.findIndex((own) => (palette.id && own.id === palette.id) || (!palette.id && own.name === palette.name && own.colors.join() === palette.colors.join()));
      if (index < 0) index = doc.palettes.push({ ...palette, colors: [...palette.colors] }) - 1;
      return index + 1;
    });
    doc.float = { ...clip.current, pixels: clip.current.pixels.slice(), ...(cells ? { cells } : {}), x: corner(view.left - box.left, doc.width), y: corner(view.top - box.top, doc.height) };
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
        const keyGreen = asset ? isKeyed(asset.kind) : false;
        // Fonts: magenta marks a variable-width glyph's unused columns (GB Studio reads it as see-through); it stays magenta.
        const keyMagenta = asset?.kind === "fonts";
        const picture = quantize(context.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height, palettesRef.current, keyGreen, keyMagenta);
        // A background's tile colors (GB Studio's per-tile palettes) dress the cells when the scene's palettes are known.
        const dressed = info?.tileColors.length ? assignSlots(picture.cells, info.tileColors, info.slots, picture.palettes) : 0;
        const old = replace !== undefined ? docs.current.findIndex((item) => item.id === replace) : -1;
        const id = old >= 0 ? replace! : newDocId(docs.current);
        if (old < 0) last = id;
        // Backgrounds and tilesets: each tile's priority flag (bit 7: draws over sprites).
        const flags = asset && info && (asset.kind === "backgrounds" || asset.kind === "tilesets") ? Array.from({ length: picture.cells.length }, (_, cell) => (info.tileColors[cell] ?? 0) >= 0 && (info.tileColors[cell] ?? 0) & 0x80 ? 1 : 0) : null;
        const opened: Doc = { id, name: asset?.name ?? file.name, width: bitmap.width, height: bitmap.height, pixels: picture.pixels, cells: picture.cells, ...(flags ? { priority: Uint8Array.from(flags) } : {}), hasAlpha: picture.hasAlpha || keyGreen, palettes: picture.palettes, undo: [], redo: [], dirty: false, handle, asset: asset && info ? { kind: asset.kind, file: asset.file, name: asset.name, mtime: info.mtime, ...(hasSlots(asset.kind) ? { slots: info.slots, slotScene: info.slotScene ?? null, metaMtime: info.metaMtime, opened: info.tileColors.map((value) => value < 0 ? -1 : value & 7), ...(flags ? { openedPriority: flags } : {}) } : {}), ...(asset.kind === "sprites" && info.animations?.length ? { animations: info.animations, animSpeed: info.animSpeed ?? null } : {}), project: projectRef.current?.path, ...(info.autoColor ? { autoColor: true } : {}) } : undefined, keyGreen: keyGreen || undefined, ...(keyMagenta ? { keyMagenta: true } : {}), zoom: old >= 0 ? docs.current[old].zoom : fitZoom(bitmap.width, bitmap.height), sel: null, float: null };
        if (old >= 0) docs.current[old] = opened;
        else docs.current.push(opened);
        if (old >= 0) continue;
        const made = picture.palettes.length - palettesRef.current.length;
        if (info?.autoColor) say(`${asset?.name ?? file.name} uses GB Studio's Automatic color: GB Studio reads its colors from the PNG itself. Saving here writes the four greens and loses them; Save asks first.`);
        else if (picture.snapped) say(`${file.name}: ${picture.snapped} color${picture.snapped === 1 ? "" : "s"} read as the same shade as another color in their tile (GB Studio reads colors by their green), so they show alike, as in GB Studio.`);
        else if (made) say(`${file.name}: tiles in colors outside the library keep them as ${made} palette${made === 1 ? "" : "s"} of the file. Each pixel's shade is the one GB Studio reads it as (by its green); Save writes those greens.`);
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
    const ping = await fetch("./__cartographer/ping", { cache: "no-cache" }).then((response) => asJson<{ ok?: boolean; project?: { path: string; versionNote?: string | null } | null; recent?: { name: string; path: string }[] }>(response)).catch(() => null);
    setServed(Boolean(ping?.ok));
    // A project made with a GB Studio version this wasn't tested with: say so once per project and session.
    if (ping?.project?.versionNote && !versionNoted.current.has(ping.project.path)) {
      versionNoted.current.add(ping.project.path);
      say(ping.project.versionNote);
    }
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
  /** Closes the pictures of a project that is no longer open (`always`: also when the same folder reopened, e.g. a reset demo). */
  function closeDocsOf(oldPath: string | undefined, always = false) {
    if (!oldPath || (!always && oldPath === projectRef.current?.path)) return;
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
  async function chooseProject(demo = false, reset = false) {
    const native = (window as PickerWindow).gbc;
    if (reset && !window.confirm("Start the demo project over? Your painted copy is moved to the backups folder (nothing is deleted), and a fresh copy of the demo opens.")) return;
    if (!await readyToLeaveProject()) return;
    const oldPath = projectRef.current?.path;
    try {
      if (demo) {
        const response = await fetch("./__cartographer/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demo: true, ...(reset ? { reset: true } : {}) }) });
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
      closeDocsOf(oldPath, reset);
      if (reset) setSlotsVersion((value) => value + 1);
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

  /**
   * A new blank picture: written into the project as a new PNG (then opened from there), or kept here as an
   * untitled picture that Save asks a place for. Resolves true when it was made.
   */
  async function createPicture({ kind, name, width, height }: NewPicture): Promise<boolean> {
    const keyed = kind ? isKeyed(kind) : false;
    const pixels = new Uint8Array(width * height).fill(keyed ? CLEAR : 0);
    const cells = new Uint8Array(cellsWide(width) * Math.ceil(height / CELL));
    if (!kind) {
      const id = newDocId(docs.current);
      docs.current.push({ id, name: `${name.replace(/\.png$/i, "")}.png`, width, height, pixels, cells, hasAlpha: false, palettes: clonePalettes(palettesRef.current), undo: [], redo: [], dirty: true, zoom: fitZoom(width, height), sel: null, float: null });
      setActiveId(id);
      scheduleSession();
      bump();
      return true;
    }
    const canvas = document.createElement("canvas");
    Object.assign(canvas, { width, height });
    canvas.getContext("2d")!.putImageData(new ImageData(toRgba(pixels, cells, width, [], keyed ? KEY_GREEN : undefined), width, height), 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((made) => made ? resolve(made) : reject(new Error("No PNG")), "image/png"));
    const response = await fetch(`./__cartographer/gbstudio-new-asset?${new URLSearchParams({ kind, name })}`, { method: "POST", body: blob }).catch(() => null);
    const result = response ? await response.json().catch(() => null) as { ok?: boolean; error?: string; file?: string } | null : null;
    if (!response?.ok || !result?.ok || !result.file) { say(`Could not make the picture: ${result?.error ?? response?.statusText ?? "no answer"}`); return false; }
    await loadProject();
    setProjectKind(kind);
    const made = projectRef.current?.assets.find((asset) => asset.kind === kind && asset.file === result.file);
    if (made) await openAsset(made);
    say(`Made assets/${kind}/${result.file} in ${projectRef.current?.name ?? "the project"}`);
    return true;
  }

  /**
   * Gives the open picture a new size in whole tiles, at the top-left or centered on tile edges. Tile palettes stay
   * with their tiles; new space is blank. Undo starts over (the sizes differ); Save writes the new size.
   */
  function resizePicture(width: number, height: number, center: boolean) {
    if (!doc) return;
    dropFloat(doc);
    const dx = center ? Math.floor((width - doc.width) / 2 / CELL) * CELL : 0, dy = center ? Math.floor((height - doc.height) / 2 / CELL) * CELL : 0;
    const pixels = new Uint8Array(width * height).fill(blank(doc));
    for (let y = 0; y < doc.height; y += 1) {
      const ty = y + dy;
      if (ty < 0 || ty >= height) continue;
      for (let x = 0; x < doc.width; x += 1) {
        const tx = x + dx;
        if (tx >= 0 && tx < width) pixels[ty * width + tx] = doc.pixels[y * doc.width + x];
      }
    }
    const oldCw = cellsWide(doc.width), oldCh = Math.ceil(doc.height / CELL), cw = cellsWide(width), ch = Math.ceil(height / CELL);
    const move = <T,>(source: ArrayLike<T>, fill: T, make: (length: number) => { [index: number]: T; length: number }) => {
      const out = make(cw * ch);
      for (let i = 0; i < out.length; i += 1) out[i] = fill;
      for (let y = 0; y < oldCh; y += 1) for (let x = 0; x < oldCw; x += 1) {
        const tx = x + dx / CELL, ty = y + dy / CELL;
        if (tx >= 0 && ty >= 0 && tx < cw && ty < ch) out[ty * cw + tx] = source[y * oldCw + x];
      }
      return out;
    };
    const cells = move(doc.cells, 0, (length) => new Uint8Array(length)) as Uint8Array;
    if (doc.asset?.opened) doc.asset.opened = Array.from(move(doc.asset.opened, -1, (length) => new Array<number>(length)) as number[]);
    Object.assign(doc, { width, height, pixels, cells, undo: [], redo: [], sel: null, float: null, resized: true, zoom: fitZoom(width, height) });
    touch(doc);
    say(`${doc.name} is now ${width} × ${height}. Undo starts over from here; Save writes the new size.`);
  }

  /** Writes the picture over its GB Studio asset (the server keeps a backup and refuses a file that changed on disk). */
  async function saveAsset(target: Doc, blob: Blob): Promise<boolean> {
    const asset = target.asset!;
    if (asset.autoColor && !window.confirm(`${asset.name} uses GB Studio's Automatic color: GB Studio reads its colors straight from the PNG. Saving writes it in the four GB greens, so those colors are lost (the old file goes to Backups). Save anyway?`)) return false;
    if (asset.project && asset.project !== projectRef.current?.path) {
      say(`${asset.name} belongs to ${asset.project}. Open that project to save it, or use Export.`);
      return false;
    }
    if (target.resized && !window.confirm(`Save ${asset.name} at its new size, ${target.width} × ${target.height}? The old file goes to Backups.${asset.kind === "backgrounds" ? " Scenes showing it take their size from it in GB Studio." : ""}`)) return false;
    const post = (force: boolean) => fetch(`${ASSET_URL}?${assetQuery(asset)}&mtime=${asset.mtime}${force ? "&force=1" : ""}${target.resized ? "&resize=1" : ""}`, { method: "POST", body: blob });
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
    target.changedOnDisk = undefined;
    target.resized = false;
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
    // Priority flags that changed since opening (backgrounds and tilesets).
    const priority = target.priority ? Array.from(target.priority, (on, cell) => on === (asset.openedPriority?.[cell] ?? 0) ? null : on === 1) : [];
    const flagged = priority.filter((value) => value !== null).length;
    if (!await okToWriteProjectJson()) return ["Tile palettes not written"];
    const post = (force: boolean) => fetch(`./__cartographer/gbstudio-tile-colors?${new URLSearchParams({ kind: asset.kind, file: asset.file })}${asset.metaMtime != null ? `&metaMtime=${asset.metaMtime}` : ""}${force ? "&force=1" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slots, ...(flagged ? { priority } : {}) }) });
    let response = await post(false);
    if (response.status === 409) {
      if (!window.confirm(`The palettes of ${asset.name} changed in GB Studio since you opened it. Replace them with this picture's?`)) return ["Tile palettes not written"];
      response = await post(true);
    }
    const result = await response.json() as { ok?: boolean; error?: string; mtime?: number; changed?: boolean; cells?: number };
    if (!response.ok || !result.ok) return [`Tile palettes not written: ${result.error ?? response.statusText}`];
    if (target.priority) asset.openedPriority = Array.from(target.priority);
    asset.metaMtime = result.mtime ?? asset.metaMtime;
    const notes: string[] = [];
    if (result.changed) notes.push(flagged ? `${result.cells} tile${result.cells === 1 ? "" : "s"} written to GB Studio (palettes and draw-over-sprites flags)` : `${result.cells} tile palette${result.cells === 1 ? "" : "s"} written to GB Studio`);
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
      // Pictures from an older session learn their tiles' priority flags too.
      if (!item.priority && (asset.kind === "backgrounds" || asset.kind === "tilesets")) {
        const flags = Array.from({ length: item.cells.length }, (_, cell) => (info.tileColors[cell] ?? 0) >= 0 && (info.tileColors[cell] ?? 0) & 0x80 ? 1 : 0);
        item.priority = Uint8Array.from(flags);
        asset.openedPriority = flags;
      }
      Object.assign(asset, { slots: info.slots, slotScene: info.slotScene ?? null, ...(asset.kind === "sprites" ? { animSpeed: info.animSpeed ?? null } : {}) });
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
    canvas.getContext("2d")!.putImageData(new ImageData(toRgba(target.pixels, target.cells, target.width, [], target.keyGreen ? KEY_GREEN : target.keyMagenta ? KEY_MAGENTA : undefined), target.width, target.height), 0, 0);
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
   * Exports the open picture as an image to share (an itch page, a post): `colored` draws it as shown here (tile
   * palettes, the tint on plain tiles), else in the GB greens; `scale` enlarges it with hard pixel edges.
   * See-through pixels stay see-through. The picture itself is not touched.
   */
  async function exportImage(scale: number, colored: boolean) {
    const target = doc;
    if (!target) return;
    const flat = target.pixels.slice(), cells = target.cells.slice();
    if (target.float) {
      drop(flat, target.width, target.height, target.float);
      dropCells(cells, target.width, target.height, target.float);
    }
    const small = document.createElement("canvas");
    Object.assign(small, { width: target.width, height: target.height });
    const image = new ImageData(target.width, target.height);
    if (colored) colorize(flat, cells, target.width, luts, new Uint32Array(image.data.buffer));
    else image.data.set(toRgba(flat, cells, target.width, []));
    small.getContext("2d")!.putImageData(image, 0, 0);
    const big = document.createElement("canvas");
    Object.assign(big, { width: target.width * scale, height: target.height * scale });
    const context = big.getContext("2d")!;
    context.imageSmoothingEnabled = false;
    context.drawImage(small, 0, 0, big.width, big.height);
    const blob = await new Promise<Blob>((resolve, reject) => big.toBlob((made) => made ? resolve(made) : reject(new Error("No PNG")), "image/png"));
    const name = `${target.name.replace(/\.png$/i, "")}${colored ? "" : " greens"}${scale > 1 ? ` ${scale}x` : ""}.png`;
    if (await saveBlob(blob, name, PNG_TYPES)) say(`Exported ${name} (${big.width} × ${big.height})`);
  }

  /** Lets the user keep a file: a save dialog where the browser has one, else a download. Resolves true when kept. */
  async function saveBlob(blob: Blob, name: string, types: object[]): Promise<boolean> {
    try {
      const picker = (window as PickerWindow).showSaveFilePicker;
      if (picker) {
        const handle = await picker.call(window, { suggestedName: name, types });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }
      return true;
    } catch (error) {
      if ((error as Error).name !== "AbortError") say(`Could not export ${name}: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * The sprite sheet's current animation as a looping GIF, frames put together from their slices as shown here
   * (palettes, screen look), at GB Studio's speed, enlarged `scale` times with hard pixel edges.
   */
  /** The current animation's frames put together from their slices as shown here, all on one size of canvas. */
  function composeFrames(): HTMLCanvasElement[] {
    const sheet = canvasRef.current;
    if (!sheet || !frames.length) return [];
    const left = Math.min(0, ...frames.flatMap((item) => item.tiles.map((tile) => tile.x))), top = Math.min(0, ...frames.flatMap((item) => item.tiles.map((tile) => tile.y)));
    const width = Math.max(16, ...frames.flatMap((item) => item.tiles.map((tile) => tile.x + 8))) - left, height = Math.max(16, ...frames.flatMap((item) => item.tiles.map((tile) => tile.y + 16))) - top;
    return frames.map((item) => {
      const canvas = document.createElement("canvas");
      Object.assign(canvas, { width, height });
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      for (const tile of item.tiles) {
        context.save();
        context.translate(tile.x - left + (tile.flipX ? 8 : 0), tile.y - top + (tile.flipY ? 16 : 0));
        context.scale(tile.flipX ? -1 : 1, tile.flipY ? -1 : 1);
        context.drawImage(sheet, tile.sliceX, tile.sliceY, 8, 16, 0, 0, 8, 16);
        context.restore();
      }
      return canvas;
    });
  }

  async function exportGif(scale: number) {
    const composed = composeFrames();
    if (!doc || !composed.length) return;
    const big = document.createElement("canvas");
    Object.assign(big, { width: composed[0].width * scale, height: composed[0].height * scale });
    const wide = big.getContext("2d", { willReadFrequently: true })!;
    wide.imageSmoothingEnabled = false;
    const images = composed.map((frameCanvas) => {
      wide.clearRect(0, 0, big.width, big.height);
      wide.drawImage(frameCanvas, 0, 0, big.width, big.height);
      return wide.getImageData(0, 0, big.width, big.height).data;
    });
    try {
      const gif = encodeGif(images, big.width, big.height, Math.max(2, Math.round(100 / fps)));
      const name = `${doc.name.replace(/\.png$/i, "")}${animations.length > 1 && animation?.name ? ` ${animation.name}` : ""}${scale > 1 ? ` ${scale}x` : ""}.gif`;
      if (await saveBlob(new Blob([gif], { type: "image/gif" }), name, [{ description: "GIF animation", accept: { "image/gif": [".gif"] } }])) say(`Exported ${name} (${frames.length} frames, ${big.width} × ${big.height})`);
    } catch (error) {
      say(`Could not make the GIF: ${(error as Error).message}`);
    }
  }

  /**
   * Save (Ctrl+S) saves every changed picture that has somewhere to go; the active one is asked where when it has
   * none. Export copy (Ctrl+E) saves a copy of the active picture only.
   */
  async function save(copy: boolean) {
    if (!doc) return;
    saving.current = true;
    try { await saveAll(copy); } finally { saving.current = false; }
  }

  async function saveAll(copy: boolean) {
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

  /**
   * Notices open project pictures whose PNG or sidecar changed on disk (GB Studio saved, a restore, another app):
   * a picture without unsaved changes reloads; one with unsaved changes gets a bar to reload or keep it.
   */
  async function checkDisk() {
    const path = projectRef.current?.path;
    if (!path || saving.current) return;
    const open = docs.current.filter((item) => item.asset && (!item.asset.project || item.asset.project === path));
    if (!open.length) return;
    const result = await fetch("./__cartographer/asset-times", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assets: open.map((item) => ({ kind: item.asset!.kind, file: item.asset!.file })) }) })
      .then((response) => response.ok ? response.json() as Promise<{ times?: ({ mtime: number; metaMtime: number | null } | null)[] }> : null).catch(() => null);
    if (!result?.times || saving.current) return;
    const differs = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(a - b) > 1;
    const reloaded: string[] = [];
    for (const [index, item] of open.entries()) {
      const now = result.times[index], asset = item.asset!;
      if (!now) continue;
      const seen = item.changedOnDisk;
      const changed = differs(now.mtime, asset.mtime) || differs(now.metaMtime, asset.metaMtime);
      if (!changed || (seen && !differs(now.mtime, seen.mtime) && !differs(now.metaMtime, seen.metaMtime))) continue;
      if (item.dirty) item.changedOnDisk = now;
      else if (await reloadAsset(item)) reloaded.push(asset.name);
    }
    if (reloaded.length) say(`${reloaded.join(", ")} changed on disk and ${reloaded.length === 1 ? "was" : "were"} reloaded.`);
    bump();
  }

  /**
   * Flips the selection (or the whole picture) left-right or top-bottom, or turns the selection a quarter turn
   * clockwise. Tile-aligned pieces take their tile palettes along.
   */
  function transformSelection(how: "x" | "y" | "turn") {
    if (!doc) return;
    const floating = floatSelection(doc, false);
    if (!floating) return;
    doc.float = how === "turn" ? rotateFloat(floating) : flipFloat(floating, how);
    doc.sel = { x: doc.float.x, y: doc.float.y, w: doc.float.w, h: doc.float.h };
    setToolState("select");
    touch(doc);
  }

  /** Shows the next (1) or previous (-1) open picture, wrapping around. */
  function switchTab(step: number) {
    const list = docs.current;
    if (list.length < 2) return;
    const at = list.findIndex((item) => item.id === activeId);
    setActiveId(list[(at + step + list.length) % list.length].id);
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
    // One undo step per burst of changes (a color well sends many while dragging).
    if (Date.now() - lastRecolor.current > 1200) { dropFloat(doc); pushUndo(doc); }
    lastRecolor.current = Date.now();
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

  /** Picks up a block of the picture (and, on tile edges, its tile palettes) as the stamp. */
  function takeStamp(target: Doc, rect: { x: number; y: number; w: number; h: number }) {
    const area = clipRect(rect, target.width, target.height);
    if (!area) return;
    const flat = target.float ? target.pixels.slice() : target.pixels;
    if (target.float) drop(flat, target.width, target.height, target.float);
    stamp.current = { ...lift(flat, target.width, area), ...(onTiles(area) ? { cells: liftCells(target.cells, target.width, area) } : {}), palettes: clonePalettes(target.palettes) };
    say(`Stamp: ${area.w} × ${area.h}${onTiles(area) ? " (with its tile palettes)" : ""}. Click or drag to stamp it on the grid.`);
  }

  /** Stamps a copy with its top-left on the 8 px grid under `point` (see-through pixels leave the picture alone). */
  function putStamp(target: Doc, point: Point) {
    const source = stamp.current;
    if (!source) return;
    const x = point.x & ~7, y = point.y & ~7;
    drop(target.pixels, target.width, target.height, { ...source, x, y });
    if (source.cells) {
      // Tile palettes land on the same palettes in this picture (matched by id, else name and colors; added if missing).
      const cells = source.cells.map((wear) => {
        const palette = wear ? source.palettes[wear - 1] : undefined;
        if (!palette) return 0;
        let index = target.palettes.findIndex((own) => (palette.id && own.id === palette.id) || (!palette.id && own.name === palette.name && own.colors.join() === palette.colors.join()));
        if (index < 0) index = target.palettes.push({ ...palette, colors: [...palette.colors] }) - 1;
        return index + 1;
      });
      dropCells(target.cells, target.width, target.height, { ...source, x, y, cells });
    }
  }

  /** Marks (or clears) the priority flag of the tiles under the palette brush's size. */
  function setPriority(target: Doc, point: Point, on: boolean) {
    if (!target.priority || !inside(target, point)) return;
    const cw = cellsWide(target.width), ch = Math.ceil(target.height / CELL), offset = Math.floor((cellBrush - 1) / 2);
    for (let by = 0; by < cellBrush; by += 1) for (let bx = 0; bx < cellBrush; bx += 1) {
      const cx = (point.x >> 3) - offset + bx, cy = (point.y >> 3) - offset + by;
      if (cx >= 0 && cy >= 0 && cx < cw && cy < ch) target.priority[cy * cw + cx] = on ? 1 : 0;
    }
  }

  function drawShape(target: Doc, a: Point, b: Point, value: number) {
    if (tool === "rectFill") return fillRect(target.pixels, target.width, target.height, rectFrom(a.x, a.y, b.x, b.y), value, pattern);
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
    if (event.button === 2 && tool === "stamp") {
      if (inside(doc, point)) takeStamp(doc, { x: point.x & ~7, y: point.y & ~7, w: CELL, h: CELL });
      return;
    }
    if (event.button === 2 && tool === "priority" && doc.priority) {
      pushUndo(doc);
      setPriority(doc, point, false);
      drag.current = { kind: "priority", last: point, on: false };
      return touch(doc);
    }
    if (event.button === 2) {
      if (tool === "palette" && inside(doc, point)) setActivePalette(doc.cells[(point.y >> 3) * cellsWide(doc.width) + (point.x >> 3)]);
      else pickShade(doc, point);
      return;
    }
    const value = tool === "eraser" || tool === "fillErase" || (shade === CLEAR && !doc.hasAlpha) ? blank(doc) : shade;
    linkStroke.current = linked && !["eyedropper", "select", "move", "palette", "hand"].includes(tool) ? { link: linkGroups(doc.pixels, doc.width, doc.height), base: doc.pixels.slice(), previous: doc.pixels.slice() } : null;
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
    } else if (tool === "stamp") {
      if (!stamp.current) { say("Right-click a tile to pick it up as the stamp, or select a block and pick the stamp tool again."); return; }
      dropFloat(doc);
      pushUndo(doc);
      putStamp(doc, point);
      const origin = { x: point.x & ~7, y: point.y & ~7 };
      drag.current = { kind: "stamp", origin, last: origin };
    } else if (tool === "priority") {
      if (!doc.priority) { say("The priority brush is for project backgrounds and tilesets (GB Studio's draw-over-sprites flag)."); return; }
      pushUndo(doc);
      const on = !event.altKey;
      setPriority(doc, point, on);
      drag.current = { kind: "priority", last: point, on };
    } else if (tool === "palette") {
      pushUndo(doc);
      for (const [x, y] of event.shiftKey && lastPoint.current ? linePoints(lastPoint.current.x, lastPoint.current.y, point.x, point.y) : [[point.x, point.y]]) setCell(doc, { x, y });
      drag.current = { kind: "cells", last: point };
      lastPoint.current = point;
    } else if (tool === "fill" || tool === "fillErase") {
      pushUndo(doc);
      // Alt-click replaces that shade everywhere (inside the selection, if any) instead of filling one area.
      const changed = event.altKey ? replaceShade(doc.pixels, doc.width, doc.height, doc.pixels[point.y * doc.width + point.x], value, doc.sel) > 0 : floodFill(doc.pixels, doc.width, doc.height, point.x, point.y, value, pattern);
      if (!changed) doc.undo.pop();
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
    followLinks(doc);
    touch(doc);
  }

  /** With linked tiles on, what the last step painted goes to every identical copy of each tile it touched. */
  function followLinks(target: Doc) {
    const stroke = linkStroke.current;
    if (!stroke) return;
    syncLinked(target.pixels, stroke.previous, stroke.base, target.width, target.height, stroke.link);
    stroke.previous.set(target.pixels);
  }

  function pointerMove(event: React.PointerEvent) {
    if (!doc) return;
    const point = pointAt(event);
    if (readoutRef.current) readoutRef.current.textContent = inside(doc, point) ? `${point.x}, ${point.y} · tile ${point.x >> 3}, ${point.y >> 3}` : "";
    const outline = brushRef.current;
    if (outline) {
      if (tool === "stamp") {
        // The stamp's footprint where it would land.
        const visible = inside(doc, point) && Boolean(stamp.current);
        Object.assign(outline.style, { display: visible ? "block" : "none", left: `${(point.x & ~7) * doc.zoom}px`, top: `${(point.y & ~7) * doc.zoom}px`, width: `${(stamp.current?.w ?? CELL) * doc.zoom}px`, height: `${(stamp.current?.h ?? CELL) * doc.zoom}px` });
      } else {
        const cells = tool === "palette" || tool === "priority", tall = tool === "palette" && doc.keyGreen;
        const cellH = tall ? 2 * CELL : CELL, cellOffset = Math.floor((cellBrush - 1) / 2);
        const size = cells ? CELL * cellBrush : brush, offset = cells ? 0 : Math.floor((brush - 1) / 2);
        const [x, y] = cells ? [(point.x & ~7) - cellOffset * CELL, (tall ? point.y & ~15 : point.y & ~7) - cellOffset * cellH] : [point.x - offset, point.y - offset];
        const visible = inside(doc, point) && tool !== "hand" && tool !== "select" && tool !== "move";
        Object.assign(outline.style, { display: visible ? "block" : "none", left: `${x * doc.zoom}px`, top: `${y * doc.zoom}px`, width: `${size * doc.zoom}px`, height: `${(cells ? cellH * cellBrush : size) * doc.zoom}px` });
      }
    }
    if (seamless && inside(doc, point) && (hoverCell?.x !== point.x >> 3 || hoverCell?.y !== point.y >> 3)) setHoverCell({ x: point.x >> 3, y: point.y >> 3 });
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
    } else if (state.kind === "stamp") {
      // Copies tile outward from the first one, a stamp's size apart, so a block repeats seamlessly.
      const source = stamp.current;
      if (source) {
        const at = { x: state.origin.x + Math.floor((point.x - state.origin.x) / source.w) * source.w, y: state.origin.y + Math.floor((point.y - state.origin.y) / source.h) * source.h };
        if (at.x !== state.last.x || at.y !== state.last.y) {
          drop(doc.pixels, doc.width, doc.height, { ...source, ...at });
          if (source.cells && at.x % CELL === 0 && at.y % CELL === 0) putStamp(doc, at);
          state.last = at;
        }
      }
    } else if (state.kind === "priority") {
      for (const [x, y] of linePoints(state.last.x, state.last.y, point.x, point.y)) setPriority(doc, { x, y }, state.on);
      state.last = point;
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
    if (state.kind === "stroke" || state.kind === "spray" || state.kind === "shape" || state.kind === "stamp") followLinks(doc);
    bump();
  }

  function pointerUp() {
    const state = drag.current;
    drag.current = null;
    linkStroke.current = null;
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
    // Tabs: Ctrl+Tab / Ctrl+PageDown next, with Shift / PageUp previous; Alt+W (and Ctrl+W in the desktop app) closes.
    if (event.ctrlKey && (key === "Tab" || key === "PageDown" || key === "PageUp")) {
      event.preventDefault();
      return switchTab(key === "PageUp" || (key === "Tab" && event.shiftKey) ? -1 : 1);
    }
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyW") {
      event.preventDefault();
      if (doc) closeDoc(doc);
      return;
    }
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
    if (key === "d" && !event.shiftKey) return cyclePattern();
    if (key === "k") { setLinked(!linked); return say(linked ? "Linked tiles off" : "Linked tiles on: painting a tile paints its identical copies too"); }
    if (key === "f" || (key === "t" && doc?.sel)) return transformSelection(key === "t" ? "turn" : event.shiftKey ? "y" : "x");
    if (key >= "1" && key <= "4") return setShade(Number(key) - 1);
    if (key === "0" && doc?.hasAlpha) return setShade(CLEAR);
    if (key === "[") return tool === "palette" || tool === "priority" ? setCellBrush(Math.max(1, cellBrush - 1)) : setBrush(Math.max(1, brush - 1));
    if (key === "]") return tool === "palette" || tool === "priority" ? setCellBrush(Math.min(3, cellBrush + 1)) : setBrush(Math.min(16, brush + 1));
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
  const latest = useRef({ keyDown, zoomBy, openFiles, pasteClip, writeSession, checkDisk, zoom: doc?.zoom ?? 1 });
  latest.current = { keyDown, zoomBy, openFiles, pasteClip, writeSession, checkDisk, zoom: doc?.zoom ?? 1 };
  // The desktop app's File menu: Close Tab (Ctrl/Cmd+W) closes the open picture, not the window.
  (window as PickerWindow & { __gbcCloseTab?: () => boolean }).__gbcCloseTab = () => { if (!doc) return false; closeDoc(doc); return true; };

  useEffect(() => {
    // The project's palettes come first: reading a picture needs them to recognise colored tiles.
    palettesReady.current = loadProject();
    void palettesReady.current
      .then(() => sessionStore<{ active: number; docs: Omit<Doc, "id" | "undo" | "redo" | "sel" | "float">[] }>("readonly", (objects) => objects.get("open")))
      .then((session) => {
        if (!session?.docs?.length || docs.current.length) return;
        docs.current = session.docs.map((saved, index) => ({ ...saved, palettes: saved.palettes ?? clonePalettes(palettesRef.current), id: index + 1, undo: [], redo: [], sel: null, float: null }));
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

  // The budget view's numbers trail painting by a moment too (finding near matches compares every pair of tiles).
  const usageKey = doc ? `${doc.id}|${editCount.current}|${doc.width}x${doc.height}|${budget.flips}|${doc.float ? "float" : ""}` : "";
  useEffect(() => {
    if (!doc || (!budgetView && sideTab !== "picture") || usage?.key === usageKey) return;
    const timer = window.setTimeout(() => {
      let pixels = doc.pixels;
      if (doc.float) { pixels = pixels.slice(); drop(pixels, doc.width, doc.height, doc.float); }
      setUsage({ key: usageKey, usage: tileUsage(pixels, doc.width, doc.height, budget.flips) });
    }, 300);
    return () => window.clearTimeout(timer);
  });
  const shownUsage = usage && usage.key === usageKey ? usage.usage : null;
  const usedOnce = shownUsage ? shownUsage.uses.reduce((count, value) => count + (value === 1 ? 1 : 0), 0) : 0;
  const nearCount = shownUsage ? shownUsage.near.reduce((count, value) => count + (value >= 0 ? 1 : 0), 0) : 0;
  // The overlay: red tiles are used only once, amber ones nearly match another tile (merge candidates).
  useLayoutEffect(() => {
    const canvas = usageCanvas.current;
    if (!canvas || !doc || !shownUsage) return;
    const cw = Math.ceil(doc.width / CELL), ch = Math.ceil(doc.height / CELL);
    Object.assign(canvas, { width: cw, height: ch });
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, cw, ch);
    shownUsage.uses.forEach((value, cell) => {
      if (value > 1) return;
      context.fillStyle = shownUsage.near[cell] >= 0 ? "rgba(255, 190, 40, .55)" : "rgba(235, 60, 60, .45)";
      context.fillRect(cell % cw, Math.floor(cell / cw), 1, 1);
    });
  });

  // Seamless view: what repeats, drawn from the canvas as shown (palettes and screen look included).
  const seamlessArea = doc && seamless ? (doc.sel && doc.sel.w > 0 && doc.sel.h > 0 ? doc.sel : hoverCell ? { x: hoverCell.x * CELL, y: hoverCell.y * CELL, w: Math.min(CELL, doc.width - hoverCell.x * CELL), h: Math.min(CELL, doc.height - hoverCell.y * CELL) } : null) : null;

  // The priority brush's overlay: tiles that draw over sprites, one canvas pixel per tile.
  useLayoutEffect(() => {
    const canvas = priorityCanvas.current;
    if (!canvas || !doc?.priority) return;
    const cw = cellsWide(doc.width), ch = Math.ceil(doc.height / CELL);
    Object.assign(canvas, { width: cw, height: ch });
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, cw, ch);
    context.fillStyle = "rgba(90, 170, 255, .55)";
    doc.priority.forEach((on, cell) => { if (on) context.fillRect(cell % cw, Math.floor(cell / cw), 1, 1); });
  });

  function mergeNear() {
    if (!doc || !shownUsage || !nearCount) return;
    if (!window.confirm(`Make ${nearCount} tile${nearCount === 1 ? "" : "s"} that differ from another tile in at most 3 pixels into copies of it? This saves ${nearCount} tile${nearCount === 1 ? "" : "s"} of the budget; undo brings them back.`)) return;
    dropFloat(doc);
    pushUndo(doc);
    const merged = mergeNearTiles(doc.pixels, doc.width, doc.height, shownUsage);
    touch(doc);
    say(`Merged ${merged} near-duplicate tile${merged === 1 ? "" : "s"}.`);
  }

  const animations = doc?.asset?.animations ?? [];
  const animation = animations[Math.min(frame.animation, Math.max(0, animations.length - 1))];
  const frames = animation?.frames ?? [];
  const current = frames[Math.min(frame.index, Math.max(0, frames.length - 1))];
  useEffect(() => { setFrame({ animation: 0, index: 0 }); setPlaying(false); }, [activeId]);
  useEffect(() => { void rereadSlots(); }, [project]);
  // Watch the open pictures' files: every 4 seconds while the window is visible, and when it comes back to front.
  useEffect(() => {
    if (!project) return;
    const check = () => { if (document.visibilityState === "visible") void latest.current.checkDisk(); };
    const timer = window.setInterval(check, 4000);
    window.addEventListener("focus", check);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, [project]);
  // Frames play at the sheet's GB Studio speed (60 / (animSpeed + 1) frames a second), else 8 a second.
  const animSpeed = doc?.asset?.animSpeed;
  const fps = animSpeed == null || animSpeed === 255 ? 8 : 60 / (animSpeed + 1);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = window.setInterval(() => setFrame((at) => ({ ...at, index: (at.index + 1) % frames.length })), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [playing, frames.length, fps]);
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
  // The picture is redrawn after every render: the pixels change in place, and `bump` is what announces it.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    if (canvas.width !== doc.width || canvas.height !== doc.height) Object.assign(canvas, { width: doc.width, height: doc.height });
    let pixels = doc.pixels, cells = doc.cells;
    if (doc.float) {
      pixels = pixels.slice();
      drop(pixels, doc.width, doc.height, doc.float);
      // A floating piece on tile edges shows in its own tile palettes.
      if (doc.float.cells) {
        cells = cells.slice();
        dropCells(cells, doc.width, doc.height, doc.float);
      }
    }
    const image = new ImageData(doc.width, doc.height);
    // A mono screen shows only the shades (GB Studio's monochrome mode ignores palettes); a GBC screen dims and mixes colors.
    if (look === "dmg" || look === "pocket") colorize(pixels, cells, doc.width, [shadeLut(LOOK_SHADES[look])], new Uint32Array(image.data.buffer));
    else colorize(pixels, cells, doc.width, luts, new Uint32Array(image.data.buffer));
    if (look === "gbc") gbcCorrect(image.data);
    canvas.getContext("2d")!.putImageData(image, 0, 0);
  });
  // The font sample: each character's glyph copied from the sheet as just drawn, wrapped at the strip's width. In a
  // variable-width font (see-through columns at a glyph's right, magenta in the file) each glyph advances by its width.
  useLayoutEffect(() => {
    const sheet = canvasRef.current, canvas = sampleCanvas.current;
    if (!sheet || !canvas || !doc || !isFont) return;
    const columns = Math.max(1, Math.floor(doc.width / 8)), perLine = 40;
    const lines = sampleText.match(new RegExp(`.{1,${perLine}}(\\s|$)|.{1,${perLine}}`, "g")) ?? [""];
    const widthOf = (sx: number, sy: number) => {
      let width = 8;
      while (width > 1 && Array.from({ length: 8 }, (_, y) => doc.pixels[(sy + y) * doc.width + sx + width - 1] === CLEAR).every(Boolean)) width -= 1;
      return doc.keyMagenta ? width : 8;
    };
    canvas.width = perLine * 8;
    canvas.height = Math.max(1, lines.length) * 8;
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    lines.forEach((line, row) => {
      let pen = 0;
      for (const char of line.trimEnd()) {
        const index = char.charCodeAt(0) - 32;
        if (index < 0 || index >= columns * Math.floor(doc.height / 8)) continue;
        const sx = (index % columns) * 8, sy = Math.floor(index / columns) * 8, width = widthOf(sx, sy);
        context.drawImage(sheet, sx, sy, width, 8, pen, row * 8, width, 8);
        pen += width;
      }
    });
  });

  // The camera's view, copied from the picture as just drawn.
  useLayoutEffect(() => {
    const target = cameraCanvas.current, sheet = canvasRef.current;
    if (!target || !sheet || !camera || !doc) return;
    Object.assign(target, { width: 160, height: 144 });
    const context = target.getContext("2d")!;
    context.fillStyle = "#000";
    context.fillRect(0, 0, 160, 144);
    context.drawImage(sheet, camera.x, camera.y, 160, 144, 0, 0, 160, 144);
  });

  // The seamless view copies the picture as just drawn, so it runs after the drawing above.
  useLayoutEffect(() => {
    const target = seamlessCanvas.current, sheet = canvasRef.current;
    if (!target || !sheet || !seamlessArea) return;
    const { x, y, w, h } = seamlessArea;
    Object.assign(target, { width: w * 3, height: h * 3 });
    const context = target.getContext("2d")!;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, w * 3, h * 3);
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) context.drawImage(sheet, x, y, w, h, column * w, row * h, w, h);
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
          <button className="quiet-button" title={project ? `A new blank picture: in ${project.name} (a new PNG in its assets) or just here` : "A new blank picture"} onClick={() => setShowNew(true)}><FilePlus size={14} />New</button>
          <button className="quiet-button" title="Open PNG files · Ctrl+O (or drop them on the window)" onClick={() => void pickFiles()}><FolderOpen size={14} />Open</button>
          <button className="quiet-button" disabled={!doc} title={`Save every changed picture · Ctrl+S${doc?.asset ? ` (this one over ${doc.asset.file} in the project; old files go to the backups folder)` : doc?.handle ? ` (this one over ${doc.name})` : " (this one asks where)"}`} onClick={() => void save(false)}><Save size={14} />Save</button>
          <button className="quiet-button" disabled={!doc} aria-haspopup="menu" title="Export a copy in the GB greens (Ctrl+E), or an image to share: as shown, scaled up" onClick={(event) => { const r = event.currentTarget.getBoundingClientRect(); setExportMenu({ x: r.left, y: r.bottom + 6 }); }}><Download size={14} />Export</button>
        </span>
        <span className="gbp-seg" role="group" aria-label="Project and palettes">
          {project && <button className={`quiet-button ${showProject ? "active-tool" : ""}`} aria-pressed={showProject} title={`Show or hide the project's pictures (${project.path})`} onClick={() => setShowProject(!showProject)}><FolderTree size={14} />Project</button>}
          {served && !project && <button className="quiet-button" title="Open a GB Studio project folder: its backgrounds, sprites, tilesets and fonts open here and save back into it" onClick={() => void chooseProject()}><FolderTree size={14} />Open project…</button>}
          <button className="quiet-button" title="Palette manager: the project's palettes, a library, and your own" onClick={() => setShowPalettes(true)}><PaletteIcon size={14} />Palettes</button>
          {project && <button className="quiet-button" title="Map Room: grids of screens (Zelda-style), each a background; new screens take their neighbours' edges" onClick={() => setShowMapRoom(true)}><MapIcon size={14} />Maps</button>}
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
        <button className={`icon-button ${budgetView ? "active-tool" : ""}`} aria-label="Tile budget view" aria-pressed={budgetView} title="Tile budget view: red tiles are used only once; amber ones nearly match another tile (Picture tab can merge them)" onClick={() => setBudgetView(!budgetView)}><ScanSearch size={15} /></button>
        <button className={`icon-button ${camera ? "active-tool" : ""}`} aria-label="Camera walk" aria-pressed={Boolean(camera)} title="Camera walk: drag a 160 × 144 screen across the picture and see what the player sees" onClick={() => setCamera(camera ? null : { x: 0, y: 0 })}><Video size={15} /></button>
        <button className={`icon-button ${screens ? "active-tool" : ""}`} aria-label="Game Boy screens" aria-pressed={screens} title="Game Boy screens: outline every 160 × 144 area (one screen) on the picture" onClick={() => { setScreens(!screens); store(SCREENS_KEY, !screens); }}><Tv size={15} /></button>
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
          <ProjectPanel
            project={project}
            kind={projectKind}
            onKind={setProjectKind}
            slotsVersion={slotsVersion}
            stateOf={(asset) => { const open = docs.current.find((item) => item.asset?.kind === asset.kind && item.asset.file === asset.file); return { open: Boolean(open), active: Boolean(open && open.id === activeId), dirty: Boolean(open?.dirty) }; }}
            onOpen={(asset) => void openAsset(asset)}
            onMenu={(asset, x, y) => setAssetMenu({ x, y, asset })}
          />
        )}
        <aside className="gbp-tools pixel-toolbar vertical" role="toolbar" aria-label="Paint tools">
          {TOOLS.map(([id, label, Icon, keys]) => <button key={id} className={`tool-button ${tool === id ? "active" : ""}`} aria-label={label} aria-pressed={tool === id} title={`${label} · ${keys}`} onClick={() => setTool(id)}><Icon size={17} /></button>)}
          <button className={`tool-button ${seamless ? "active" : ""}`} aria-label="Seamless view" aria-pressed={seamless} title="Seamless view: the tile under the pointer (or the selection) repeated 3 × 3 above the picture, to check it tiles cleanly" onClick={() => setSeamless(!seamless)}><Grid2x2 size={17} /></button>
          <button className={`tool-button ${linked ? "active" : ""}`} aria-label="Linked tiles" aria-pressed={linked} title="Linked tiles: painting a tile paints every identical copy of it too (one-color tiles are not linked) · K" onClick={() => setLinked(!linked)}><Link2 size={17} /></button>
          <button className={`tool-button ${mirror !== "off" ? "active" : ""}`} aria-label={MIRROR_LABEL[mirror]} title={`${MIRROR_LABEL[mirror]}: paint both halves at once · Shift+M`} onClick={() => setMirror(MIRRORS[(MIRRORS.indexOf(mirror) + 1) % MIRRORS.length])}><FlipHorizontal2 size={17} /></button>
          {(tool === "fill" || tool === "rectFill") && (
            <button className={`tool-button gbp-pattern ${pattern !== "solid" ? "active" : ""}`} aria-label={`Fill pattern: ${PATTERNS.find((item) => item.id === pattern)?.label}`} title={`Fill pattern: ${PATTERNS.find((item) => item.id === pattern)?.label} · D for the next`} onClick={cyclePattern}>
              <span className={`gbp-pattern-swatch ${pattern}`} />
            </button>
          )}
          {tool === "palette" || tool === "priority" ? (
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
              <button className="icon-button small" aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : animSpeed == null ? "Play the animation (8 frames a second)" : animSpeed === 255 ? "Play the frames (GB Studio's speed is None: it doesn't animate this sheet; 8 a second here)" : `Play the animation at GB Studio's speed ${[127, 63, 31, 15, 7, 3, 1, 0].indexOf(animSpeed) + 1 || "?"} (${Math.round(fps * 100) / 100} frames a second)`} disabled={frames.length < 2} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={12} /> : <Play size={12} />}</button>
              <div className="gbp-frames-list">
                {frames.map((_, index) => (
                  <button key={index} className={`gbp-frame ${index === frame.index ? "selected" : ""}`} title={`Frame ${index + 1}`} onClick={() => { setFrame({ ...frame, index }); setPlaying(false); }}>
                    <canvas ref={(element) => { frameCanvases.current[index] = element; }} />
                    <small>{index + 1}</small>
                  </button>
                ))}
              </div>
              <span className="gbp-frames-label">{animations.length > 1 ? animation.name : "frame"} {frame.index + 1} of {frames.length}</span>
              {project && project.assets.some((asset) => asset.kind === "backgrounds") && <button className="quiet-button" title="See this animation on one of the project's backgrounds, to check contrast and palette clashes" onClick={() => setOnBackground(composeFrames())}>On a background…</button>}
            </div>
          )}
          {doc?.changedOnDisk && !doc.changedOnDisk.kept && (
            <div className="gbp-disk-bar" role="alert">
              <span><b>{doc.name}</b> changed on disk (GB Studio or another app saved it) while you have unsaved changes here.</span>
              <span className="gbp-spacer" />
              <button className="quiet-button primary" onClick={() => { if (window.confirm(`Reload ${doc.name} from disk? Your unsaved changes here are lost.`)) { const target = doc; target.changedOnDisk = undefined; void reloadAsset(target); } }}>Reload from disk</button>
              <button className="quiet-button" title="Keep painting; Save will ask before replacing the file on disk" onClick={() => { doc.changedOnDisk = { ...doc.changedOnDisk!, kept: true }; bump(); }}>Keep mine</button>
            </div>
          )}
          {doc && camera && (
            <div className="gbp-frames gbp-seamless gbp-camera-strip" role="group" aria-label="Camera view">
              <span className="gbp-frames-label">camera at {camera.x}, {camera.y} · tile {camera.x >> 3}, {camera.y >> 3} · drag its handle on the picture (Shift snaps to tiles)</span>
              <canvas ref={cameraCanvas} style={{ width: 320, height: 288 }} />
            </div>
          )}
          {doc && seamless && (
            <div className="gbp-frames gbp-seamless" role="group" aria-label="Seamless view">
              <span className="gbp-frames-label">{seamlessArea ? (doc.sel ? `selection ${seamlessArea.w} × ${seamlessArea.h}` : `tile ${hoverCell!.x}, ${hoverCell!.y}`) : "point at a tile"} · repeated 3 × 3</span>
              {seamlessArea && <canvas ref={seamlessCanvas} style={{ width: seamlessArea.w * 3 * Math.max(2, Math.min(8, Math.floor(96 / Math.max(seamlessArea.w, seamlessArea.h)))), height: seamlessArea.h * 3 * Math.max(2, Math.min(8, Math.floor(96 / Math.max(seamlessArea.w, seamlessArea.h)))) }} />}
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
                {budgetView && <canvas ref={usageCanvas} className="gbp-usage" />}
                {tool === "priority" && doc.priority && <canvas ref={priorityCanvas} className="gbp-usage gbp-priority" />}
                {camera && (
                  <div className="gbp-camera" style={{ left: camera.x * doc.zoom, top: camera.y * doc.zoom, width: 160 * doc.zoom, height: 144 * doc.zoom }}>
                    <span className="gbp-camera-handle" title="Drag to move the camera (Shift snaps to tiles)"
                      onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); const box = wrapRef.current!.getBoundingClientRect(); cameraDrag.current = { dx: (event.clientX - box.left) / doc.zoom - camera.x, dy: (event.clientY - box.top) / doc.zoom - camera.y }; }}
                      onPointerMove={(event) => {
                        if (!cameraDrag.current) return;
                        event.stopPropagation();
                        const box = wrapRef.current!.getBoundingClientRect();
                        let x = Math.round((event.clientX - box.left) / doc.zoom - cameraDrag.current.dx), y = Math.round((event.clientY - box.top) / doc.zoom - cameraDrag.current.dy);
                        if (event.shiftKey) { x = Math.round(x / 8) * 8; y = Math.round(y / 8) * 8; }
                        setCamera({ x: Math.max(0, Math.min(Math.max(0, doc.width - 160), x)), y: Math.max(0, Math.min(Math.max(0, doc.height - 144), y)) });
                      }}
                      onPointerUp={(event) => { event.stopPropagation(); cameraDrag.current = null; }}>camera ⠿</span>
                  </div>
                )}
                {screens && <div className="gbp-screens" style={{ backgroundSize: `${160 * doc.zoom}px ${144 * doc.zoom}px` }} />}
                {current && current.tiles.map((tile, index) => <div key={index} className="gbp-frame-slice" style={{ left: tile.sliceX * doc.zoom, top: tile.sliceY * doc.zoom, width: 8 * doc.zoom, height: 16 * doc.zoom }} />)}
                {doc.sel && <div className={`gbp-selection ${doc.float ? "floating" : ""}`} style={{ left: doc.sel.x * doc.zoom, top: doc.sel.y * doc.zoom, width: doc.sel.w * doc.zoom, height: doc.sel.h * doc.zoom }} />}
                <div className="gbp-brush-outline" ref={brushRef} />
              </div>
            </div>
          ) : served && !project ? (
            <StartScreen recent={recent} onChooseProject={() => void chooseProject()} onDemo={() => void chooseProject(true)} onOpenFiles={() => void pickFiles()} onOpenRecent={(path) => void openProjectPath(path)} />
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
                  {closeShades(picked.colors, Boolean(doc.keyGreen)).map(({ a, b, delta }) => <p key={`${a}-${b}`} className="gbp-note gbp-pm-warn">Colors {a + 1} and {b + 1} are hard to tell apart (difference {delta}; aim for 12 or more).</p>)}
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
                <>
                <dl>
                  <dt>Picture</dt><dd>{doc.name}</dd>
                  <dt>Size</dt><dd>{doc.width} × {doc.height} px · {Math.ceil(doc.width / CELL)} × {Math.ceil(doc.height / CELL)} tiles</dd>
                  {doc.asset && <><dt>File</dt><dd>assets/{doc.asset.kind}/{doc.asset.file}</dd></>}
                  <dt>Unique tiles</dt><dd>{tileCount} of {budget.limit}</dd>
                </dl>
                <button className="quiet-button" title="A new size in whole tiles" onClick={() => setShowResize(true)}>Resize…</button>
                <div className="gbp-budget">
                  <span className="eyebrow">Where the tiles go</span>
                  {shownUsage ? <p className="gbp-note">{tileCount} different tiles; {usedOnce} used only once{nearCount ? `, ${nearCount} of them within 3 pixels of another tile` : ""}.</p> : <p className="gbp-note">Counting…</p>}
                  <span className="gbp-budget-actions">
                    <button className={`quiet-button ${budgetView ? "active-tool" : ""}`} onClick={() => setBudgetView(!budgetView)}>{budgetView ? "Hide" : "Show"} on the picture</button>
                    <button className="quiet-button" disabled={!nearCount} title="Each tile within 3 pixels of another becomes a copy of it (undoable)" onClick={mergeNear}>Merge {nearCount || ""} near matches</button>
                  </span>
                </div>
                </>
              ) : <p className="gbp-note">No picture open.</p>}
              <label className="gbp-field">Tile budget
                <select aria-label="Tile budget" value={budget.id} onChange={(event) => setBudgetId(event.target.value)}>
                  {BUDGETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="gbp-field" title="How the picture shows while you paint, like a real Game Boy screen. Never saved.">Screen
                <select aria-label="Screen" value={look} onChange={(event) => { const next = event.target.value as Look; setLook(next); store(LOOK_KEY, next); }}>
                  <option value="plain">Plain (as the file and palettes say)</option>
                  <option value="dmg">Game Boy (green LCD, shades only)</option>
                  <option value="pocket">Game Boy Pocket (grey, shades only)</option>
                  <option value="gbc">Game Boy Color (its screen's colors)</option>
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
        {look !== "plain" && <button className="gbp-look-tag" title="The picture shows like a real screen (Picture tab → Screen); the file is unchanged. Click for plain." onClick={() => { setLook("plain"); store(LOOK_KEY, "plain"); }}>{look === "dmg" ? "Game Boy screen" : look === "pocket" ? "Pocket screen" : "GBC screen"} ×</button>}
        {doc?.sel && <span>sel {doc.sel.w} × {doc.sel.h} at {doc.sel.x}, {doc.sel.y}</span>}
        {doc && <span title={doc.asset ? `assets/${doc.asset.kind}/${doc.asset.file}` : doc.name}>{doc.width} × {doc.height} · {doc.width / CELL} × {doc.height / CELL} tiles</span>}
      </footer>
      {toast && <div className="gbp-toast" role="status">{toast}</div>}
      {projectMenu && (
        <Menu x={projectMenu.x} y={projectMenu.y} width={260} height={300} onClose={() => setProjectMenu(null)}>
            <button role="menuitem" onClick={() => { setProjectMenu(null); void chooseProject(); }}>Open another project…</button>
            <button role="menuitem" onClick={() => { setProjectMenu(null); void chooseProject(true); }}>Open the demo project</button>
            {project && /[\\/]demo-project$/.test(project.path) && <button role="menuitem" title="Your painted copy goes to the backups folder; a fresh copy of the demo opens" onClick={() => { setProjectMenu(null); void chooseProject(true, true); }}>Reset the demo project…</button>}
            {recent.filter((item) => item.path !== project?.path).length > 0 && <><hr /><span className="gbp-menu-label">Recent</span></>}
            {recent.filter((item) => item.path !== project?.path).slice(0, 5).map((item) => <button key={item.path} role="menuitem" title={item.path} onClick={() => { setProjectMenu(null); void openProjectPath(item.path); }}>{item.name}</button>)}
            {project && <>
              <hr />
              <button role="menuitem" onClick={() => { setProjectMenu(null); void fetch("./__cartographer/reveal", { method: "POST" }); }}>{FILE_MANAGER_LABEL}</button>
              <button role="menuitem" onClick={() => { setProjectMenu(null); setShowMapRoom(true); }}>Map Room…</button>
              <button role="menuitem" onClick={() => { setProjectMenu(null); setShowHealth(true); }}>Project health…</button>
              <button role="menuitem" onClick={() => { setProjectMenu(null); setShowDialogue(true); }}>Dialogue box…</button>
              <button role="menuitem" onClick={() => { setProjectMenu(null); setBackups({}); }}>Backups…</button>
              <button role="menuitem" onClick={() => { setProjectMenu(null); void fetch("./__cartographer/reveal?backups=1", { method: "POST" }); }}>Show backups folder</button>
              <hr />
              <button role="menuitem" onClick={() => { setProjectMenu(null); void closeProject(); }}>Close project</button>
            </>}
            <hr />
            <button role="menuitem" onClick={() => { setProjectMenu(null); setShowAbout(true); }}>About GB Cartographer</button>
        </Menu>
      )}
      {exportMenu && doc && (
        <Menu x={exportMenu.x} y={exportMenu.y} width={300} height={320} className="gbp-export-menu" onClose={() => setExportMenu(null)}>
          <button role="menuitem" onClick={() => { setExportMenu(null); void save(true); }}>Copy of the file, in the GB greens <kbd>Ctrl+E</kbd></button>
          <hr />
          <span className="gbp-menu-label">Image as shown, in its palettes</span>
          <div className="gbp-menu-row">{[1, 2, 3, 4, 6, 8].map((scale) => <button key={scale} role="menuitem" title={`${doc.width * scale} × ${doc.height * scale} px`} onClick={() => { setExportMenu(null); void exportImage(scale, true); }}>{scale}×</button>)}</div>
          {frames.length > 1 && <>
            <span className="gbp-menu-label">Animation as GIF{animations.length > 1 && animation?.name ? ` · ${animation.name}` : ""}</span>
            <div className="gbp-menu-row">{[1, 2, 4, 6, 8].map((scale) => <button key={scale} role="menuitem" title={`${frames.length} frames at GB Studio's speed`} onClick={() => { setExportMenu(null); void exportGif(scale); }}>{scale}×</button>)}</div>
          </>}
          <span className="gbp-menu-label">Image in the GB greens</span>
          <div className="gbp-menu-row">{[1, 2, 3, 4, 6, 8].map((scale) => <button key={scale} role="menuitem" title={`${doc.width * scale} × ${doc.height * scale} px`} onClick={() => { setExportMenu(null); void exportImage(scale, false); }}>{scale}×</button>)}</div>
        </Menu>
      )}
      {slotMenu && doc && docPalettes[slotMenu.palette - 1] && (
        <Menu x={slotMenu.x} y={slotMenu.y} width={300} height={450} className="gbp-slot-menu" onClose={() => setSlotMenu(null)}>
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
        </Menu>
      )}
      {assetMenu && (
        <Menu x={assetMenu.x} y={assetMenu.y} width={220} height={200} onClose={() => setAssetMenu(null)}>
            <button role="menuitem" onClick={() => { void openAsset(assetMenu.asset); setAssetMenu(null); }}>Open</button>
            <button role="menuitem" onClick={() => { void fetch(`./__cartographer/reveal?${assetQuery(assetMenu.asset)}`, { method: "POST" }); setAssetMenu(null); }}>{FILE_MANAGER_LABEL}</button>
            <button role="menuitem" onClick={() => { void navigator.clipboard?.writeText(`${project?.path ?? ""}/assets/${assetMenu.asset.kind}/${assetMenu.asset.file}`).then(() => say("Copied the file path")); setAssetMenu(null); }}>Copy file path</button>
            <button role="menuitem" onClick={() => { setBackups({ file: `assets/${assetMenu.asset.kind}/${assetMenu.asset.file}` }); setAssetMenu(null); }}>Earlier versions…</button>
            <hr />
            <button role="menuitem" onClick={() => { void fetch("./__cartographer/reveal", { method: "POST" }); setAssetMenu(null); }}>Show project folder</button>
        </Menu>
      )}
      {showHelp && <HelpWindow onClose={() => setShowHelp(false)} onAbout={() => { setShowHelp(false); setShowAbout(true); }} />}
      {showAbout && <AboutWindow onClose={() => setShowAbout(false)} />}
      {onBackground && project && <SpriteOnBackground backgrounds={project.assets.filter((asset) => asset.kind === "backgrounds")} frames={onBackground} fps={fps} onClose={() => setOnBackground(null)} />}
      {showMapRoom && project && <MapRoom project={project} onClose={() => setShowMapRoom(false)} onOpen={(asset) => { setProjectKind("backgrounds"); void openAsset(asset); }} onProjectChanged={async () => { await loadProject(); setSlotsVersion((value) => value + 1); }} onExport={(blob, name) => saveBlob(blob, name, PNG_TYPES)} say={say} />}
      {showDialogue && project && <DialoguePreview backgrounds={project.assets.filter((asset) => asset.kind === "backgrounds")} hasFrame={project.assets.some((asset) => asset.kind === "ui" && asset.file === "frame.png")} onClose={() => setShowDialogue(false)} />}
      {showHealth && project && <HealthWindow projectName={project.name} onClose={() => setShowHealth(false)} onOpen={(kind, file) => { const asset = project.assets.find((item) => item.kind === kind && item.file === file); if (asset) { setProjectKind(kind); void openAsset(asset); } }} />}
      {showNew && <NewPictureWindow projectName={project?.name ?? null} initialKind={projectKind} onClose={() => setShowNew(false)} onCreate={createPicture} />}
      {showResize && doc && <ResizeWindow width={doc.width} height={doc.height} sprite={doc.asset?.kind === "sprites"} inProject={Boolean(doc.asset)} onClose={() => setShowResize(false)} onResize={resizePicture} />}
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
          onRemoveProject={async (id, name) => {
            if (!await okToWriteProjectJson()) return false;
            const response = await fetch("./__cartographer/gbstudio-palette-remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
            const result = response ? await response.json().catch(() => null) as { ok?: boolean; error?: string } | null : null;
            if (!response?.ok || !result?.ok) { say(`${name} stays: ${result?.error ?? "no answer"}`); return false; }
            await loadProject();
            say(`${name} was taken out of the project (Backups… can put it back).`);
            return true;
          }}
          onSlotMenu={doc?.asset?.slots?.length ? (id, x, y) => { const index = docPalettes.findIndex((item) => item.id === id); if (index >= 0) setSlotMenu({ x, y, palette: index + 1 }); else say("Open a picture of this project to put its palettes in slots."); } : undefined}
        />
      )}
    </div>
  );
}
