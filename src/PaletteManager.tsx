/**
 * The palette manager: the open project's palettes, the bundled library (Game Boy classics and the author's
 * Chorbi palettes) and the user's own palettes ("Mine", kept per browser). Colors and names are edited on the
 * right with a live preview of the open picture; a palette can be added to the project (a new
 * project/palettes/<name>.gbsres) or, for a project palette, saved back into its file.
 */
import { ArrowDown, ArrowUp, Download, Globe, Plus, SwatchBook, Trash2, Upload } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import library from "./palettes/library.json";
import { closeShades, colorize, paletteVariant, shadeLut, spriteShades, type Palette } from "./paint";
import { Button, Checkbox, Chip, Dialog, IconButton, Segmented, usePrompt } from "./ui/kit";
import "./PaletteManager.css";

type Collection = "project" | "mine" | string;
/** What the title bar's switch shows: the project, the whole bundled library (one group a collection), or Mine. */
type View = "project" | "library" | "mine";
interface Picture { pixels: Uint8Array; width: number; height: number; sprite: boolean }

const MINE_KEY = "gb-cartographer.my-palettes";
const LIBRARY: { name: string; palettes: Palette[] }[] = library.collections;

function readMine(): Palette[] {
  try {
    const value = JSON.parse(localStorage.getItem(MINE_KEY) ?? "[]") as Palette[];
    return Array.isArray(value) ? value.filter((palette) => palette && Array.isArray(palette.colors) && palette.colors.length === 4) : [];
  } catch {
    return [];
  }
}

function writeMine(palettes: Palette[]) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(palettes));
  } catch {
    // Per-browser convenience only.
  }
}

/** GB Studio's palette file name for a palette name (lowercase, spaces as "_"), as server/assets.ts spells it. */
const fileNameFor = (name: string) => (name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "") || "palette") + ".gbsres";

const normalize = (color: string) => {
  const hex = color.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null;
};

export interface PaletteManagerProps {
  projectName: string | null;
  /** The project's palettes, with their GB Studio ids. */
  projectPalettes: Palette[];
  /** The open picture's eight palette slot ids, in slot order (empty when it has none). */
  sceneSlots: string[];
  /** The open picture, flattened, for the preview. */
  picture: Picture | null;
  onClose: () => void;
  /** Writes a palette file into the project (a new one without `id`); resolves to the palette's id. */
  onWriteProject: (palette: { id?: string; name: string; colors: string[] }) => Promise<string | null>;
  /** Paints with this project palette: the palette brush picks it. */
  onPick: (paletteId: string) => void;
  /** Right-click on a project palette while a picture with slots is open: the painter's "Put in slot" menu. */
  onSlotMenu?: (paletteId: string, x: number, y: number) => void;
  /** Takes an unused palette out of the project (to the backups folder); resolves true when it was removed. */
  onRemoveProject?: (paletteId: string, name: string) => Promise<boolean>;
}

/**
 * Palettes from a file: GB Cartographer's JSON export ({ palettes: [{ name, colors }] }), or a plain color list such
 * as Lospec's .hex (one color a line) or GIMP's .gpl (R G B per line), taken four colors at a time.
 */
export function parsePaletteFile(name: string, text: string): Palette[] {
  const base = name.replace(/\.[^.]+$/, "");
  try {
    const data = JSON.parse(text) as { palettes?: { name?: unknown; colors?: unknown }[] } | { name?: unknown; colors?: unknown }[];
    const list = Array.isArray(data) ? data : data.palettes ?? [];
    return list.flatMap((item, index) => {
      const colors = Array.isArray(item.colors) ? item.colors.map((color) => normalize(String(color))) : [];
      return colors.length === 4 && colors.every(Boolean) ? [{ name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : `${base} ${index + 1}`, colors: colors as string[] }] : [];
    });
  } catch {
    // Not JSON: a list of colors.
  }
  const colors: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const gpl = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b/.exec(line);
    if (gpl) { colors.push(`#${gpl.slice(1, 4).map((value) => Math.min(255, Number(value)).toString(16).padStart(2, "0")).join("").toUpperCase()}`); continue; }
    const hex = /^\s*#?([0-9a-f]{6})\b/i.exec(line);
    if (hex) colors.push(`#${hex[1].toUpperCase()}`);
  }
  return groupsOfFour(base, colors);
}

/** Colors taken four at a time, each palette lightest first (GB Studio's order; Lospec lists them darkest first). */
export function groupsOfFour(base: string, colors: string[]): Palette[] {
  const light = (hex: string) => { const value = parseInt(hex.slice(1), 16); return 0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255); };
  const palettes: Palette[] = [];
  for (let at = 0; at + 4 <= colors.length; at += 4) palettes.push({ name: colors.length > 4 ? `${base} ${at / 4 + 1}` : base, colors: colors.slice(at, at + 4).sort((a, b) => light(b) - light(a)) });
  return palettes;
}

/** A Lospec palette's name and every color, by its link (lospec.com/palette-list/<name>) or name (Lospec allows the fetch). */
export async function fetchLospecColors(link: string): Promise<{ name: string; colors: string[] }> {
  const slug = (/palette-list\/([a-z0-9-]+)/i.exec(link)?.[1] ?? link.trim().toLowerCase().replace(/\s+/g, "-")).replace(/\.json$/, "");
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("That doesn't look like a Lospec palette link.");
  const response = await fetch(`https://lospec.com/palette-list/${slug}.json`);
  if (!response.ok) throw new Error(response.status === 404 ? "Lospec has no palette by that name." : response.statusText);
  const data = await response.json() as { name?: string; author?: string; colors?: string[] };
  const colors = (data.colors ?? []).map((color) => normalize(color)).filter((color): color is string => Boolean(color));
  return { name: `${data.name ?? slug}${data.author ? ` (${data.author})` : ""}`, colors };
}

/** A Lospec palette as GB Studio palettes: its colors four at a time, each lightest first. */
export async function fetchLospec(link: string): Promise<Palette[]> {
  const { name, colors } = await fetchLospecColors(link);
  return groupsOfFour(name, colors);
}

/** Adds palettes to Mine (this browser's own palettes), as the manager's Mine collection shows them. */
export function addToMine(palettes: { name: string; colors: string[] }[]) {
  writeMine([...readMine(), ...palettes.map(({ name, colors }) => ({ name, colors: [...colors] }))]);
}

export default function PaletteManager({ projectName, projectPalettes, sceneSlots, picture, onClose, onWriteProject, onPick, onSlotMenu, onRemoveProject }: PaletteManagerProps) {
  const [promptDialog, askText] = usePrompt();
  const [collection, setCollection] = useState<Collection>(projectPalettes.length ? "project" : LIBRARY[0]?.name ?? "mine");
  const [filter, setFilter] = useState("");
  const [mine, setMine] = useState<Palette[]>(() => readMine());
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<{ name: string; colors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  // A callback ref: the dialog mounts its content a render late (in a portal), so the preview draws when the canvas arrives.
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  /** Which scenes use each project palette (by id), read from the project when the Project collection shows. */
  const [usage, setUsage] = useState<Map<string, PaletteUsage> | null>(null);
  const [onlyOdd, setOnlyOdd] = useState(false);
  useEffect(() => {
    if (!projectName) return setUsage(null);
    let live = true;
    fetch("./__cartographer/palette-usage", { cache: "no-cache" }).then((response) => response.ok ? response.json() as Promise<{ palettes?: PaletteUsage[] }> : null)
      .then((result) => { if (live && result?.palettes) setUsage(new Map(result.palettes.map((entry) => [entry.id, entry]))); })
      .catch(() => null);
    return () => { live = false; };
  }, [projectName, projectPalettes, sceneSlots.join()]);
  const unused = (palette: Palette) => Boolean(usage && palette.id && !usage.get(palette.id)?.uses.length);
  const twin = (palette: Palette) => Boolean(palette.id && usage?.get(palette.id)?.sameColors.length);

  const collections: { id: Collection; label: string; palettes: Palette[]; editable: boolean }[] = [
    { id: "project", label: projectName ? `Project · ${projectName}` : "Project (none open)", palettes: projectPalettes, editable: true },
    { id: "mine", label: "Mine", palettes: mine, editable: true },
    ...LIBRARY.map((group) => ({ id: group.name, label: group.name, palettes: group.palettes, editable: false })),
  ];
  const current = collections.find((group) => group.id === collection) ?? collections[0];
  const view: View = current.id === "project" || current.id === "mine" ? current.id : "library";
  // The list shows the view: the project, Mine, or every library collection one after the other.
  const listed = view === "library" ? collections.filter((group) => group.id !== "project" && group.id !== "mine") : [current];
  const listedCount = listed.reduce((sum, group) => sum + group.palettes.length, 0);
  const matches = (name: string) => !filter.trim() || name.toLowerCase().includes(filter.trim().toLowerCase());
  const shown = listed.flatMap((group) => group.palettes.map((palette, index) => ({ palette, index, group: group.id })))
    .filter(({ palette }) => matches(palette.name) && (!onlyOdd || view !== "project" || unused(palette) || twin(palette)));
  // The project list leads with the open picture's slots, in slot order, then everything else.
  const slotOf = (palette: Palette) => palette.id ? sceneSlots.indexOf(palette.id) : -1;
  const groups = view === "project" && sceneSlots.length
    ? [{ label: "Scene slots", rows: shown.filter(({ palette }) => slotOf(palette) >= 0).sort((a, b) => slotOf(a.palette) - slotOf(b.palette)) }, { label: "Others in the project", rows: shown.filter(({ palette }) => slotOf(palette) < 0) }]
    : view === "library" ? listed.map((group) => ({ label: group.label, rows: shown.filter((row) => row.group === group.id) }))
    : [{ label: "", rows: shown }];
  const isPicked = (row: { group: Collection; index: number }) => row.group === current.id && row.index === selected;
  const picked = current.palettes[selected];
  const colors = draft?.colors ?? picked?.colors ?? [];
  const name = draft?.name ?? picked?.name ?? "";
  const dirty = Boolean(draft && picked && (draft.name !== picked.name || draft.colors.join() !== picked.colors.join()));
  const valid = colors.length === 4 && colors.every((color) => normalize(color));

  function choose(group: Collection, index: number) {
    setCollection(group);
    setSelected(index);
    setDraft(null);
    setNote("");
  }

  function edit(change: Partial<{ name: string; colors: string[] }>) {
    if (!picked) return;
    setDraft({ name: name, colors: [...colors], ...change });
  }

  function setColor(at: number, value: string) {
    edit({ colors: colors.map((color, index) => index === at ? value : color) });
  }

  // The preview: the open picture with every tile in this palette (sprites: colors 1-3 on the shades, see-through shown as a checkerboard).
  const lut = useMemo(() => {
    if (!valid) return null;
    const normalized = colors.map((color) => normalize(color)!);
    return shadeLut(picture?.sprite ? spriteShades(normalized) : normalized);
  }, [colors, valid, picture?.sprite]);
  useEffect(() => {
    if (!canvas || !picture || !lut) return;
    canvas.width = picture.width;
    canvas.height = picture.height;
    const image = new ImageData(picture.width, picture.height);
    colorize(picture.pixels, new Uint8Array(Math.ceil(picture.width / 8) * Math.ceil(picture.height / 8)), picture.width, [lut], new Uint32Array(image.data.buffer));
    // See-through pixels get a checkerboard drawn in (4 px squares), so the preview can scale to fit its box.
    for (let y = 0; y < picture.height; y += 1) {
      for (let x = 0; x < picture.width; x += 1) {
        const at = (y * picture.width + x) * 4;
        if (image.data[at + 3]) continue;
        const light = ((x >> 2) ^ (y >> 2)) & 1 ? 0x8a : 0x74;
        image.data.set([light, light + 5, light + 14, 255], at);
      }
    }
    canvas.getContext("2d")!.putImageData(image, 0, 0);
  }, [canvas, picture, lut]);

  // Esc closes the window (the dialog does that); this keeps Esc from also reaching the painter, which would drop its
  // selection. And the painter's "Put in slot" menu opens over this window but outside it: a click in that menu must
  // not count as a click outside the window, so the last pointer-down remembers whether it was in a menu.
  const downInMenu = useRef(false);
  useEffect(() => {
    const onDown = (event: PointerEvent) => { downInMenu.current = Boolean((event.target as Element | null)?.closest?.("[role=menu]")); };
    const onKeyCapture = () => { downInMenu.current = false; };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") event.stopPropagation(); };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKeyCapture, true);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKeyCapture, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const onOpenChange = (open: boolean) => { if (!open && !downInMenu.current) onClose(); };

  function saveMine(list: Palette[]) {
    setMine(list);
    writeMine(list);
  }

  function newPalette() {
    const palette: Palette = { name: `Palette ${mine.length + 1}`, colors: ["#E0F8CF", "#86C06C", "#306850", "#071821"] };
    const list = [...mine, palette];
    saveMine(list);
    choose("mine", list.length - 1);
  }

  /** D, N and S versions of the picked palette (lilac, dark blue, warm), added to Mine as a starting point. */
  function makeVariants() {
    if (!picked || !valid) return;
    const four = colors.map((color) => normalize(color)!);
    const base = (name.trim() || picked.name).replace(/ [DNS]$/, "");
    const made = (["D", "N", "S"] as const).map((variant) => ({ name: `${base} ${variant}`, colors: paletteVariant(four, variant) }));
    const list = [...mine, ...made];
    saveMine(list);
    choose("mine", mine.length);
    setNote(`Made ${made.map((item) => item.name).join(", ")} in Mine: a starting point to tune.`);
  }

  function copyToMine(asCopy = false) {
    if (!picked || !valid) return;
    const list = [...mine, { name: asCopy || collection === "mine" ? `${name} copy` : name, colors: colors.map((color) => normalize(color)!) }];
    saveMine(list);
    choose("mine", list.length - 1);
    setNote("Copied to Mine.");
  }

  function saveToMine() {
    if (!picked || !valid || collection !== "mine") return;
    const list = mine.map((palette, index) => index === selected ? { name: name.trim() || palette.name, colors: colors.map((color) => normalize(color)!) } : palette);
    saveMine(list);
    setDraft(null);
    setNote("Saved.");
  }

  /** Moves the picked palette of Mine up (-1) or down (1). */
  function moveMine(step: number) {
    if (collection !== "mine" || !picked) return;
    const to = selected + step;
    if (to < 0 || to >= mine.length) return;
    const list = [...mine];
    [list[selected], list[to]] = [list[to], list[selected]];
    saveMine(list);
    setSelected(to);
  }

  /** The shown collection (the whole library, in the Library view) as a JSON file (names and colors), to keep or to import elsewhere. */
  function exportCollection() {
    const all = listed.flatMap((group) => group.palettes);
    const data = JSON.stringify({ palettes: all.map(({ name: own, colors: four }) => ({ name: own, colors: four })) }, null, 2);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    link.download = `${(view === "library" ? "Library" : current.label).replace(/[^\w .-]+/g, "").trim() || "palettes"}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setNote(`Exported ${all.length} palette${all.length === 1 ? "" : "s"}.`);
  }

  /** A palette from a Lospec link, into Mine (four colors a palette; the author goes in the name). */
  async function importLospec() {
    const link = await askText({ title: "Import from Lospec", label: "Lospec palette link or name", placeholder: "lospec.com/palette-list/…", hint: "Four colors a palette, lightest first; it goes into Mine.", confirm: "Import" });
    if (!link?.trim()) return;
    try {
      const found = await fetchLospec(link);
      if (!found.length) return setNote("That Lospec palette has fewer than four colors.");
      const list = [...mine, ...found];
      saveMine(list);
      choose("mine", mine.length);
      setNote(`Imported ${found.map((palette) => palette.name).join(", ")} from Lospec into Mine. Check its terms on Lospec before shipping it in a game.`);
    } catch (error) {
      setNote(`Could not get it from Lospec: ${(error as Error).message}`);
    }
  }

  /** Palettes from a file (JSON export, Lospec .hex, GIMP .gpl) into Mine. */
  function importFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.hex,.gpl,.txt";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const found = parsePaletteFile(file.name, await file.text());
      if (!found.length) return setNote(`${file.name}: no palettes of four colors found.`);
      const list = [...mine, ...found];
      saveMine(list);
      choose("mine", mine.length);
      setNote(`Imported ${found.length} palette${found.length === 1 ? "" : "s"} into Mine.`);
    };
    input.click();
  }

  /** Arrow keys walk the list (in the order shown); Home and End jump to its ends. */
  function listKey(event: React.KeyboardEvent) {
    const order = groups.flatMap((group) => group.rows);
    if (!order.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation(); // not the painter's arrow keys (they nudge a selection)
    const at = order.findIndex(isPicked);
    const next = event.key === "Home" ? 0 : event.key === "End" ? order.length - 1 : Math.min(order.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)));
    choose(order[next].group, order[next].index);
    (event.currentTarget.querySelectorAll("[role=option]")[next] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }

  async function removeFromProject() {
    if (collection !== "project" || !picked?.id || !onRemoveProject || busy) return;
    if (!window.confirm(`Take ${picked.name} out of the project? Nothing uses it; its file goes to the backups folder (Backups… can put it back).`)) return;
    setBusy(true);
    try {
      if (await onRemoveProject(picked.id, picked.name)) choose("project", Math.max(0, selected - 1));
    } finally {
      setBusy(false);
    }
  }

  function deleteMine() {
    if (collection !== "mine" || !picked) return;
    const list = mine.filter((_, index) => index !== selected);
    saveMine(list);
    choose("mine", Math.max(0, selected - 1));
  }

  // After an add, the project list arrives on the next render: land on the new palette by id.
  const pendingId = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingId.current) return;
    const index = projectPalettes.findIndex((palette) => palette.id === pendingId.current);
    if (index >= 0) {
      pendingId.current = null;
      setSelected(index);
    }
  }, [projectPalettes]);

  async function writeProject(asNew: boolean) {
    if (!picked || !valid || busy) return;
    setBusy(true);
    try {
      const id = await onWriteProject({ ...(asNew ? {} : { id: picked.id }), name: name.trim() || picked.name, colors: colors.map((color) => normalize(color)!) });
      if (id) {
        setNote(asNew ? `Added to ${projectName ?? "the project"} as ${name.trim() || picked.name}.` : "Saved into the project.");
        setDraft(null);
        if (asNew) {
          pendingId.current = id;
          setCollection("project");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const slotsHere = (palette: Palette) => Boolean(collection === "project" && palette.id && onSlotMenu && sceneSlots.length);
  const viewCount = (id: View) => id === "library" ? LIBRARY.reduce((sum, group) => sum + group.palettes.length, 0) : id === "project" ? projectPalettes.length : mine.length;
  const viewOption = (id: View, label: string, title: string) => ({ value: id, title: `${title} · ${viewCount(id)}`, label: <>{label} <span className="pm-count">{viewCount(id)}</span></> });

  return (
    <Dialog open onOpenChange={onOpenChange} wide tall title="Palettes" sub={projectName ?? "No project open"} icon={<SwatchBook size={18} />}
      headExtra={<Segmented size="sm" label="Collection" value={view} onChange={(next) => choose(next === "library" ? LIBRARY[0]?.name ?? "mine" : next, 0)} options={[
        viewOption("project", "Project", projectName ? `The palettes of ${projectName}` : "No project open"),
        viewOption("library", "Library", `Bundled with GB Cartographer: ${LIBRARY.map((group) => group.name).join(", ")}`),
        viewOption("mine", "Mine", "Your own palettes, kept in this browser"),
      ]} />}
      footer={<>
        <Button icon={<Upload />} title="Import palettes into Mine: a JSON export, a Lospec .hex or a GIMP .gpl (four colors a palette)" onClick={importFile}>Import…</Button>
        <Button icon={<Globe />} title="Import a palette from a Lospec link into Mine" onClick={() => void importLospec()}>Lospec link…</Button>
        <IconButton label="Export the palettes shown on the left as a JSON file" disabled={!listedCount} onClick={exportCollection}><Download /></IconButton>
        <IconButton label="New palette in Mine, in the GB greens" onClick={newPalette}><Plus /></IconButton>
        <span className="k-spacer" />
        {picked && dirty && <Button variant="ghost" onClick={() => setDraft(null)}>Revert</Button>}
        {picked && collection === "mine" && <Button variant="danger" icon={<Trash2 />} title="Remove from Mine" onClick={deleteMine}>Delete</Button>}
        {picked && collection === "project" && picked.id && onRemoveProject && usage && <IconButton variant="danger" label={unused(picked) ? "Remove from project: its file goes to the backups folder" : "Remove from project: only a palette no scene uses can be taken out"} disabled={busy || !unused(picked)} onClick={() => void removeFromProject()}><Trash2 /></IconButton>}
        {picked && slotsHere(picked) && <Button title="Put this palette in one of the open picture's slots (or right-click it in the list)" onClick={(event) => { const box = event.currentTarget.getBoundingClientRect(); onSlotMenu!(picked.id!, box.left, box.top); }}>Put in slot…</Button>}
        {picked && collection === "project" && picked.id && <Button title="Paint with this palette" onClick={() => { onPick(picked.id!); onClose(); }}>Use for brush</Button>}
        {picked && collection === "mine" && <Button disabled={!dirty || !valid} title="Save the changes into Mine" onClick={saveToMine}>Save</Button>}
        {picked && collection === "project" && <Button variant="primary" disabled={!dirty || !valid || busy} onClick={() => void writeProject(false)}>Save into project</Button>}
        {picked && collection !== "project" && <Button variant="primary" disabled={!projectName || !valid || busy} title={projectName ? `Add a new palette file to ${projectName}` : "Open a project first"} onClick={() => void writeProject(true)}>Add to project</Button>}
      </>}>
      <div className="pm-two">
        <div className="pm-left">
          <div className="k-row">
            <input type="search" className="k-input" placeholder="Filter" aria-label="Filter palettes by name" value={filter} onChange={(event) => setFilter(event.target.value)} />
            {collection === "mine" && <>
              <IconButton label="Move up in Mine" disabled={!picked || selected === 0} onClick={() => moveMine(-1)}><ArrowUp /></IconButton>
              <IconButton label="Move down in Mine" disabled={!picked || selected >= mine.length - 1} onClick={() => moveMine(1)}><ArrowDown /></IconButton>
            </>}
          </div>
          {view === "project" && usage && <span title="Show only palettes no scene uses, or with the same colors as another"><Checkbox checked={onlyOdd} onChange={setOnlyOdd}>Only unused or same colors</Checkbox></span>}
          <div className="pm-list" role="listbox" tabIndex={0} aria-label={`${view === "library" ? "Library" : current.label} palettes`} onKeyDown={listKey}>
            {groups.map((group) => group.rows.length > 0 && (
              <Fragment key={group.label || "all"}>
                {group.label && <span className="k-eyebrow">{group.label}</span>}
                {group.rows.map((row) => {
                  const { palette, index } = row;
                  return (
                    <button key={`${row.group}-${palette.id ?? ""}-${index}`} type="button" role="option" aria-selected={isPicked(row)} className="app-row" onClick={() => choose(row.group, index)} title={slotsHere(palette) ? "Right-click: put in a slot" : undefined}
                      onContextMenu={(event) => { if (!slotsHere(palette)) return; event.preventDefault(); choose(row.group, index); onSlotMenu!(palette.id!, event.clientX, event.clientY); }}>
                      {view === "project" && sceneSlots.length > 0 && <span className="app-slot">{slotOf(palette) >= 0 ? slotOf(palette) + 1 : ""}</span>}
                      <span className="app-chips">{palette.colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>
                      <span className="app-name">{palette.name}</span>
                      {/ N$/.test(palette.name) && <Chip title="A night version (N)">night</Chip>}
                      {closeShades(palette.colors, picture?.sprite).length > 0 && <Chip tone="warn" title="Two neighbouring shades are hard to tell apart">low contrast</Chip>}
                      {view === "project" && unused(palette) && <Chip title="No scene uses it (not a default either); events may still pick it">unused</Chip>}
                      {view === "project" && twin(palette) && <Chip title="Another project palette has the same four colors">same colors</Chip>}
                    </button>
                  );
                })}
              </Fragment>
            ))}
            {shown.length === 0 && <p className="pm-empty">{listedCount ? "No palette matches." : view === "project" ? "Open a GB Studio project to see its palettes." : "Nothing here yet. + makes one; Copy to Mine keeps any palette."}</p>}
          </div>
        </div>
        <div className="pm-right">
          {picked ? (
            <>
              <div className="k-row">
                <input type="text" className="k-input" aria-label="Palette name" value={name} onChange={(event) => edit({ name: event.target.value })} />
                <Button title="A copy in Mine, to edit freely" onClick={() => copyToMine(true)}>Duplicate</Button>
                <Button disabled={!valid} title="Make D, N and S versions of this palette in Mine (D lilac, N dark and blue, S warm), modeled on the DWC set: a starting point to tune" onClick={makeVariants}>D / N / S</Button>
                {collection !== "mine" && <Button disabled={!valid} title="Keep this palette in Mine" onClick={() => copyToMine(false)}>Copy to Mine</Button>}
              </div>
              <div className="pm-colors">
                {colors.map((color, at) => (
                  <div key={at} className="pm-color">
                    <input type="color" className="pm-swatch" aria-label={`Color ${at + 1}`} value={normalize(color) ?? "#000000"} onChange={(event) => setColor(at, event.target.value.toUpperCase())} />
                    <input type="text" className="k-input k-mono pm-hex" aria-label={`Color ${at + 1} hex`} aria-invalid={!normalize(color)} value={color} spellCheck={false} onChange={(event) => setColor(at, event.target.value)} />
                    <span className="k-hint">{at === 0 ? (picture?.sprite ? "see-through" : "lightest") : at === 3 ? "darkest" : ""}</span>
                  </div>
                ))}
              </div>
              <div className="pm-preview" aria-label="Preview of the open picture in this palette">
                {picture && lut ? <canvas ref={setCanvas} /> : <p>{picture ? "Four valid colors make a preview." : "Open a picture to preview it in this palette."}</p>}
              </div>
              {picture?.sprite && <p className="pm-note">Sprite sheet: color 0 is see-through in GB Studio; colors 1–3 dress the shades.</p>}
              {valid && closeShades(colors.map((color) => normalize(color)!), picture?.sprite).map(({ a, b, delta }) => (
                <div key={`${a}-${b}`} className="k-well pm-warn"><Chip tone="warn">Low contrast</Chip><span>{delta === 0 ? `Colors ${a + 1} and ${b + 1} are the same color.` : `Colors ${a + 1} and ${b + 1} are hard to tell apart (difference ${delta}; aim for 12 or more), especially on a real Game Boy screen.`}</span></div>
              ))}
              {collection === "project" && picked.id && usage && <UsedBy usage={usage.get(picked.id)} names={new Map(projectPalettes.map((palette) => [palette.id ?? "", palette.name]))} />}
              <p className="pm-note">{note || (collection === "project" ? "Save into project rewrites this palette's file · the old file goes to the backups folder" : projectName ? `Add to project writes project/palettes/${fileNameFor(name.trim() || picked.name)}` : "")}</p>
            </>
          ) : <p className="pm-empty">Pick a palette on the left.</p>}
        </div>
      </div>
      {promptDialog}
    </Dialog>
  );
}

interface PaletteUsage { id: string; uses: { kind: "background" | "sprite"; slot: number; scene: string | null; inherited?: boolean }[]; sameColors: string[] }

/** Where a project palette is used: the defaults, each scene's own slots, and the scenes that inherit a default. */
function UsedBy({ usage, names }: { usage: PaletteUsage | undefined; names: Map<string, string> }) {
  if (!usage) return null;
  const label = (use: PaletteUsage["uses"][number]) => `${use.kind === "sprite" ? "Sprite" : "Background"} slot ${use.slot + 1}`;
  const defaults = usage.uses.filter((use) => use.scene === null);
  const own = usage.uses.filter((use) => use.scene !== null && !use.inherited);
  const inherited = usage.uses.filter((use) => use.inherited);
  return (
    <div className="k-well pm-well">
      <span className="k-eyebrow">Used by</span>
      {!usage.uses.length && <p className="k-muted">No scene uses this palette, and it isn't a default. (An event may still switch to it.)</p>}
      {defaults.length > 0 && <p><b>Project defaults</b> · {defaults.map(label).join(", ")}</p>}
      {own.length > 0 && <p><b>Scenes</b> · {own.map((use) => `${use.scene} (${label(use).toLowerCase()})`).join(", ")}</p>}
      {inherited.length > 0 && <p className="k-muted">Through the defaults: {[...new Set(inherited.map((use) => use.scene))].join(", ")}</p>}
      {usage.sameColors.length > 0 && <p className="k-muted">Same four colors as {usage.sameColors.map((id) => names.get(id) ?? id).join(", ")}.</p>}
    </div>
  );
}
