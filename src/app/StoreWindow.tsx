/**
 * The store (2026-10-10): sets GB Cartographer ships, credited, for taking into a project piecemeal. Shelves on the
 * left (who made them, the license), the shelf's sets as cards on the right: add a whole set or one palette at a
 * time, to the project or to Mine. A palette the project already has (same name and colors) shows as added.
 * Palettes for now; the demo's art can join as more shelves later.
 */
import { Check, ExternalLink, Plus, Search, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Chip, Dialog, IconButton } from "../ui/kit";
import { hasPalette, storeShelves, type StorePalette, type StoreSet } from "./store";
import "./StoreWindow.css";

interface Props {
  projectName: string | null;
  /** The project's palettes, to mark what it has already. */
  projectPalettes: readonly StorePalette[];
  onClose: () => void;
  /** Adds palettes to the project; resolves to how many were written. */
  onAddToProject: (palettes: StorePalette[]) => Promise<number>;
  onAddToMine: (palettes: StorePalette[]) => void;
}

const SHELVES = storeShelves();
const Strip = ({ colors }: { colors: readonly string[] }) => <span className="app-chips">{colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>;

export function StoreWindow({ projectName, projectPalettes, onClose, onAddToProject, onAddToMine }: Props) {
  const [shelfName, setShelfName] = useState(SHELVES.find((shelf) => shelf.name === "Overworld")?.name ?? SHELVES[0]?.name ?? "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Set<string>>(new Set());

  // A search looks through every shelf: sets whose name, or any palette's name, matches.
  const needle = query.trim().toLowerCase();
  const found = useMemo(() => !needle ? null : SHELVES.map((shelf) => ({ ...shelf, sets: shelf.sets.map((set) => set.name.toLowerCase().includes(needle) ? set : { ...set, palettes: set.palettes.filter((palette) => palette.name.toLowerCase().includes(needle)) }).filter((set) => set.palettes.length) })).filter((shelf) => shelf.sets.length), [needle]);
  const shelves = found ?? SHELVES.filter((shelf) => shelf.name === shelfName);

  const has = (palette: StorePalette) => hasPalette(projectPalettes, palette);
  async function add(palettes: StorePalette[]) {
    setBusy(true);
    await onAddToProject(palettes.filter((palette) => !has(palette)));
    setBusy(false);
  }
  function toMine(set: StoreSet) {
    onAddToMine(set.palettes);
    setMine(new Set(mine).add(set.id));
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }} wide tall title="Store" icon={<Store size={18} />}
      sub={projectName ? `Palette sets to take into ${projectName}: a whole set, or one palette at a time` : "Palette sets: open a project to add them to it, or keep them in Mine"}>
      <div className="st">
        <nav className="st-shelves k-stack k-stack--tight" aria-label="Shelves">
          <label className="st-search"><Search size={14} /><input className="k-input" placeholder="Find a palette" aria-label="Find a palette" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          {SHELVES.map((shelf) => (
            <button key={shelf.name} type="button" className="app-row st-shelf" aria-pressed={!found && shelf.name === shelfName} onClick={() => { setShelfName(shelf.name); setQuery(""); setOpen(null); }}>
              <span className="app-name">{shelf.name}</span>
              <span className="k-muted k-xs">{shelf.sets.reduce((sum, set) => sum + set.palettes.length, 0)}</span>
            </button>
          ))}
        </nav>
        <div className="st-body">
          {shelves.length === 0 && <p className="k-muted k-small">No palette matches “{query}”.</p>}
          {shelves.map((shelf) => (
            <section key={shelf.name} className="k-stack">
              <header className="st-head">
                <span className="st-title">{shelf.name}</span>
                {shelf.author && <span className="k-muted k-small">by {shelf.author}</span>}
                {shelf.license && <Chip tone="acc" title="Free to use in your game, including commercially">{shelf.license}</Chip>}
                {shelf.source && <a className="st-source k-small" href={shelf.source} target="_blank" rel="noreferrer">Source <ExternalLink size={12} /></a>}
              </header>
              {shelf.about && <p className="k-muted k-small st-about">{shelf.about}</p>}
              <div className="st-sets">
                {shelf.sets.map((set) => {
                  const added = set.palettes.filter(has).length, all = added === set.palettes.length;
                  const expanded = open === set.id || Boolean(found);
                  return (
                    <article key={set.id} className="k-card st-set">
                      <button type="button" className="st-set-top" aria-expanded={expanded} onClick={() => setOpen(open === set.id ? null : set.id)} title={expanded ? "Hide its palettes" : "Show its palettes, to add one at a time"}>
                        <span className="st-set-name">{set.name}</span>
                        <span className="k-muted k-xs">{set.palettes.length} palette{set.palettes.length === 1 ? "" : "s"}{added && !all ? ` · ${added} added` : ""}</span>
                        <span className="st-swatches">{set.palettes.slice(0, 12).map((palette) => <Strip key={palette.name} colors={palette.colors} />)}{set.palettes.length > 12 && <span className="k-muted k-xs">+{set.palettes.length - 12}</span>}</span>
                      </button>
                      {set.about && <p className="k-muted k-xs st-about">{set.about}</p>}
                      {expanded && (
                        <div className="app-list st-palettes">
                          {set.palettes.map((palette) => (
                            <div key={palette.name} className="app-row st-palette">
                              <Strip colors={palette.colors} /><span className="app-name">{palette.name}</span>
                              {has(palette) ? <Check size={14} className="st-added" aria-label="In the project" />
                                : <IconButton size="sm" variant="ghost" label={projectName ? `Add ${palette.name} to the project` : "Open a project to add palettes"} disabled={!projectName || busy} onClick={() => void add([palette])}><Plus /></IconButton>}
                            </div>
                          ))}
                        </div>
                      )}
                      <span className="k-row st-actions">
                        {all && projectName ? <Chip tone="acc"><Check size={12} /> In the project</Chip>
                          : <Button size="sm" variant="primary" disabled={!projectName || busy} title={projectName ? "Adds every palette of the set the project doesn't have yet" : "Open a project to add palettes"} onClick={() => void add(set.palettes)}>{added ? "Add the rest" : "Add set"}</Button>}
                        <Button size="sm" variant="ghost" disabled={mine.has(set.id)} title="Keep the set in Mine (the palette manager), for any project" onClick={() => toMine(set)}>{mine.has(set.id) ? "In Mine" : "To Mine"}</Button>
                      </span>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
