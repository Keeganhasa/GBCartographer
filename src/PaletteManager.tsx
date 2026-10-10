/**
 * The palette manager: the open project's palettes, the bundled library (Game Boy classics and the author's
 * Chorbi palettes) and the user's own palettes ("Mine", kept per browser). Colors and names are edited on the
 * right with a live preview of the open picture; a palette can be added to the project (a new
 * project/palettes/<name>.gbsres) or, for a project palette, saved back into its file.
 */
import { FolderTree, Gamepad2, Layers, Plus, Star, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import library from "./palettes/library.json";
import { colorize, shadeLut, spriteShades, type Palette } from "./paint";

type Collection = "project" | "mine" | string;
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
const COLLECTION_ICONS: Record<string, typeof Star> = { project: FolderTree, mine: Star, "Game Boy": Gamepad2, Chorbi: Layers };

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
}

export default function PaletteManager({ projectName, projectPalettes, sceneSlots, picture, onClose, onWriteProject, onPick, onSlotMenu }: PaletteManagerProps) {
  const [collection, setCollection] = useState<Collection>(projectPalettes.length ? "project" : LIBRARY[0]?.name ?? "mine");
  const [filter, setFilter] = useState("");
  const [mine, setMine] = useState<Palette[]>(() => readMine());
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<{ name: string; colors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  const matches = (name: string) => !filter.trim() || name.toLowerCase().includes(filter.trim().toLowerCase());
  const shown = current.palettes.map((palette, index) => ({ palette, index })).filter(({ palette }) => matches(palette.name) && (!onlyOdd || collection !== "project" || unused(palette) || twin(palette)));
  // The project list leads with the open picture's slots, in slot order, then everything else.
  const slotOf = (palette: Palette) => palette.id ? sceneSlots.indexOf(palette.id) : -1;
  const groups = collection === "project" && sceneSlots.length
    ? [{ label: "Scene slots", rows: shown.filter(({ palette }) => slotOf(palette) >= 0).sort((a, b) => slotOf(a.palette) - slotOf(b.palette)) }, { label: "Others in the project", rows: shown.filter(({ palette }) => slotOf(palette) < 0) }]
    : [{ label: "", rows: shown }];
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
    const canvas = canvasRef.current;
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
  }, [picture, lut]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

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

  return (
    <div className="gbp-modal-backdrop" onClick={onClose}>
      <div className="gbp-modal gbp-pm" role="dialog" aria-label="Palette manager" onClick={(event) => event.stopPropagation()}>
        <nav className="gbp-pm-rail" aria-label="Collections">
          {collections.map((group) => { const Icon = COLLECTION_ICONS[group.id] ?? Layers; return <button key={group.id} className={`icon-button ${collection === group.id ? "active-tool" : ""}`} aria-pressed={collection === group.id} aria-label={`${group.label} (${group.palettes.length})`} title={`${group.label} · ${group.palettes.length}`} onClick={() => choose(group.id, 0)}><Icon size={16} /><b>{group.palettes.length}</b></button>; })}
          <span className="gbp-spacer" />
          <button className="icon-button" aria-label="New palette" title="A new palette in Mine, in the GB greens" onClick={newPalette}><Plus size={16} /></button>
          <button className="icon-button" aria-label="Close" title="Close · Esc" onClick={onClose}><X size={16} /></button>
        </nav>
        <div className="gbp-pm-list">
          <div className="gbp-pm-head"><span className="eyebrow">{current.label}</span><input type="search" className="gbp-filter" placeholder="Filter" aria-label="Filter palettes by name" value={filter} onChange={(event) => setFilter(event.target.value)} />
            {collection === "project" && usage && <label className="gbp-check" title="Show only palettes no scene uses, or with the same colors as another"><input type="checkbox" checked={onlyOdd} onChange={(event) => setOnlyOdd(event.target.checked)} />Only unused or same colors</label>}
          </div>
          <div className="gbp-palettes gbp-pm-rows" role="listbox" aria-label={`${current.label} palettes`}>
            {groups.map((group) => group.rows.length > 0 && (
              <div key={group.label} className="gbp-pm-group">
                {group.label && <span className="eyebrow">{group.label}</span>}
                {group.rows.map(({ palette, index }) => (
                  <button key={`${palette.id ?? ""}-${index}`} role="option" aria-selected={selected === index} className={selected === index ? "selected" : ""} onClick={() => choose(current.id, index)} title={collection === "project" && palette.id && onSlotMenu && sceneSlots.length ? "Right-click: put in a slot" : undefined} onContextMenu={(event) => { if (collection !== "project" || !palette.id || !onSlotMenu || !sceneSlots.length) return; event.preventDefault(); choose(current.id, index); onSlotMenu(palette.id, event.clientX, event.clientY); }}>
                    <span className="gbp-chips">{palette.colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>
                    <span>{palette.name}</span>
                    {collection === "project" && unused(palette) && <small className="gbp-pm-tag" title="No scene uses it (not a default either); events may still pick it">unused</small>}
                    {collection === "project" && twin(palette) && <small className="gbp-pm-tag" title="Another project palette has the same four colors">same colors</small>}
                    {slotOf(palette) >= 0 && collection === "project" && <small className="gbp-slot">{slotOf(palette) + 1}</small>}
                  </button>
                ))}
              </div>
            ))}
            {shown.length === 0 && <p className="gbp-note">{current.palettes.length ? "No palette matches." : current.id === "project" ? "Open a GB Studio project to see its palettes." : "Nothing here yet. + makes one; Copy to Mine keeps any palette."}</p>}
          </div>
        </div>
        <div className="gbp-pm-edit">
          {picked ? (
            <>
              <div className="gbp-pm-title">
                <input type="text" aria-label="Palette name" value={name} onChange={(event) => edit({ name: event.target.value })} />
                <button className="quiet-button" title="A copy in Mine, to edit freely" onClick={() => copyToMine(true)}>Duplicate</button>
                {collection !== "mine" && <button className="quiet-button" disabled={!valid} title="Keep this palette in Mine" onClick={() => copyToMine(false)}>Copy to Mine</button>}
              </div>
              <div className="gbp-pm-colors">
                {colors.map((color, at) => (
                  <div key={at} className="gbp-pm-color">
                    <input type="color" aria-label={`Color ${at + 1}`} value={normalize(color) ?? "#000000"} onChange={(event) => setColor(at, event.target.value.toUpperCase())} />
                    <input type="text" aria-label={`Color ${at + 1} hex`} value={color} spellCheck={false} onChange={(event) => setColor(at, event.target.value)} className={normalize(color) ? "" : "invalid"} />
                    <small>{at === 0 ? (picture?.sprite ? "see-through" : "lightest") : at === 3 ? "darkest" : ""}</small>
                  </div>
                ))}
              </div>
              <div className="gbp-pm-preview">
                {picture && lut ? <canvas ref={canvasRef} style={{ aspectRatio: `${picture.width} / ${picture.height}` }} /> : <p className="gbp-note">{picture ? "Four valid colors make a preview." : "Open a picture to preview it in this palette."}</p>}
              </div>
              <div className="gbp-pm-actions">
                {collection === "project" && <button className="quiet-button primary" disabled={!dirty || !valid || busy} onClick={() => void writeProject(false)}>Save into project</button>}
                {collection !== "project" && <button className="quiet-button primary" disabled={!projectName || !valid || busy} title={projectName ? `Add a new palette file to ${projectName}` : "Open a project first"} onClick={() => void writeProject(true)}>Add to project</button>}
                {collection === "project" && picked.id && <button className="quiet-button" title="Paint with this palette" onClick={() => { onPick(picked.id!); onClose(); }}>Use for brush</button>}
                {collection === "mine" && <button className="quiet-button" disabled={!dirty || !valid} onClick={saveToMine}>Save</button>}
                {collection === "mine" && <button className="quiet-button danger" title="Remove from Mine" onClick={deleteMine}><Trash2 size={14} />Delete</button>}
                {dirty && <button className="quiet-button" onClick={() => setDraft(null)}>Revert</button>}
                <span className="gbp-pm-note">{note || (collection === "project" ? "Rewrites this palette's file in the project · the old file goes to the backups folder" : projectName ? `Adds project/palettes/${fileNameFor(name.trim() || picked.name)}` : "")}</span>
              </div>
              {picture?.sprite && <p className="gbp-note">Sprite sheet: color 0 is see-through in GB Studio; colors 1–3 dress the shades.</p>}
              {collection === "project" && picked.id && usage && <UsedBy usage={usage.get(picked.id)} names={new Map(projectPalettes.map((palette) => [palette.id ?? "", palette.name]))} />}
            </>
          ) : <p className="gbp-note">Pick a palette on the left.</p>}
        </div>
      </div>
    </div>
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
    <div className="gbp-pm-usage">
      <span className="eyebrow">Used by</span>
      {!usage.uses.length && <p className="gbp-note">No scene uses this palette, and it isn't a default. (An event may still switch to it.)</p>}
      {defaults.length > 0 && <p><b>Project defaults</b> · {defaults.map(label).join(", ")}</p>}
      {own.length > 0 && <p><b>Scenes</b> · {own.map((use) => `${use.scene} (${label(use).toLowerCase()})`).join(", ")}</p>}
      {inherited.length > 0 && <p className="gbp-note">Through the defaults: {[...new Set(inherited.map((use) => use.scene))].join(", ")}</p>}
      {usage.sameColors.length > 0 && <p className="gbp-note">Same four colors as {usage.sameColors.map((id) => names.get(id) ?? id).join(", ")}.</p>}
    </div>
  );
}
