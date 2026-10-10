/**
 * New background (W4, the author's pick 2026-10-10): a blank scene background sized in whole screens, with its
 * palettes ready: the project's current default palettes, a set from the library (added to the project and put in
 * the default slots), or just the greens. The parent writes the PNG and the palettes.
 */
import { FileImage } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Chip, Dialog, Field, Segmented, Select } from "../ui/kit";
import library from "../palettes/library.json";

const SIZES: [number, number, string][] = [[1, 1, "1 screen"], [2, 1, "2 wide"], [1, 2, "2 tall"], [2, 2, "2 × 2"], [3, 1, "3 wide"], [4, 1, "4 wide"]];

export interface NewBackground { name: string; width: number; height: number; /** Palettes to add and put in slots 1…n; null keeps the project's defaults. */ palettes: { name: string; colors: string[] }[] | null }

interface Props {
  projectName: string;
  /** The project's palettes, to show the default slots ("The project's defaults"). */
  palettes: { id?: string; name: string; colors: string[] }[];
  onClose: () => void;
  onCreate: (background: NewBackground) => Promise<boolean>;
}

const Chips = ({ colors }: { colors: readonly string[] }) => <span className="app-chips">{colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>;

export function NewBackgroundWizard({ projectName, palettes, onClose, onCreate }: Props) {
  // The project's default background palettes, in slot order (the palette usage report says which slot each is in).
  const [defaults, setDefaults] = useState<{ name: string; colors: string[] }[]>([]);
  useEffect(() => {
    void fetch("./__cartographer/palette-usage", { cache: "no-cache" }).then((response) => response.json() as Promise<{ palettes?: { id: string; uses: { kind: string; slot: number; scene: string | null }[] }[] }>).then((usage) => {
      const slots: { name: string; colors: string[] }[] = [];
      for (const entry of usage.palettes ?? []) for (const use of entry.uses) if (use.scene === null && use.kind === "background") { const palette = palettes.find((item) => item.id === entry.id); if (palette) slots[use.slot] = palette; }
      setDefaults(slots.filter(Boolean));
    }).catch(() => setDefaults([]));
  }, [palettes]);
  const [name, setName] = useState("");
  const [size, setSize] = useState("1x1");
  const [source, setSource] = useState<"defaults" | "library" | "greens">("defaults");
  const collections = (library as { collections: { name: string; palettes: { name: string; colors: string[] }[] }[] }).collections.filter((group) => group.palettes.length >= 2);
  const [collection, setCollection] = useState(collections.find((group) => /chorbi/i.test(group.name))?.name ?? collections[0]?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [columns, rows] = size.split("x").map(Number);
  const width = columns * 160, height = rows * 144;
  const set = collections.find((group) => group.name === collection)?.palettes.slice(0, 8) ?? [];
  const shown = source === "defaults" ? defaults : source === "library" ? set : [];
  const valid = /^[\w ()\-.]+$/.test(name.trim());
  async function create() {
    setBusy(true);
    const done = await onCreate({ name: name.trim(), width, height, palettes: source === "library" ? set.map(({ name: own, colors }) => ({ name: own, colors: [...colors] })) : null });
    setBusy(false);
    if (done) onClose();
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }} title="New background" sub={`A blank background in ${projectName}, sized in screens`} icon={<FileImage size={18} />}
      footer={<><span className="k-muted k-small">Never replaces a file</span><span className="k-spacer" /><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" disabled={!valid || busy} title={valid ? undefined : "Give it a name (letters, digits, spaces, - _ ( ) .)"} onClick={() => void create()}>{busy ? "Making…" : "Create and open"}</Button></>}>
      <div className="k-stack--loose k-stack">
        <Field label="Name"><input className="k-input" autoFocus placeholder="e.g. Market Street" value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <div className="k-stack k-stack--tight">
          <span className="k-label">Size</span>
          <Segmented fill size="sm" label="Size" value={size} onChange={setSize} options={SIZES.map(([c, r, label]) => ({ value: `${c}x${r}`, label, title: `${c * 160} × ${r * 144} px` }))} />
          <span className="k-row"><Chip>{width} × {height} px</Chip><Chip>{(width / 8) * (height / 8)} tiles</Chip></span>
        </div>
        <div className="k-stack k-stack--tight">
          <span className="k-label">Palettes</span>
          <Segmented fill size="sm" label="Palettes" value={source} onChange={(value) => setSource(value as typeof source)} options={[{ value: "defaults", label: "The project's defaults" }, { value: "library", label: "A library set" }, { value: "greens", label: "Just the greens" }]} />
          {source === "library" && <Select label="Library set" value={collection} onChange={setCollection} options={collections.map((group) => ({ value: group.name, label: `${group.name} · ${group.palettes.length}` }))} />}
          {shown.length > 0 && <div className="app-list">{shown.map((palette, slot) => <div key={slot} className="app-row" style={{ cursor: "default" }}><span className="app-slot">{slot + 1}</span><Chips colors={palette.colors} /><span className="app-name">{palette.name}</span></div>)}</div>}
        </div>
        <div className="k-well m-path" style={{ padding: "10px 12px" }}>
          Creates <code className="k-mono">assets/backgrounds/{name.trim() || "…"}.png</code> in the lightest shade.{source === "library" ? ` Adds the ${set.length} palettes to the project and puts them in its default background slots 1–${set.length} (asked first; every scene without its own palettes uses them).` : source === "defaults" ? " Its tiles use the project's default palettes, as above." : " No palettes: paint it in the greens, give tiles palettes later."}
        </div>
      </div>
    </Dialog>
  );
}
