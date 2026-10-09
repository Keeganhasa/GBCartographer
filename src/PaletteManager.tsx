/**
 * The palette manager: the open project's palettes, the bundled library (Game Boy classics and the author's
 * Chorbi palettes) and the user's own palettes ("Mine", kept per browser). Colors and names are edited on the
 * right with a live preview of the open picture; a palette can be added to the project (a new
 * project/palettes/<name>.gbsres) or, for a project palette, saved back into its file.
 */
import { Plus, Trash2, X } from "lucide-react";
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

const normalize = (color: string) => {
  const hex = color.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null;
};

export interface PaletteManagerProps {
  projectName: string | null;
  /** The project's palettes, with their GB Studio ids. */
  projectPalettes: Palette[];
  /** The open picture, flattened, for the preview. */
  picture: Picture | null;
  onClose: () => void;
  /** Writes a palette file into the project (a new one without `id`); resolves to the palette's id. */
  onWriteProject: (palette: { id?: string; name: string; colors: string[] }) => Promise<string | null>;
  /** Paints with this project palette: the palette brush picks it. */
  onPick: (paletteId: string) => void;
}

export default function PaletteManager({ projectName, projectPalettes, picture, onClose, onWriteProject, onPick }: PaletteManagerProps) {
  const [collection, setCollection] = useState<Collection>(projectPalettes.length ? "project" : LIBRARY[0]?.name ?? "mine");
  const [filter, setFilter] = useState("");
  const [mine, setMine] = useState<Palette[]>(() => readMine());
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<{ name: string; colors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const collections: { id: Collection; label: string; palettes: Palette[]; editable: boolean }[] = [
    { id: "project", label: projectName ? `Project · ${projectName}` : "Project (none open)", palettes: projectPalettes, editable: true },
    { id: "mine", label: "Mine", palettes: mine, editable: true },
    ...LIBRARY.map((group) => ({ id: group.name, label: group.name, palettes: group.palettes, editable: false })),
  ];
  const current = collections.find((group) => group.id === collection) ?? collections[0];
  const matches = (name: string) => !filter.trim() || name.toLowerCase().includes(filter.trim().toLowerCase());
  const shown = current.palettes.map((palette, index) => ({ palette, index })).filter(({ palette }) => matches(palette.name));
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

  function copyToMine() {
    if (!picked || !valid) return;
    const list = [...mine, { name: collection === "mine" ? `${name} copy` : name, colors: colors.map((color) => normalize(color)!) }];
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
      <div className="gbp-modal" role="dialog" aria-label="Palette manager" onClick={(event) => event.stopPropagation()}>
        <header className="gbp-modal-head">
          <h2>Palettes</h2>
          <span className="gbp-spacer" />
          <button className="icon-button small" aria-label="Close" title="Close · Esc" onClick={onClose}><X size={14} /></button>
        </header>
        <div className="gbp-modal-body">
          <div className="gbp-pm-list">
            <div className="gbp-pm-collections" role="tablist" aria-label="Collections">
              {collections.map((group) => <button key={group.id} role="tab" aria-selected={collection === group.id} className={collection === group.id ? "selected" : ""} onClick={() => choose(group.id, 0)}>{group.label}<small>{group.palettes.length}</small></button>)}
            </div>
            <div className="gbp-pm-tools">
              <input type="search" className="gbp-filter" placeholder="Filter by name" aria-label="Filter palettes by name" value={filter} onChange={(event) => setFilter(event.target.value)} />
              <button className="quiet-button" title="A new palette in Mine, in the GB greens" onClick={newPalette}><Plus size={14} />New</button>
            </div>
            <div className="gbp-palettes gbp-pm-rows" role="listbox" aria-label={`${current.label} palettes`}>
              {shown.map(({ palette, index }) => (
                <button key={`${palette.id ?? ""}-${index}`} role="option" aria-selected={selected === index} className={selected === index ? "selected" : ""} onClick={() => choose(current.id, index)}>
                  <span className="gbp-chips">{palette.colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>
                  <span>{palette.name}</span>
                </button>
              ))}
              {shown.length === 0 && <p className="gbp-note">{current.palettes.length ? "No palette matches." : current.id === "project" ? "Open a GB Studio project to see its palettes." : "Nothing here yet. New makes one; Copy to Mine keeps any palette."}</p>}
            </div>
          </div>
          <div className="gbp-pm-edit">
            {picked ? (
              <>
                <label className="gbp-pm-field">Name
                  <input type="text" value={name} onChange={(event) => edit({ name: event.target.value })} readOnly={!current.editable && collection !== "project"} />
                </label>
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
                  {picture?.sprite && <p className="gbp-note">Sprite sheet: color 0 is see-through in GB Studio; colors 1–3 dress the shades.</p>}
                </div>
                <div className="gbp-pm-actions">
                  {collection === "project" && <button className="quiet-button" disabled={!dirty || !valid || busy} title="Rewrite this palette's file in the project (the old file goes to the backups folder)" onClick={() => void writeProject(false)}>Save into project</button>}
                  {collection === "project" && picked.id && <button className="quiet-button" title="Paint with this palette" onClick={() => { onPick(picked.id!); onClose(); }}>Use for the palette brush</button>}
                  {collection !== "project" && <button className="quiet-button" disabled={!projectName || !valid || busy} title={projectName ? `Add a new palette file to ${projectName}` : "Open a project first"} onClick={() => void writeProject(true)}>Add to project</button>}
                  {collection === "mine" ? (
                    <>
                      <button className="quiet-button" disabled={!dirty || !valid} onClick={saveToMine}>Save</button>
                      <button className="quiet-button danger" title="Remove from Mine" onClick={deleteMine}><Trash2 size={14} />Delete</button>
                    </>
                  ) : <button className="quiet-button" disabled={!valid} title="Keep a copy in Mine to edit freely" onClick={copyToMine}>Copy to Mine</button>}
                  {dirty && <button className="quiet-button" onClick={() => setDraft(null)}>Revert</button>}
                </div>
                {note && <p className="gbp-note gbp-pm-note">{note}</p>}
              </>
            ) : <p className="gbp-note">Pick a palette on the left.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
