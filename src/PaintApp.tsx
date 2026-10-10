/**
 * GB Cartographer: a small painter for GB Studio pictures (backgrounds, sprite sheets, tilesets) and any Game Boy PNG.
 * Each open file is one flat picture in the four GB shades; tiles (8 × 8) may wear a palette from the project.
 * A tint only changes how the plain tiles look while painting. Saving writes one flat PNG, and for a project
 * picture also its tile palettes (see server/endpoints.ts).
 */
import { ChevronDown, Clock, Copy, ImagePlus, FolderArchive, FolderSearch, FolderX, Gamepad2, History, Info, MessageSquare, RotateCcw, FilePlus, FolderOpen, FolderTree, Grid3x3, Magnet, Map as MapIcon, Minus, SwatchBook, Plus, Redo2, Rocket, Save, Undo2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { LogoMark } from "./ui/LogoMark";
import { applyFont, loadFont, type FontChoice } from "./ui/theme";
import PaletteManager from "./PaletteManager";
import BackupsWindow from "./BackupsWindow";
import { attachMiddlePan, attachWheelZoom, nextStep } from "./ui/wheelZoom";
import { CELL, CLEAR, GB_SHADES, KEY_GREEN, KEY_MAGENTA, assignSlots, spriteShades, cellsWide, clipRect, colorize, countUniqueTiles, drop, fillRect, PATTERNS, type Pattern, mergeNearTiles, tileUsage, type TileUsage, dropCells, flipFloat, gbcCorrect, LOOK_SHADES, type Look, lift, liftCells, onTiles, rotateFloat, namedSlot, quantize, shadeLut, toRgba, type Floating, type Mirror, type Palette } from "./paint";
import { ASSET_URL, BUDGETS, BUDGET_KEY, BUILT_IN_TINTS, CUSTOM_TINT_KEY, FILE_MANAGER_LABEL, GRID_KEY, MIRRORS, NAMED_SLOTS_KEY, SCREENS_KEY, LOOK_KEY, PATTERN_KEY, PNG_TYPES, PROJECT_KIND_KEY, PROJECT_PANEL_KEY, PROJECT_URL, TINT_KEY, UI_SLOT, UNDO_BYTES, UNDO_LIMIT, ZOOMS, hasSlots, isKeyed, versionTime, type Asset, type AssetInfo, type AssetKind, type Doc, type FileHandle, type Opening, type PickerWindow, type Point, type Project, type ToolId } from "./app/model";
import { TOOLS } from "./app/tools";
import { readStored, sessionStore, store } from "./app/storage";
import { HelpWindow } from "./app/HelpWindow";
import { AboutWindow } from "./app/AboutWindow";
import { HealthWindow } from "./app/HealthWindow";
import { SpriteOnBackground } from "./app/SpriteOnBackground";
import { DialoguePreview } from "./app/DialoguePreview";
import { MapRoom } from "./app/MapRoom";
import { FitWindow } from "./app/FitWindow";
import { PictureWizard } from "./app/PictureWizard";
import { DnsWizard } from "./app/DnsWizard";
import { BudgetFixer } from "./app/BudgetFixer";
import { CheckupWizard } from "./app/CheckupWizard";
import { NewBackgroundWizard, type NewBackground } from "./app/NewBackgroundWizard";
import type { FitResult } from "./app/pictureFit";
import { NewPictureWindow, ResizeWindow, type NewPicture } from "./app/NewPictureWindow";
import { Button, Chip, IconButton, Kbd, Menu, MenuAt, TabList, Tabs, Tooltip, type MenuEntry } from "./ui/kit";
import "./app/shell.css";
import { StartScreen } from "./app/StartScreen";
import { ProjectPanel } from "./app/ProjectPanel";
import { encodeGif } from "./gb/gif";
import { framesOf, saveFile } from "./app/files";
import { ToolColumn } from "./app/ToolColumn";
import { PicturePane } from "./app/PicturePane";
import { usePainting } from "./app/usePainting";
import { PhPiggyBank, PhSticker, PxCloudMoon, PxGamepad, PxHeart, PxLightbulb, PxRobotHappy, PxSnake } from "./ui/setIcons";
import { PalettesPane } from "./app/PalettesPane";
import { FramesStrip } from "./app/FramesStrip";
import { StampsStrip } from "./app/StampsStrip";
import { TextStrip, type TextSettings } from "./app/TextStrip";
import { readFontSheet, renderText, type FontSheet } from "./app/textTool";
import { SaveStampDialog, type StampSave } from "./app/SaveStampDialog";

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
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const seamlessCanvas = useRef<HTMLCanvasElement>(null);
  /** The fill pattern for Flood fill and Filled rectangle (D cycles it). */
  const [pattern, setPattern] = useState<Pattern>(() => readStored(PATTERN_KEY, "solid"));
  const cyclePattern = () => { const next = PATTERNS[(PATTERNS.findIndex((item) => item.id === pattern) + 1) % PATTERNS.length]; setPattern(next.id); store(PATTERN_KEY, next.id); say(`Fill pattern: ${next.label}`); };
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
  const [showPictureWizard, setShowPictureWizard] = useState(false);
  /** The wizard open (W2…W8 from the Wizards menu), if any. */
  const [wizard, setWizard] = useState<"dns" | "paletteSet" | "newBackground" | "budget" | "checkup" | null>(null);
  const [stampSave, setStampSave] = useState<{ hint: string; resolve: (save: StampSave | null) => void } | null>(null);
  const [showDialogue, setShowDialogue] = useState(false);
  const [showMapRoom, setShowMapRoom] = useState(false);
  /** Fit to GB Studio's colors: the picture as shown (its colors), when open. */
  const [fitting, setFitting] = useState<Uint8ClampedArray | null>(null);
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
  /** The text tool: font, words and look, and the floating text it made (while it floats). */
  const [textSettings, setTextSettings] = useState<TextSettings>({ font: "", text: "Hello!", ink: 3, invert: false, box: false });
  const textFloat = useRef<Floating | null>(null);
  const fontSheets = useRef(new Map<string, FontSheet>());
  /** The selection's right-click menu: use or save it as a stamp, copy. */
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number } | null>(null);
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
  const clip = useRef<Floating | null>(null);
  /** The palettes of the picture a clip was copied from, so its tile palettes land on the same palettes when pasted. */
  const clipPalettes = useRef<Palette[]>([]);
  const lastRecolor = useRef(0);
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
  const { takeStamp, setStamp, pointerDown, pointerMove, pointerUp } = usePainting({
    doc, tool, shade, brush, cellBrush, mirror, pattern, linked, snap, seamless, activePalette, hoverCell,
    wrapRef, scrollerRef, readoutRef, brushRef, spaceDown, paintTool,
    setShade, setActivePalette, setHoverCell, setToolState, say, pushUndo, touch, bump, floatSelection, dropFloat, moveFloat, clonePalettes, blank,
    onSelectionMenu: (x, y) => setSelectionMenu({ x, y }),
    onPlaceText: (point) => void placeText(point),
  });

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
        const opened: Doc = { id, ...(handle && !asset ? { fileTime: file.lastModified } : {}), name: asset?.name ?? file.name, width: bitmap.width, height: bitmap.height, pixels: picture.pixels, cells: picture.cells, ...(flags ? { priority: Uint8Array.from(flags) } : {}), hasAlpha: picture.hasAlpha || keyGreen, palettes: picture.palettes, undo: [], redo: [], dirty: false, handle, asset: asset && info ? { kind: asset.kind, file: asset.file, name: asset.name, mtime: info.mtime, ...(hasSlots(asset.kind) ? { slots: info.slots, slotScene: info.slotScene ?? null, metaMtime: info.metaMtime, opened: info.tileColors.map((value) => value < 0 ? -1 : value & 7), ...(flags ? { openedPriority: flags } : {}) } : {}), ...(asset.kind === "sprites" && info.animations?.length ? { animations: info.animations, animSpeed: info.animSpeed ?? null } : {}), ...(asset.kind === "backgrounds" && info.parallax?.length ? { parallax: info.parallax } : {}), project: projectRef.current?.path, ...(info.autoColor ? { autoColor: true } : {}) } : undefined, keyGreen: keyGreen || undefined, ...(keyMagenta ? { keyMagenta: true } : {}), zoom: old >= 0 ? docs.current[old].zoom : fitZoom(bitmap.width, bitmap.height), sel: null, float: null };
        if (old >= 0) docs.current[old] = opened;
        else docs.current.push(opened);
        if (old >= 0) continue;
        const made = picture.palettes.length - palettesRef.current.length;
        if (info?.autoColor) say(`${asset?.name ?? file.name} uses GB Studio's Automatic color: GB Studio reads its colors from the PNG itself. Saving here writes the four greens and loses them; Save asks first.`);
        else if (picture.snapped) say(`${file.name}: ${picture.snapped} color${picture.snapped === 1 ? "" : "s"} read as the same shade as another color in their tile (GB Studio reads colors by their green), so they show alike, as in GB Studio.`);
        else if (made) say(`${file.name}: tiles in colors outside the library keep them as ${made} palette${made === 1 ? "" : "s"} of the file.${made > 8 ? " GB Studio allows 8 a scene: Picture tab → Fit to 8 palettes shows what fitting changes." : ""} Save writes the greens GB Studio reads the colors as.`);
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
  async function createPicture({ kind, name, width, height, pixels: start }: NewPicture): Promise<boolean> {
    const keyed = kind ? isKeyed(kind) : false;
    const pixels = start && start.length === width * height ? start.slice() : new Uint8Array(width * height).fill(keyed ? CLEAR : 0);
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
    const notes = [asset.kind === "stamps" ? `Saved the stamp ${asset.name} (Cartographer/stamps)` : `Saved ${asset.name} into the GB Studio project`];
    if (hasSlots(asset.kind) && asset.slots?.length) {
      // A picture GB Studio hasn't read yet has no .gbsres to hold its tile palettes: look again (GB Studio may have
      // made one since), else keep the picture unsaved with its palettes until it has.
      if (asset.metaMtime == null) {
        const info = await fetch(`${ASSET_URL}-info?${assetQuery(asset)}`, { cache: "no-cache" }).then((response) => response.ok ? response.json() as Promise<AssetInfo> : null).catch(() => null);
        if (info?.metaMtime != null) Object.assign(asset, { metaMtime: info.metaMtime, opened: info.tileColors.map((value) => value < 0 ? -1 : value & 7) });
      }
      if (asset.metaMtime == null && target.cells.some(Boolean)) {
        target.dirty = true;
        notes.push("Its tile palettes wait: GB Studio hasn't read this picture yet. Open the project in GB Studio once (it adds the picture's settings file), then Save here again");
      } else notes.push(...await saveTileColors(target));
    }
    if (asset.kind === "stamps") notes.push(...await saveStampMeta(target));
    say(notes.join(". "));
    return true;
  }


  /** Puts palettes in slots 1…n of what a picture reads (a scene's palettes, or the project's defaults until a scene shows it). */
  async function putInSlots(asset: Asset, ids: string[]) {
    for (const [slot, paletteId] of ids.entries()) {
      await fetch(`./__cartographer/gbstudio-palette-slot?${assetQuery(asset)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot, paletteId }) }).catch(() => null);
    }
  }

  /** W4: a blank background, and with a library set its palettes added and put in the default slots. */
  async function createBackground({ name, width, height, palettes: set }: NewBackground): Promise<boolean> {
    if (set?.length && !window.confirm(`Add the ${set.length} palettes to the project and put them in its default background slots 1–${set.length}?\n\nEvery scene without its own palettes uses the defaults (the old ones are backed up).`)) return false;
    if (!await createPicture({ kind: "backgrounds", name, width, height })) return false;
    if (!set?.length) return true;
    if (!await okToWriteProjectJson()) return true;
    const ids: string[] = [];
    for (const palette of set) {
      const existing = projectRef.current?.palettes.find((item) => item.name === palette.name && item.colors.join() === palette.colors.join());
      const id = existing?.id ?? await writeProjectPalette(palette);
      if (id) ids.push(id);
    }
    await loadProject();
    const asset = projectRef.current?.assets.find((item) => item.kind === "backgrounds" && item.name === name);
    if (asset) await putInSlots(asset, ids);
    await rereadSlots();
    setSlotsVersion((value) => value + 1);
    say(`Made ${name} with ${ids.length} palettes in the default slots.`);
    return true;
  }

  /** Takes a palette nothing uses out of the project (it moves to the backups). */
  async function removeProjectPalette(id: string, name: string): Promise<boolean> {
    if (!await okToWriteProjectJson()) return false;
    const response = await fetch("./__cartographer/gbstudio-palette-remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    const result = response ? await response.json().catch(() => null) as { ok?: boolean; error?: string } | null : null;
    if (!response?.ok || !result?.ok) { say(`${name} stays: ${result?.error ?? "no answer"}`); return false; }
    await loadProject();
    say(`${name} was taken out of the project (Backups… can put it back).`);
    return true;
  }

  /** Opens a project picture by kind and file (Health, the check-up). */
  async function openByFile(kind: string, file: string) {
    const asset = projectRef.current?.assets.find((item) => item.kind === kind && item.file === file);
    if (!asset) return false;
    setProjectKind(asset.kind);
    await openAsset(asset);
    return true;
  }

  /** Adds palettes to the project (after the GB Studio check); returns how many were written. */
  async function addPalettes(list: { name: string; colors: string[] }[]): Promise<number> {
    if (!list.length || !await okToWriteProjectJson()) return 0;
    let written = 0;
    for (const palette of list) if (await writeProjectPalette(palette)) written += 1;
    await loadProject();
    setSlotsVersion((value) => value + 1);
    return written;
  }

  // ---- Picture to background (W1, 2026-10-10) ----------------------------------------------------------------------

  /** The wizard's result as an untitled picture here: its palettes are palettes of the file. */
  async function openFittedPicture(result: FitResult, name: string) {
    await palettesReady.current;
    const id = newDocId(docs.current);
    const palettes = clonePalettes(palettesRef.current);
    const first = palettes.length;
    result.palettes.forEach((colors, index) => palettes.push({ name: `${name} ${index + 1}`, colors: [...colors] }));
    docs.current.push({ id, name: `${name.replace(/\.png$/i, "")}.png`, width: result.width, height: result.height, pixels: result.pixels.slice(), cells: Uint8Array.from(result.cells, (wear) => wear ? first + wear : 0), hasAlpha: false, palettes, undo: [], redo: [], dirty: true, zoom: fitZoom(result.width, result.height), sel: null, float: null });
    setActiveId(id);
    setShowPictureWizard(false);
    scheduleSession();
    bump();
    say(`${name}: ${result.palettes.length} palettes of the file. Save asks where it goes.`);
  }

  /**
   * The wizard's result as a new background in the project: the PNG (in GB greens) goes to assets/backgrounds, the
   * palettes are added to the project and put in the default slots 1…n, and the tiles' slots are written.
   */
  async function saveFittedBackground(result: FitResult, name: string): Promise<boolean> {
    if (!projectRef.current) return false;
    // The default slots are what every scene without its own palettes uses: say so before changing them.
    const count = result.palettes.length;
    if (!window.confirm(`Make assets/backgrounds/${name}.png and add its ${count} palette${count === 1 ? "" : "s"} to the project?\n\nThey go in the project's default background slots 1–${count}, which every scene without its own palettes uses (the old defaults are backed up). Put them in a scene's own slots later with Put in slot.`)) return false;
    if (!await okToWriteProjectJson()) return false;
    const ids: string[] = [];
    for (const [index, colors] of result.palettes.entries()) {
      const id = await writeProjectPalette({ name: `${name} ${index + 1}`, colors: [...colors] });
      if (!id) { say("Not every palette could be added to the project; nothing else changed."); return false; }
      ids.push(id);
    }
    const canvas = document.createElement("canvas");
    Object.assign(canvas, { width: result.width, height: result.height });
    canvas.getContext("2d")!.putImageData(new ImageData(toRgba(result.pixels, result.cells, result.width, []), result.width, result.height), 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((made) => made ? resolve(made) : reject(new Error("No PNG")), "image/png"));
    const response = await fetch(`./__cartographer/gbstudio-new-asset?${new URLSearchParams({ kind: "backgrounds", name })}`, { method: "POST", body: blob }).catch(() => null);
    const made = response ? await response.json().catch(() => null) as { ok?: boolean; error?: string; file?: string } | null : null;
    if (!response?.ok || !made?.ok || !made.file) { say(`Could not make the background: ${made?.error ?? response?.statusText ?? "no answer"}`); return false; }
    await loadProject();
    setProjectKind("backgrounds");
    const asset = projectRef.current?.assets.find((item) => item.kind === "backgrounds" && item.file === made.file);
    if (!asset) { say(`Made assets/backgrounds/${made.file}, but it could not be opened.`); return true; }
    await putInSlots(asset, ids);
    await openAsset(asset);
    const target = docs.current.find((item) => item.asset?.kind === "backgrounds" && item.asset.file === made.file);
    if (target) {
      target.cells = Uint8Array.from(result.cells, (wear) => { const at = wear ? target.palettes.findIndex((palette) => palette.id === ids[wear - 1]) : -1; return at < 0 ? 0 : at + 1; });
      if (target.asset) target.asset.slots = ids.concat(target.asset.slots?.slice(ids.length) ?? []);
      touch(target);
      await saveDoc(target, false, false);
    }
    await rereadSlots();
    setSlotsVersion((value) => value + 1);
    say(`Made assets/backgrounds/${made.file} with ${ids.length} palettes in slots 1–${ids.length}.${target?.dirty ? " Its tile palettes wait until GB Studio has read the project once: then Save it here again." : ""}`);
    return true;
  }

  // ---- the text tool (W5) ------------------------------------------------------------------------------------------

  /** A project font sheet read for typing, cached by file and modification time. */
  async function fontSheet(file: string): Promise<FontSheet | null> {
    const asset = projectRef.current?.assets.find((item) => item.kind === "fonts" && item.file === file);
    if (!asset) return null;
    const key = `${file}|${asset.mtime}`;
    const known = fontSheets.current.get(key);
    if (known) return known;
    try {
      const blob = await fetch(`${ASSET_URL}?${assetQuery(asset)}`, { cache: "no-cache" }).then((response) => response.blob());
      const bitmap = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const canvas = Object.assign(document.createElement("canvas"), { width: bitmap.width, height: bitmap.height });
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      const sheet = readFontSheet(context.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height);
      fontSheets.current.set(key, sheet);
      return sheet;
    } catch {
      say(`${asset.name} could not be read as a font sheet.`);
      return null;
    }
  }

  const textOptions = (settings: TextSettings) => ({ ink: settings.ink, invert: settings.invert, box: settings.box, leading: 0 });

  /** The text floats at `point` (anything floating before lands first). */
  async function placeText(point: Point) {
    const target = doc;
    if (!target) return;
    const font = textSettings.font || projectRef.current?.assets.find((asset) => asset.kind === "fonts")?.file || "";
    const sheet = await fontSheet(font);
    if (!sheet) return say("The text tool needs one of the project's font sheets.");
    dropFloat(target);
    pushUndo(target);
    target.float = renderText(sheet, textSettings.text || " ", textOptions(textSettings), point.x, point.y);
    target.sel = { x: point.x, y: point.y, w: target.float.w, h: target.float.h };
    textFloat.current = target.float;
    bump();
  }

  /** The floating text follows the settings (words, font, ink…) where it is. */
  async function updateText(settings: TextSettings) {
    setTextSettings(settings);
    const target = doc;
    if (!target?.float || target.float !== textFloat.current) return;
    const sheet = await fontSheet(settings.font);
    if (!sheet || target.float !== textFloat.current) return;
    const { x, y } = target.float;
    target.float = renderText(sheet, settings.text || " ", textOptions(settings), x, y);
    target.sel = { x, y, w: target.float.w, h: target.float.h };
    textFloat.current = target.float;
    bump();
  }

  function stampText() {
    if (!doc?.float) return;
    dropFloat(doc);
    doc.sel = null;
    textFloat.current = null;
    touch(doc);
  }

  function cancelText() {
    if (!doc?.float || doc.float !== textFloat.current) return;
    // Nothing was lifted from the picture, so the text just goes, with the undo step its placing added.
    doc.float = null;
    doc.sel = null;
    doc.undo.pop();
    textFloat.current = null;
    bump();
  }

  // ---- stamps (saved in the project's Cartographer/stamps/) --------------------------------------------------------

  /** A stamp's tile palettes as its sidecar keeps them: up to eight palette ids, and each tile's slot (-1: none). */
  function stampMeta(cells: ArrayLike<number>, palettes: readonly Palette[]): { slots: string[]; tileColors: number[] } {
    const slots: string[] = [];
    const tileColors = Array.from(cells, (wear) => {
      const id = wear ? palettes[wear - 1]?.id : undefined;
      if (!id) return -1;
      let slot = slots.indexOf(id);
      if (slot < 0 && slots.length < 8) slot = slots.push(id) - 1;
      return slot;
    });
    return { slots, tileColors };
  }

  async function postStampMeta(file: string, meta: { slots: string[]; tileColors: number[]; tags?: string[] }, metaMtime: number | null | undefined, force = false) {
    return fetch(`./__cartographer/stamp-meta?${new URLSearchParams({ file })}${metaMtime != null ? `&metaMtime=${metaMtime}` : ""}${force ? "&force=1" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta) });
  }

  /** An edited stamp's tile palettes, after its PNG. */
  async function saveStampMeta(target: Doc): Promise<string[]> {
    const asset = target.asset!;
    const meta = stampMeta(target.cells, target.palettes);
    let response = await postStampMeta(asset.file, meta, asset.metaMtime);
    if (response.status === 409) {
      if (!window.confirm(`The palettes of the stamp ${asset.name} changed on disk since you opened it. Replace them?`)) return ["Stamp palettes not written"];
      response = await postStampMeta(asset.file, meta, asset.metaMtime, true);
    }
    const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; mtime?: number };
    if (!response.ok || !result.ok) return [`Stamp palettes not written: ${result.error ?? response.statusText}`];
    asset.metaMtime = result.mtime ?? asset.metaMtime;
    return [];
  }

  /**
   * Saves the selection (with its tile palettes when it sits on whole tiles) as a stamp: a PNG in the project's
   * Cartographer/stamps/ and its palettes beside it. It also becomes the stamp in hand.
   */
  async function saveAsStamp() {
    const target = doc;
    if (!target?.sel || !project) return;
    const area = clipRect(target.sel, target.width, target.height);
    if (!area) return;
    const picked = await new Promise<StampSave | null>((resolve) => setStampSave({ hint: `A PNG in ${project.name}/Cartographer/stamps${onTiles(area) ? ", with its tile palettes" : ""}`, resolve }));
    setStampSave(null);
    if (!picked) return;
    const { name, tags } = picked;
    const flat = target.pixels.slice(), flatCells = target.cells.slice();
    if (target.float) { drop(flat, target.width, target.height, target.float); dropCells(flatCells, target.width, target.height, target.float); }
    const piece = lift(flat, target.width, area);
    const cells = onTiles(area) ? liftCells(flatCells, target.width, area) : null;
    // See-through stays see-through in the PNG (no key color): a stamp opens like any picture.
    const canvas = document.createElement("canvas");
    Object.assign(canvas, { width: area.w, height: area.h });
    canvas.getContext("2d")!.putImageData(new ImageData(toRgba(piece.pixels, new Uint8Array(cellsWide(area.w) * Math.ceil(area.h / CELL)), area.w, []), area.w, area.h), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return say("The stamp could not be made.");
    const made = await fetch(`./__cartographer/gbstudio-new-asset?${new URLSearchParams({ kind: "stamps", name })}`, { method: "POST", body: blob }).catch(() => null);
    const result = made ? await made.json().catch(() => null) as { ok?: boolean; file?: string; error?: string } | null : null;
    if (!made?.ok || !result?.ok || !result.file) return say(`The stamp was not saved: ${result?.error ?? "no answer"}`);
    if ((cells && cells.some(Boolean)) || tags.length) await postStampMeta(result.file, { ...(cells ? stampMeta(cells, target.palettes) : { slots: [], tileColors: [] }), tags }, null);
    takeStamp(target, area);
    await loadProject();
    say(`Saved the stamp ${name} in ${project.name}/Cartographer/stamps${cells ? " with its tile palettes" : ""}. It's in hand: pick the Stamp tool (C) to use it.`);
  }

  /** Picks up a saved stamp as the stamp in hand, with its tile palettes, and switches to the Stamp tool. */
  async function useSavedStamp(asset: Asset) {
    await palettesReady.current;
    try {
      const [blob, info] = await Promise.all([
        fetch(`${ASSET_URL}?${assetQuery(asset)}`, { cache: "no-cache" }).then((response) => response.blob()),
        fetch(`${ASSET_URL}-info?${assetQuery(asset)}`, { cache: "no-cache" }).then((response) => response.json() as Promise<AssetInfo>),
      ]);
      const bitmap = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const canvas = document.createElement("canvas");
      Object.assign(canvas, { width: bitmap.width, height: bitmap.height });
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      const picture = quantize(context.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height, palettesRef.current, false, false);
      const tinted = info.tileColors.length ? assignSlots(picture.cells, info.tileColors, info.slots, picture.palettes) : 0;
      const whole = bitmap.width % CELL === 0 && bitmap.height % CELL === 0;
      setStamp({ pixels: picture.pixels, w: bitmap.width, h: bitmap.height, x: 0, y: 0, ...(whole && tinted ? { cells: picture.cells } : {}), palettes: clonePalettes(picture.palettes) });
      if (tool !== "stamp") setTool("stamp");
      say(`Stamp: ${asset.name} (${bitmap.width} × ${bitmap.height}). Click or drag to stamp it on the grid.`);
    } catch {
      say(`The stamp ${asset.name} could not be read.`);
    }
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
      Object.assign(asset, { slots: info.slots, slotScene: info.slotScene ?? null, ...(asset.kind === "sprites" ? { animSpeed: info.animSpeed ?? null } : {}), ...(asset.kind === "backgrounds" ? { parallax: info.parallax ?? [] } : {}) });
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
        if (!copy || !target.handle) {
          Object.assign(target, { handle, name: handle.name, dirty: false, changedOnDisk: undefined });
          // Our own save is not someone else's change: remember the file's new time.
          target.fileTime = await handle.getFile().then((file) => file.lastModified).catch(() => Date.now());
        }
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

  /** Lets the user keep a file (see app/files.ts); failures other than a cancel are said. */
  const saveBlob = (blob: Blob, name: string, types: object[]) => saveFile(blob, name, types, say);

  /**
   * The sprite sheet's current animation as a looping GIF, frames put together from their slices as shown here
   * (palettes, screen look), at GB Studio's speed, enlarged `scale` times with hard pixel edges.
   */
  /** The current animation's frames put together from their slices as shown here (app/files.ts). */
  const composeFrames = () => canvasRef.current ? framesOf(canvasRef.current, frames) : [];

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
    await checkFiles();
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

  /**
   * PNGs opened from disk with a handle (not project pictures) are watched too, so a picture another app saves
   * (Aseprite exporting on every save, say) reloads here: in place when it has no unsaved changes, else the bar asks.
   */
  async function checkFiles() {
    if (saving.current) return;
    const reloaded: string[] = [];
    for (const item of docs.current.filter((doc) => doc.handle && !doc.asset && doc.fileTime !== undefined)) {
      let file: File;
      try { file = await item.handle!.getFile(); } catch { continue; }
      if (file.lastModified === item.fileTime || file.lastModified === item.changedOnDisk?.mtime) continue;
      if (item.dirty) { item.changedOnDisk = { mtime: file.lastModified, metaMtime: null }; continue; }
      await openFiles([{ file, handle: item.handle, replace: item.id }]);
      reloaded.push(item.name);
    }
    if (reloaded.length) say(`${reloaded.join(", ")} changed on disk and ${reloaded.length === 1 ? "was" : "were"} reloaded.`);
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

  // ---- zoom --------------------------------------------------------------------------------------------------------

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

  // No project and nothing open: the start screen shows on its own, like a splash window (see the render).
  const splash = served && !project && !docs.current.length;
  // Wheel and trackpad zoom (pinch) and middle-button pan, on the picture area. It only exists outside the splash,
  // so the handlers attach again whenever the splash comes or goes.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const detachWheel = attachWheelZoom(scroller, () => latest.current.zoom, (direction) => latest.current.zoomBy(direction), () => wrapRef.current);
    const detachPan = attachMiddlePan(scroller);
    return () => { detachWheel(); detachPan(); };
  }, [splash]);

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

  /**
   * Applies a palette fit: the picture takes its shades, tile palettes and palettes (undoable). With `intoProject`,
   * the palettes are first added to the project and then put in the picture's slots (1 onwards), so Save writes the
   * tiles' slots too.
   */
  async function applyFit(fit: { palettes: string[][]; cells: Uint8Array; pixels: Uint8Array; report: { after: number } }, intoProject: boolean) {
    const target = doc;
    if (!target) return;
    const base = target.name.replace(/\.png$/i, "");
    const ids: (string | null)[] = [];
    if (intoProject) {
      if (!await okToWriteProjectJson()) return;
      for (const [index, colors] of fit.palettes.entries()) ids.push(await writeProjectPalette({ name: `${base} ${index + 1}`, colors }));
      if (ids.some((id) => !id)) return say("Not every palette could be added to the project; nothing else changed.");
    }
    dropFloat(target);
    pushUndo(target);
    // Each fitted palette in the picture's own list (a project palette by id, else added as a palette of the file).
    const slots = fit.palettes.map((colors, index) => {
      const id = ids[index];
      let at = id ? target.palettes.findIndex((palette) => palette.id === id) : -1;
      if (at < 0) at = target.palettes.push({ name: `${base} ${index + 1}`, colors: [...colors], ...(id ? { id } : {}) }) - 1;
      return at + 1;
    });
    target.pixels = fit.pixels.slice();
    target.cells = Uint8Array.from(fit.cells, (wear) => wear ? slots[wear - 1] : 0);
    if (intoProject && target.asset) {
      for (const [slot, id] of ids.entries()) {
        await fetch(`./__cartographer/gbstudio-palette-slot?${assetQuery(target.asset)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot, paletteId: id }) }).catch(() => null);
      }
      await rereadSlots();
      setSlotsVersion((value) => value + 1);
    }
    touch(target);
    say(intoProject ? `${fit.report.after} palettes added to the project and put in slots 1–${fit.report.after}. Save writes the picture and its tiles' slots.` : `Fitted to ${fit.report.after} palettes. Undo brings the old colors back.`);
  }

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
    const check = () => { if (document.visibilityState === "visible") void latest.current.checkDisk(); };
    const timer = window.setInterval(check, 4000);
    window.addEventListener("focus", check);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, []);
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
  // The font sample, at a Game Boy screen's width (160 px, 8 px margins), wrapped at word breaks like a text box:
  // each character's glyph copied from the sheet as just drawn. In a variable-width font (see-through columns at a
  // glyph's right, magenta in the file) each glyph advances by its width.
  useLayoutEffect(() => {
    const sheet = canvasRef.current, canvas = sampleCanvas.current;
    if (!sheet || !canvas || !doc || !isFont) return;
    const columns = Math.max(1, Math.floor(doc.width / 8)), glyphs = columns * Math.floor(doc.height / 8);
    const at = (char: string) => { const index = char.charCodeAt(0) - 32; return index < 0 || index >= glyphs ? null : { sx: (index % columns) * 8, sy: Math.floor(index / columns) * 8 }; };
    const widthOf = (char: string) => {
      const glyph = at(char);
      if (!glyph || !doc.keyMagenta) return 8;
      let width = 8;
      while (width > 1 && Array.from({ length: 8 }, (_, y) => doc.pixels[(glyph.sy + y) * doc.width + glyph.sx + width - 1] === CLEAR).every(Boolean)) width -= 1;
      return width;
    };
    const SCREEN = 160, MARGIN = 8, ROOM = SCREEN - 2 * MARGIN;
    const lines: string[] = [];
    for (const paragraph of sampleText.split("\n")) {
      let line = "", used = 0;
      for (const word of paragraph.split(" ")) {
        const wordWidth = [...word].reduce((sum, char) => sum + widthOf(char), 0), space = line ? widthOf(" ") : 0;
        if (line && used + space + wordWidth > ROOM) { lines.push(line); line = ""; used = 0; }
        line += (line ? " " : "") + word;
        used += (line === word ? 0 : space) + wordWidth;
      }
      lines.push(line);
    }
    canvas.width = SCREEN;
    canvas.height = Math.max(1, lines.length) * 8 + 2 * MARGIN;
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    lines.forEach((line, row) => {
      let pen = MARGIN;
      for (const char of line) {
        const glyph = at(char), width = widthOf(char);
        if (glyph && pen + width <= SCREEN - MARGIN) context.drawImage(sheet, glyph.sx, glyph.sy, width, 8, pen, MARGIN + row * 8, width, 8);
        pen += width;
      }
    });
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
    // A drop on a window (the picture wizard takes its own) doesn't open the file behind it.
    if ((event.target as Element).closest?.("[role=dialog]")) return;
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
  // A project background or sprite sheet carries its eight palette slots (the Palettes tab and the slot menu show them).
  const sceneSlots = doc?.asset?.slots ?? [];
  const slotPalettes = sceneSlots.map((id) => docPalettes.findIndex((palette) => palette.id === id));
  const slotWhere = doc?.asset?.slotScene ? `${doc.asset.slotScene}'s palettes` : doc?.asset?.kind === "sprites" ? "the project's default sprite palettes (every scene without its own)" : "the project's default background palettes (every scene without its own)";
  const pickPalette = (index: number) => { setActivePalette(index); if (index && tool !== "palette") setTool("palette"); };

  // No project and nothing open: the start screen on its own, like a splash window, with no tools behind it.
  if (splash) {
    return (
      <div className="gbp-shell gbp-splash" onDragOver={(event) => event.preventDefault()} onDrop={(event) => void onDrop(event)}>
        <StartScreen recent={recent} onChooseProject={() => void chooseProject()} onDemo={() => void chooseProject(true)} onOpenFiles={() => void pickFiles()} onOpenRecent={(path) => void openProjectPath(path)} onAbout={() => setShowAbout(true)} />
        {toast && <div className="gbp-toast" role="status">{toast}</div>}
        {showAbout && <AboutWindow onClose={() => setShowAbout(false)} />}
      </div>
    );
  }

  const otherRecent = recent.filter((item) => item.path !== project?.path);
  const projectItems: MenuEntry[] = [
    { label: "Open another project…", icon: <FolderOpen />, onSelect: () => void chooseProject() },
    { label: "Open the demo project", icon: <Gamepad2 />, onSelect: () => void chooseProject(true) },
    ...(project && /[\\/]demo-project$/.test(project.path) ? [{ label: "Reset the demo project…", icon: <RotateCcw />, title: "Your painted copy goes to the backups folder; a fresh copy of the demo opens", onSelect: () => void chooseProject(true, true) }] : []),
    ...(otherRecent.length ? [{ separator: true } as MenuEntry, { heading: <><Clock size={11} /> Recent</> } as MenuEntry, ...otherRecent.slice(0, 5).map((item) => ({ label: item.name, indent: true, title: item.path, onSelect: () => void openProjectPath(item.path) }))] : []),
    ...(project ? [
      { separator: true } as MenuEntry,
      { label: "Picture to background…", icon: <ImagePlus />, title: "Any picture or photo, framed to screens and fitted to GB Studio's palettes and tile budget", onSelect: () => setShowPictureWizard(true) },
      { label: "Map Room…", icon: <MapIcon />, onSelect: () => setShowMapRoom(true) },
      { label: "Project health…", icon: <PxHeart size={15} />, onSelect: () => setShowHealth(true) },
      { label: "Dialogue box…", icon: <MessageSquare />, onSelect: () => setShowDialogue(true) },
      { label: "Backups…", icon: <History />, onSelect: () => setBackups({}) },
      { separator: true } as MenuEntry,
      { label: FILE_MANAGER_LABEL, icon: <FolderSearch />, onSelect: () => void fetch("./__cartographer/reveal", { method: "POST" }) },
      { label: "Show backups folder", icon: <FolderArchive />, onSelect: () => void fetch("./__cartographer/reveal?backups=1", { method: "POST" }) },
      { separator: true } as MenuEntry,
      { label: "Close project", icon: <FolderX />, onSelect: () => void closeProject() },
    ] : []),
    { separator: true },
    { label: "About GB Cartographer", icon: <Info />, onSelect: () => setShowAbout(true) },
  ];
  // Three sizes (the author's pick, R17): the file's own size, and two scaled up for sharing.
  const EXPORT_SCALES = [[1, "Original"], [4, "4×"], [8, "8×"]] as const;
  const exportItems: MenuEntry[] = doc ? [
    { label: "Copy of the file, in the GB greens", icon: <Save />, keys: "Ctrl+E", onSelect: () => void save(true) },
    { separator: true },
    { heading: "Image as shown, in its palettes" },
    ...EXPORT_SCALES.map(([scale, name]) => ({ label: <>{name}<span className="k-muted k-xs" style={{ marginLeft: "auto" }}>{doc.width * scale} × {doc.height * scale}</span></>, indent: true, onSelect: () => void exportImage(scale, true) })),
    ...(frames.length > 1 ? [{ heading: `Animation as GIF${animations.length > 1 && animation?.name ? ` · ${animation.name}` : ""}` } as MenuEntry, ...EXPORT_SCALES.map(([scale, name]) => ({ label: <>{name}<span className="k-muted k-xs" style={{ marginLeft: "auto" }}>{frames.length} frames</span></>, indent: true, onSelect: () => void exportGif(scale) }))] : []),
    { heading: "Image in the GB greens" },
    ...EXPORT_SCALES.map(([scale, name]) => ({ label: <>{name}<span className="k-muted k-xs" style={{ marginLeft: "auto" }}>{doc.width * scale} × {doc.height * scale}</span></>, indent: true, onSelect: () => void exportImage(scale, false) })),
  ] : [];
  const slotTarget = slotMenu && doc ? docPalettes[slotMenu.palette - 1] : undefined;
  const slotItems: MenuEntry[] = slotMenu && doc && slotTarget ? [
    { heading: `Put ${slotTarget.name} in slot` },
    ...slotPalettes.map((index, slot) => {
      const holder = index >= 0 ? docPalettes[index] : null, here = index === slotMenu.palette - 1;
      return { disabled: here || !slotTarget.id, onSelect: () => void putInSlot(slotMenu.palette, slot), label: <><span className="app-slot" style={{ width: 14, color: "var(--k-ink-3)" }}>{slot + 1}</span><span className="app-chips">{(holder?.colors ?? ["#222", "#222", "#222", "#222"]).map((color, at) => <i key={at} style={{ background: color }} />)}</span><span className="app-name">{holder?.name ?? "—"}{here ? " (here)" : ""}</span>{slot === UI_SLOT && doc.asset?.kind !== "sprites" && <Chip title="GB Studio draws dialogue boxes and menus with slot 8">UI</Chip>}</> };
    }),
    { separator: true },
    { note: slotTarget.id ? `Writes ${slotWhere} in GB Studio right away. Tiles wearing the palette moved out show the new one there.` : "Add this palette to the project first (palette manager)." },
  ] : [];
  const selectionItems: MenuEntry[] = selectionMenu && doc?.sel ? [
    { heading: `Selection · ${doc.sel.w} × ${doc.sel.h}` },
    { label: "Use as stamp", icon: <PhSticker size={15} />, onSelect: () => setTool("stamp") },
    { label: "Save as stamp…", icon: <Save />, disabled: !project, title: project ? `Saves a PNG in ${project.name}/Cartographer/stamps (tile palettes too, on whole tiles)` : "Open a GB Studio project to save stamps in it", onSelect: () => void saveAsStamp() },
    { separator: true },
    { label: "Copy", icon: <Copy />, keys: "Ctrl+C", onSelect: () => { if (copySelection()) say("Copied the selection"); } },
    { label: "Deselect", icon: <X />, keys: "Esc", onSelect: () => { dropFloat(doc); doc.sel = null; bump(); } },
  ] : [];
  const assetFolder = (asset: Asset) => asset.kind === "stamps" ? "Cartographer/stamps" : `assets/${asset.kind}`;
  const assetItems: MenuEntry[] = assetMenu ? [
    ...(assetMenu.asset.kind === "stamps" ? [{ label: "Use as stamp", icon: <PhSticker size={15} />, onSelect: () => void useSavedStamp(assetMenu.asset) }] : []),
    { label: assetMenu.asset.kind === "stamps" ? "Open to edit" : "Open", icon: <FolderOpen />, onSelect: () => void openAsset(assetMenu.asset) },
    { label: FILE_MANAGER_LABEL, icon: <FolderSearch />, onSelect: () => void fetch(`./__cartographer/reveal?${assetQuery(assetMenu.asset)}`, { method: "POST" }) },
    { label: "Copy file path", icon: <Copy />, onSelect: () => void navigator.clipboard?.writeText(`${project?.path ?? ""}/${assetFolder(assetMenu.asset)}/${assetMenu.asset.file}`).then(() => say("Copied the file path")) },
    { label: "Earlier versions…", icon: <History />, onSelect: () => setBackups({ file: `${assetFolder(assetMenu.asset)}/${assetMenu.asset.file}` }) },
    { separator: true },
    { label: "Show project folder", icon: <FolderTree />, onSelect: () => void fetch("./__cartographer/reveal", { method: "POST" }) },
  ] : [];
  // The wizards (W1…W8, the author's picks 2026-10-10); the text tool (W5) is in the tool column.
  const noProject = !project, sceneOpen = Boolean(doc?.asset?.slots?.length);
  const wizardItems: MenuEntry[] = [
    { heading: "Wizards" },
    { label: "Picture to background…", icon: <ImagePlus />, disabled: noProject, title: "Any picture or photo, framed to screens and fitted to GB Studio's palettes and tile budget", onSelect: () => setShowPictureWizard(true) },
    { label: "Day, sunset and night…", icon: <PxCloudMoon size={15} />, disabled: !sceneOpen, title: sceneOpen ? "Time-of-day versions of the open picture's slot palettes" : "Open a project background or sprite sheet first", onSelect: () => setWizard("dns") },
    { label: "A palette set…", icon: <SwatchBook />, disabled: noProject, title: "Eight palettes from a Lospec palette, a picture or the library", onSelect: () => setWizard("paletteSet") },
    { label: "New background…", icon: <FilePlus />, disabled: noProject, title: "A blank background in screens, with a palette set in its slots", onSelect: () => setWizard("newBackground") },
    { label: "Tile budget fixer…", icon: <PhPiggyBank size={15} />, disabled: !doc, title: "Get the open picture under GB Studio's tile limit, one merge at a time", onSelect: () => setWizard("budget") },
    { label: "New map…", icon: <MapIcon />, disabled: noProject, title: "A Zelda-style grid of screens, in the Map Room", onSelect: () => setShowMapRoom(true) },
    { label: "Project check-up…", icon: <PxHeart size={15} />, disabled: noProject, title: "The health report one issue at a time, each with its fix", onSelect: () => setWizard("checkup") },
  ];
  const lookName = look === "dmg" ? "Game Boy screen" : look === "pocket" ? "Pocket screen" : "GBC screen";

  return (
    <div className="app k" onDragOver={(event) => event.preventDefault()} onDrop={(event) => void onDrop(event)}>
      <header className="app-bar">
        {served
          ? <Menu open={Boolean(projectMenu)} onOpenChange={(open) => setProjectMenu(open ? { x: 0, y: 0 } : null)} items={projectItems} trigger={<button className="app-brand" title="Projects: open, switch or close"><LogoMark size={22} />GB Cartographer<Chip tone="acc" title="Alpha release: expect bugs, and keep your GB Studio project backed up">ALPHA</Chip><ChevronDown size={14} /></button>} />
          : <span className="app-brand"><LogoMark size={22} />GB Cartographer<Chip tone="acc">ALPHA</Chip></span>}
        <span className="k-seg" role="group" aria-label="File">
          <Button icon={<FilePlus />} title={project ? `A new blank picture: in ${project.name} or just here` : "A new blank picture"} onClick={() => setShowNew(true)}>New</Button>
          <Button icon={<FolderOpen />} title="Open PNG files · Ctrl+O (or drop them on the window)" onClick={() => void pickFiles()}>Open</Button>
          <Button icon={<Save />} disabled={!doc} title={`Save every changed picture · Ctrl+S${doc?.asset ? ` (this one over ${doc.asset.file} in the project; old files go to the backups folder)` : doc?.handle ? ` (this one over ${doc.name})` : " (this one asks where)"}`} onClick={() => void save(false)}>Save</Button>
          <Menu open={Boolean(exportMenu) && Boolean(doc)} onOpenChange={(open) => setExportMenu(open ? { x: 0, y: 0 } : null)} items={exportItems} trigger={<Button icon={<Rocket />} disabled={!doc} title="Export a copy in the GB greens (Ctrl+E), or an image to share">Export</Button>} />
        </span>
        <span className="k-seg" role="group" aria-label="Maps and palettes">
          {served && !project && <Button icon={<FolderTree />} title="Open a GB Studio project folder" onClick={() => void chooseProject()}>Open project…</Button>}
          {project && <Button icon={<MapIcon />} title="Map Room: grids of screens (Zelda-style), each a background" onClick={() => setShowMapRoom(true)}>Maps</Button>}
          <Button icon={<SwatchBook />} title="Palette manager: the project's palettes, a library, and your own" onClick={() => setShowPalettes(true)}>Palettes</Button>
          <Menu items={wizardItems} trigger={<Button icon={<PxRobotHappy size={15} />} title="Wizards: step-by-step helpers">Wizards</Button>} />
        </span>
        <IconButton label="Undo" keys="Ctrl+Z" disabled={!doc?.undo.length} onClick={() => stepHistory("undo")}><Undo2 /></IconButton>
        <IconButton label="Redo" keys="Ctrl+Shift+Z" disabled={!doc?.redo.length} onClick={() => stepHistory("redo")}><Redo2 /></IconButton>
        <span className="k-spacer" />
        <span className="k-seg app-zoom" role="group" aria-label="Zoom">
          <IconButton label="Zoom out" size="sm" variant="ghost" disabled={!doc} onClick={() => zoomBy(-1)}><Minus /></IconButton>
          <b>{doc ? `${doc.zoom * 100}%` : "–"}</b>
          <IconButton label="Zoom in" size="sm" variant="ghost" disabled={!doc} onClick={() => zoomBy(1)}><Plus /></IconButton>
        </span>
        <span className="k-seg" role="group" aria-label="View">
          <IconButton label={`Tile grid: ${grid ? `${grid} px` : "off"} (click for off / 8 px / 16 px)`} pressed={grid > 0} onClick={() => setGrid(grid === 0 ? 8 : grid === 8 ? 16 : 0)} aria-label="Tile grid"><Grid3x3 />{grid > 0 && <span className="app-grid-size">{grid}</span>}</IconButton>
          <IconButton label="Tile budget view: red tiles are used once, amber ones nearly match another" pressed={budgetView} onClick={() => setBudgetView(!budgetView)} aria-label="Tile budget view"><PhPiggyBank size={16} /></IconButton>
          <IconButton label="Game Boy screens: outline each 160 × 144 screen" pressed={screens} onClick={() => { setScreens(!screens); store(SCREENS_KEY, !screens); }} aria-label="Game Boy screens"><PxGamepad size={16} /></IconButton>
          <IconButton label="Snap selections and moves to 8 px tiles" pressed={snap} onClick={() => setSnap(!snap)} aria-label="Snap selections to tiles"><Magnet /></IconButton>
        </span>
        <IconButton label="Help: tools, keys and what Save writes" keys="?" pressed={showHelp} onClick={() => setShowHelp(!showHelp)} aria-label="Help"><PxLightbulb size={16} /></IconButton>
      </header>
      <div className="app-tabs" role="tablist" aria-label="Open pictures">
        {docs.current.map((item) => (
          <div key={item.id} role="tab" aria-selected={item.id === activeId} className={`app-tab ${item.id === activeId ? "active" : ""}`} title={`${item.name} · ${item.width} × ${item.height} px`} onClick={() => setActiveId(item.id)}>
            <span>{item.name}{item.dirty && <span className="dirty"> *</span>}</span>
            <button className="k-btn k-btn--ghost k-icon-btn" aria-label={`Close ${item.name}`} onClick={(event) => { event.stopPropagation(); closeDoc(item); }}><X /></button>
          </div>
        ))}
        <IconButton label="Open PNG files" keys="Ctrl+O" size="sm" variant="ghost" onClick={() => void pickFiles()}><Plus /></IconButton>
      </div>
      <div className="app-body">
        {project && (
          <ProjectPanel
            project={project}
            kind={projectKind}
            open={showProject}
            onKind={(kind) => { if (kind === projectKind) setShowProject(!showProject); else { setProjectKind(kind); setShowProject(true); } }}
            slotsVersion={slotsVersion}
            stateOf={(asset) => { const open = docs.current.find((item) => item.asset?.kind === asset.kind && item.asset.file === asset.file); return { open: Boolean(open), active: Boolean(open && open.id === activeId), dirty: Boolean(open?.dirty) }; }}
            onOpen={(asset) => void openAsset(asset)}
            onMenu={(asset, x, y) => setAssetMenu({ x, y, asset })}
          />
        )}
        <ToolColumn tool={tool} onTool={setTool} seamless={seamless} onSeamless={setSeamless} linked={linked} onLinked={setLinked} mirror={mirror} onMirror={setMirror} pattern={pattern} onPattern={cyclePattern} cellBrush={cellBrush} onCellBrush={setCellBrush} brush={brush} onBrush={setBrush} />
        <div className="k-panel app-stage gbp-scroller" ref={scrollerRef}>
          {doc && tool === "text" && <TextStrip fonts={project?.assets.filter((asset) => asset.kind === "fonts") ?? []} settings={{ ...textSettings, font: textSettings.font || project?.assets.find((asset) => asset.kind === "fonts")?.file || "" }} onChange={(settings) => void updateText(settings)} shades={swatchColors} placed={Boolean(doc.float) && doc.float === textFloat.current} onStamp={stampText} onCancel={cancelText} />}
          {doc && tool === "stamp" && project && project.assets.some((asset) => asset.kind === "stamps") && <StampsStrip stamps={project.assets.filter((asset) => asset.kind === "stamps")} slotsVersion={slotsVersion} onUse={(asset) => void useSavedStamp(asset)} onOpen={(asset) => { setProjectKind("stamps"); void openAsset(asset); }} />}
          {doc && frames.length > 0 && <FramesStrip animations={animations} frame={frame} onFrame={setFrame} playing={playing} onPlaying={setPlaying} animSpeed={animSpeed} fps={fps} canvases={frameCanvases} onBackground={project?.assets.some((asset) => asset.kind === "backgrounds") ? () => setOnBackground(composeFrames()) : undefined} backgrounds={project?.assets.filter((asset) => asset.kind === "backgrounds") ?? []} />}
          {doc?.changedOnDisk && !doc.changedOnDisk.kept && (
            <div className="k-card app-strip app-strip--alert" role="alert">
              <span className="app-strip-label"><b>{doc.name}</b> changed on disk (GB Studio or another app saved it) while you have unsaved changes here.</span>
              <Button variant="primary" size="sm" onClick={() => { if (window.confirm(`Reload ${doc.name} from disk? Your unsaved changes here are lost.`)) { const target = doc; target.changedOnDisk = undefined; if (target.asset) void reloadAsset(target); else if (target.handle) void target.handle.getFile().then((file) => openFiles([{ file, handle: target.handle, replace: target.id }])); } }}>Reload from disk</Button>
              <Button size="sm" title="Keep painting; Save will ask before replacing the file on disk" onClick={() => { doc.changedOnDisk = { ...doc.changedOnDisk!, kept: true }; bump(); }}>Keep mine</Button>
            </div>
          )}
          {doc && seamless && (
            <div className="k-card app-strip" role="group" aria-label="Seamless view">
              <span className="app-strip-label">{seamlessArea ? (doc.sel ? `Selection ${seamlessArea.w} × ${seamlessArea.h}` : `Tile ${hoverCell!.x}, ${hoverCell!.y}`) : "Point at a tile"} · repeated 3 × 3</span>
              {seamlessArea && <canvas ref={seamlessCanvas} style={{ width: seamlessArea.w * 3 * Math.max(2, Math.min(8, Math.floor(96 / Math.max(seamlessArea.w, seamlessArea.h)))), height: seamlessArea.h * 3 * Math.max(2, Math.min(8, Math.floor(96 / Math.max(seamlessArea.w, seamlessArea.h)))) }} />}
            </div>
          )}
          {doc && isFont && (
            <div className="k-card app-strip" role="group" aria-label="Font sample">
              <canvas ref={sampleCanvas} className="gbp-sample-canvas" title="One Game Boy screen wide (160 px), shown at 2×" />
              <label className="k-field" style={{ width: 260 }}><span className="k-label">Your text</span><textarea className="k-input" rows={3} style={{ height: "auto", padding: "6px 10px", resize: "vertical" }} aria-label="Sample text" value={sampleText} onChange={(event) => setSampleText(event.target.value)} spellCheck={false} /><span className="k-hint">Wraps like a text box, one screen wide.</span></label>
            </div>
          )}
          {doc ? (
            <div className={`gbp-stage ${tool === "hand" ? "pan" : ""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onContextMenu={(event) => event.preventDefault()}>
              <div className="gbp-wrap" ref={wrapRef} style={{ width: doc.width * doc.zoom, height: doc.height * doc.zoom }}>
                <canvas ref={canvasRef} />
                {gridLines && <div className="gbp-grid" style={{ backgroundSize: `${gridLines} ${gridLines}` }} />}
                {budgetView && <canvas ref={usageCanvas} className="gbp-usage" />}
                {tool === "priority" && doc.priority && <canvas ref={priorityCanvas} className="gbp-usage gbp-priority" />}
                {screens && <div className="gbp-screens" style={{ backgroundSize: `${160 * doc.zoom}px ${144 * doc.zoom}px` }} />}
                {current && current.tiles.map((tile, index) => <div key={index} className="gbp-frame-slice" style={{ left: tile.sliceX * doc.zoom, top: tile.sliceY * doc.zoom, width: 8 * doc.zoom, height: 16 * doc.zoom }} />)}
                {doc.sel && <div className={`gbp-selection ${doc.float ? "floating" : ""}`} style={{ left: doc.sel.x * doc.zoom, top: doc.sel.y * doc.zoom, width: doc.sel.w * doc.zoom, height: doc.sel.h * doc.zoom }} />}
                <div className="gbp-brush-outline" ref={brushRef} />
              </div>
            </div>
          ) : (
            <div className="gbp-empty">
              <span className="gbp-mascot" title="Nothing open yet"><PxSnake size={48} /></span>
              <p>{project ? `Pick a picture of ${project.name} on the left.` : "Drop PNG files here, or"}</p>
              {!project && <Button icon={<FolderOpen />} onClick={() => void pickFiles()}>Open PNG files</Button>}
            </div>
          )}
        </div>
        <aside className="k-panel app-side">
          <div className="app-swatches">
            {swatchColors.slice(0, 4).map((color, index) => (
              <button key={index} className="app-swatch" aria-pressed={shade === index} style={{ background: color }} aria-label={`Shade ${index + 1}`} title={`Shade ${index + 1} · ${index + 1} · click again to change this color${picked ? ` of ${picked.name}` : " of the tint"}`} onClick={() => { if (shade === index) shadeInputs.current[index]?.click(); else { setShade(index); if (tool === "eyedropper") setToolState(paintTool.current); } }}>
                <Kbd>{index + 1}</Kbd>
                <input type="color" tabIndex={-1} aria-label={`Change color ${index + 1}`} ref={(element) => { shadeInputs.current[index] = element; }} value={normalizeHex(color)} onClick={(event) => event.stopPropagation()} onChange={(event) => changeShadeColor(index, event.target.value.toUpperCase())} />
              </button>
            ))}
          </div>
          {doc?.hasAlpha && <Button size="sm" className="app-clear" pressed={shade === CLEAR} title="See-through · 0" onClick={() => setShade(CLEAR)}><Kbd>0</Kbd>Transparent</Button>}
          <Tabs.Root value={sideTab} onValueChange={(value) => setSideTab(value as "palettes" | "picture")} style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
            <TabList label="Inspector" tabs={[{ value: "palettes", label: "Palettes" }, { value: "picture", label: "Picture" }]} />
            <Tabs.Content value="palettes" className="app-side-body">
              <PalettesPane doc={doc} palettes={docPalettes} sceneSlots={sceneSlots} slotPalettes={slotPalettes} slotWhere={slotWhere} activePalette={activePalette} onPick={pickPalette}
                namedSlots={namedSlots} onNamedSlots={(on) => { setNamedSlots(on); store(NAMED_SLOTS_KEY, on); }} filter={paletteFilter} onFilter={setPaletteFilter} onSlotMenu={(x, y, palette) => setSlotMenu({ x, y, palette })}
                libraryColors={libraryColors} onSaveToProject={project && picked?.id ? () => void (async () => { if (await okToWriteProjectJson() && await writeProjectPalette({ id: picked.id!, name: picked.name, colors: [...picked.colors] })) say(`${picked.name} written to the project`); })() : undefined}
                onRecolor={recolorPalette} say={say} copiedColors={copiedColors} onCopy={(colors) => { setCopiedColors(colors); say(`Copied the colors of ${picked?.name}`); }} />
            </Tabs.Content>
            <Tabs.Content value="picture" className="app-side-body">
              <PicturePane doc={doc} tileCount={tileCount} budget={budget} onBudget={setBudgetId} look={look} onLook={(next) => { setLook(next); store(LOOK_KEY, next); }}
                tint={tint} onTint={setTint} paletteNames={palettes.map(({ name }) => name)} customTint={customTint} onCustomTint={setCustomTint} font={font} onFont={(next) => { setFont(next); applyFont(next); }}
                onResize={() => setShowResize(true)} onFit={() => { if (!doc) return; const flat = doc.pixels.slice(); if (doc.float) drop(flat, doc.width, doc.height, doc.float); setFitting(toRgba(flat, doc.cells, doc.width, doc.palettes)); }}
                usage={shownUsage ? { usedOnce, nearCount } : null} budgetView={budgetView} onBudgetView={setBudgetView} onMerge={mergeNear} />
            </Tabs.Content>
          </Tabs.Root>
        </aside>
      </div>
      <footer className="app-status">
        <span className="app-status-hint"><b>{hint[1]}</b> · {hint[4]}</span>
        <span ref={readoutRef} className="gbp-readout" />
        <span className="k-spacer" />
        {look !== "plain" && <Button size="sm" title="The picture shows like a real screen (Picture tab → Screen); the file is unchanged. Click for plain." onClick={() => { setLook("plain"); store(LOOK_KEY, "plain"); }}>{lookName}<X /></Button>}
        {doc?.sel && <span>Selection {doc.sel.w} × {doc.sel.h} at {doc.sel.x}, {doc.sel.y}</span>}
        {doc && <span title={doc.asset ? `${doc.asset.kind === "stamps" ? "Cartographer/stamps" : `assets/${doc.asset.kind}`}/${doc.asset.file}` : doc.name}>{doc.width} × {doc.height} · {Math.ceil(doc.width / CELL)} × {Math.ceil(doc.height / CELL)} tiles</span>}
        {doc && (
          <Tooltip content={`Unique 8 × 8 tiles, as GB Studio counts them (${budget.flips ? "identical and flipped tiles merge" : "identical tiles merge"}). Click for ${project ? "the project's health report" : "the Picture tab"}.`}>
            <button className={`app-tiles ${tileCount > budget.limit ? "over" : ""}`} onClick={() => { if (project) setShowHealth(true); else setSideTab("picture"); }}>
              TILES<span className="k-meter-track"><span className="k-meter-fill" style={{ display: "block", width: `${Math.min(1, tileCount / budget.limit) * 100}%` }} /></span><span>{tileCount} / {budget.limit}</span>
            </button>
          </Tooltip>
        )}
      </footer>
      {toast && <div className="app-toast" role="status">{toast}</div>}
      {slotMenu && slotItems.length > 0 && <MenuAt x={slotMenu.x} y={slotMenu.y} items={slotItems} label="Put in slot" onClose={() => setSlotMenu(null)} />}
      {selectionMenu && selectionItems.length > 0 && <MenuAt x={selectionMenu.x} y={selectionMenu.y} items={selectionItems} label="Selection" onClose={() => setSelectionMenu(null)} />}
      {assetMenu && <MenuAt x={assetMenu.x} y={assetMenu.y} items={assetItems} label={assetMenu.asset.name} onClose={() => setAssetMenu(null)} />}
      {showHelp && <HelpWindow onClose={() => setShowHelp(false)} onAbout={() => { setShowHelp(false); setShowAbout(true); }} />}
      {showAbout && <AboutWindow onClose={() => setShowAbout(false)} />}
      {onBackground && project && <SpriteOnBackground backgrounds={project.assets.filter((asset) => asset.kind === "backgrounds")} frames={onBackground} fps={fps} onClose={() => setOnBackground(null)} />}
      {fitting && doc && <FitWindow name={doc.name} rgba={fitting} width={doc.width} height={doc.height} slotsTarget={doc.asset?.slots?.length && (doc.asset.kind === "backgrounds" || doc.asset.kind === "tilesets") ? doc.asset.slotScene ?? "the project's defaults" : null} onClose={() => setFitting(null)} onApply={applyFit} />}
      {showMapRoom && project && <MapRoom project={project} onClose={() => setShowMapRoom(false)} onOpen={(asset) => { setProjectKind("backgrounds"); void openAsset(asset); }} onProjectChanged={async () => { await loadProject(); setSlotsVersion((value) => value + 1); }} onExport={(blob, name) => saveBlob(blob, name, PNG_TYPES)} say={say} />}
      {showDialogue && project && <DialoguePreview backgrounds={project.assets.filter((asset) => asset.kind === "backgrounds")} hasFrame={project.assets.some((asset) => asset.kind === "ui" && asset.file === "frame.png")} onClose={() => setShowDialogue(false)} />}
      {stampSave && <SaveStampDialog hint={stampSave.hint} known={[...new Set((project?.assets ?? []).flatMap((asset) => asset.tags ?? []))]} onClose={() => stampSave.resolve(null)} onSave={(save) => stampSave.resolve(save)} />}
      {wizard === "dns" && doc && project && (
        <DnsWizard slots={slotPalettes.map((index) => { const palette = index >= 0 ? docPalettes[index] : null; return palette?.id ? { id: palette.id, name: palette.name, colors: [...palette.colors] } : null; })} where={slotWhere} existing={project.palettes.map((palette) => palette.name)}
          picture={{ pixels: doc.pixels, cells: doc.cells, width: doc.width, height: doc.height, palettes: doc.palettes }} onClose={() => setWizard(null)} onCreate={addPalettes} />
      )}
      {wizard === "newBackground" && project && <NewBackgroundWizard projectName={project.name} palettes={project.palettes} onClose={() => setWizard(null)} onCreate={createBackground} />}
      {wizard === "budget" && doc && (
        <BudgetFixer picture={{ name: doc.name, pixels: (() => { const flat = doc.pixels.slice(); if (doc.float) drop(flat, doc.width, doc.height, doc.float); return flat; })(), cells: doc.cells, width: doc.width, height: doc.height, palettes: doc.palettes }}
          limit={budget.limit} flips={budget.flips} onClose={() => setWizard(null)} onApply={(pixels) => { dropFloat(doc); pushUndo(doc); doc.pixels.set(pixels); touch(doc); say(`${doc.name}: merged near tiles; ${countUniqueTiles(doc.pixels, doc.width, doc.height, budget.flips)} unique tiles now. Undo brings them back.`); }} />
      )}
      {wizard === "checkup" && project && (
        <CheckupWizard projectName={project.name} onClose={() => setWizard(null)}
          onFixPalette={async (palette) => { if (!await okToWriteProjectJson()) return false; const id = await writeProjectPalette(palette); await loadProject(); setSlotsVersion((value) => value + 1); return Boolean(id); }}
          onRemovePalette={removeProjectPalette}
          onOpen={(kind, file) => void openByFile(kind, file)}
          onFixTiles={(kind, file) => void openByFile(kind, file).then((opened) => { if (opened) setWizard("budget"); })} />
      )}
      {showPictureWizard && <PictureWizard projectName={project?.name ?? null} onClose={() => setShowPictureWizard(false)} onOpen={openFittedPicture} onSave={saveFittedBackground} />}
      {showHealth && project && <HealthWindow projectName={project.name} onClose={() => setShowHealth(false)} onOpen={(kind, file) => { const asset = project.assets.find((item) => item.kind === kind && item.file === file); if (asset) { setProjectKind(kind); void openAsset(asset); } }} />}
      {showNew && <NewPictureWindow projectName={project?.name ?? null} initialKind={projectKind} onClose={() => setShowNew(false)} onCreate={createPicture} />}
      {showResize && doc && <ResizeWindow name={doc.asset?.name ?? doc.name} width={doc.width} height={doc.height} sprite={doc.asset?.kind === "sprites"} inProject={Boolean(doc.asset)} onClose={() => setShowResize(false)} onResize={resizePicture} />}
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
          onRemoveProject={removeProjectPalette}
          onSlotMenu={doc?.asset?.slots?.length ? (id, x, y) => { const index = docPalettes.findIndex((item) => item.id === id); if (index >= 0) setSlotMenu({ x, y, palette: index + 1 }); else say("Open a picture of this project to put its palettes in slots."); } : undefined}
        />
      )}
    </div>
  );
}
