/**
 * The store (2026-10-10): what GB Cartographer ships, credited, for taking into a project piecemeal. Two aisles:
 * palette sets (shelves of sets: add a whole set or one palette at a time, to the project or to Mine; a palette the
 * project already has shows as added) and the graphics library (placeholder art by kind: add it to the project as a
 * new PNG, or open it as a new picture). Each shelf says who made it, its license (the License button explains it)
 * and where it comes from (Source).
 */
import { Check, ExternalLink, FilePlus2, Plus, Scale, Search, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toRgba } from "../paint";
import { Button, Chip, Dialog, IconButton, Popover, Segmented } from "../ui/kit";
import type { Canvas } from "../graphics/pen";
import type { WireAsset } from "../graphics/types";

// The graphics library is local-only until its art is approved: the aisle shows when its catalog is there.
const GRAPHICS_LIBRARY = Object.values(import.meta.glob<{ GRAPHICS: WireAsset[]; GRAPHIC_GROUPS: string[] }>("../graphics/library.ts", { eager: true }))[0];
const GRAPHICS = GRAPHICS_LIBRARY?.GRAPHICS ?? [];
const GRAPHIC_GROUPS = GRAPHICS_LIBRARY?.GRAPHIC_GROUPS ?? [];
import { LICENSES, hasPalette, storeShelves, type StorePalette, type StoreSet } from "./store";
import "./StoreWindow.css";

interface Props {
  projectName: string | null;
  /** The project's palettes, to mark what it has already. */
  projectPalettes: readonly StorePalette[];
  onClose: () => void;
  /** Adds palettes to the project; resolves to how many were written. */
  onAddToProject: (palettes: StorePalette[]) => Promise<number>;
  onAddToMine: (palettes: StorePalette[]) => void;
  /** Puts a graphic in the project as a new PNG (and opens it). */
  onAddArt: (asset: WireAsset, art: Canvas) => Promise<boolean>;
  /** Opens a graphic as a new, unsaved picture. */
  onOpenArt: (asset: WireAsset, art: Canvas) => void;
}

const SHELVES = storeShelves();
const GRAPHICS_CREDIT = { author: "Keegan (GB Cartographer)", license: "CC0", source: "https://github.com/Keeganhasa/GBCartographer/tree/main/src/graphics" };
const KIND_NAMES: Record<string, string> = { sprites: "Sprite", emotes: "Emote", avatars: "Avatar", ui: "UI", tilesets: "Tileset", backgrounds: "Background" };
/** Sites the store links to, in their own colors (a Source button wears its site's). */
const SITES: { host: RegExp; name: string; color: string }[] = [
  { host: /(^|\.)itch\.io$/, name: "itch.io", color: "#FA5C5C" },
  { host: /(^|\.)opengameart\.org$/, name: "OpenGameArt", color: "#4A6898" },
];
const siteOf = (url: string) => { try { const host = new URL(url).hostname; return SITES.find((site) => site.host.test(host)) ?? null; } catch { return null; } };
/** More art and palettes elsewhere: Game Boy assets on itch.io and OpenGameArt. */
const ELSEWHERE = [
  { url: "https://itch.io/game-assets/tag-gameboy", title: "Game Boy assets on itch.io" },
  { url: "https://opengameart.org/art-search?keys=gameboy", title: "Game Boy art on OpenGameArt.org" },
];
const visit = (url: string) => window.open(url, "_blank", "noreferrer");

/** A button to another site: in its colors when it's one we know, else a plain one. */
function SiteButton({ url, label, title }: { url: string; label?: string; title?: string }) {
  const site = siteOf(url);
  return site
    ? <Button size="sm" variant="brand" icon={<ExternalLink />} title={title ?? url} style={{ ["--k-brand" as string]: site.color }} onClick={() => visit(url)}>{label ?? site.name}</Button>
    : <Button size="sm" variant="ghost" icon={<ExternalLink />} title={title ?? url} onClick={() => visit(url)}>{label ?? "Source"}</Button>;
}

const Strip = ({ colors }: { colors: readonly string[] }) => <span className="app-chips">{colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>;

/** Who made a shelf, its license (explained on click) and a button to its source. */
function Credit({ author, license, source }: { author?: string; license?: string; source?: string }) {
  const terms = license ? LICENSES[license] : undefined;
  return (
    <>
      {author && <span className="k-muted k-small">by {author}</span>}
      {license && (terms
        ? <Popover trigger={<Button size="sm" variant="ghost" icon={<Scale />} title="What this license lets you do">{license}</Button>}>
            <div className="st-license k-stack k-stack--tight"><b>{license}</b><span className="k-small">{terms.text}</span>
              {terms.link && <Button size="sm" icon={<ExternalLink />} onClick={() => visit(terms.link!)}>Read the license</Button>}</div>
          </Popover>
        : <Chip tone="acc">{license}</Chip>)}
      {source && <SiteButton url={source} />}
    </>
  );
}

/** A graphic drawn small: pixels scaled up, see-through shown as see-through. */
function Preview({ art }: { art: Canvas }) {
  const [target, setTarget] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!target) return;
    Object.assign(target, { width: art.width, height: art.height });
    const cells = new Uint8Array(Math.ceil(art.width / 8) * Math.ceil(art.height / 8));
    target.getContext("2d")!.putImageData(new ImageData(toRgba(art.pixels, cells, art.width, []), art.width, art.height), 0, 0);
  }, [art, target]);
  const scale = Math.max(1, Math.min(4, Math.floor(300 / art.width), Math.floor(140 / art.height)));
  return <canvas ref={setTarget} className="st-art" style={{ width: art.width * scale, height: art.height * scale }} />;
}

export function StoreWindow({ projectName, projectPalettes, onClose, onAddToProject, onAddToMine, onAddArt, onOpenArt }: Props) {
  const [aisle, setAisle] = useState<"palettes" | "graphics">("palettes");
  const [shelfName, setShelfName] = useState(SHELVES.find((shelf) => shelf.name === "Overworld")?.name ?? SHELVES[0]?.name ?? "");
  const [group, setGroup] = useState(GRAPHIC_GROUPS[0] ?? "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());

  const needle = query.trim().toLowerCase();
  // A search looks through every shelf: sets whose name, or any palette's name, matches.
  const found = useMemo(() => !needle ? null : SHELVES.map((shelf) => ({ ...shelf, sets: shelf.sets.map((set) => set.name.toLowerCase().includes(needle) ? set : { ...set, palettes: set.palettes.filter((palette) => palette.name.toLowerCase().includes(needle)) }).filter((set) => set.palettes.length) })).filter((shelf) => shelf.sets.length), [needle]);
  const shelves = found ?? SHELVES.filter((shelf) => shelf.name === shelfName);
  const arts = useMemo(() => (needle ? GRAPHICS.filter((asset) => `${asset.name} ${asset.group}`.toLowerCase().includes(needle)) : GRAPHICS.filter((asset) => asset.group === group)).map((asset) => ({ asset, art: asset.make() })), [needle, group]);

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
  async function addArt(asset: WireAsset, art: Canvas) {
    setBusy(true);
    if (await onAddArt(asset, art)) setAdded(new Set(added).add(asset.id));
    setBusy(false);
  }

  const nav = aisle === "palettes"
    ? SHELVES.map((shelf) => ({ key: shelf.name, label: shelf.name, count: shelf.sets.reduce((sum, set) => sum + set.palettes.length, 0), on: !found && shelf.name === shelfName, pick: () => setShelfName(shelf.name) }))
    : GRAPHIC_GROUPS.map((name) => ({ key: name, label: name, count: GRAPHICS.filter((asset) => asset.group === name).length, on: !needle && name === group, pick: () => setGroup(name) }));

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }} wide tall title="Store" icon={<Store size={18} />}
      sub={projectName ? `Credited ${GRAPHICS.length ? "palettes and graphics" : "palettes"} to take into ${projectName}, piece by piece` : `Credited ${GRAPHICS.length ? "palettes and graphics" : "palettes"}: open a project to add them to it`}
      headExtra={GRAPHICS.length > 0 && <Segmented size="sm" label="Aisle" value={aisle} onChange={(next) => { setAisle(next); setQuery(""); setOpen(null); }} options={[{ value: "palettes", label: "Palettes" }, { value: "graphics", label: "Graphics" }]} />}>
      <div className="st">
        <nav className="st-shelves k-stack k-stack--tight" aria-label="Shelves">
          <label className="st-search"><Search size={14} /><input className="k-input" placeholder={aisle === "palettes" ? "Find a palette" : "Find graphics"} aria-label="Find" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          {nav.map((item) => (
            <button key={item.key} type="button" className="app-row st-shelf" aria-pressed={item.on} onClick={() => { item.pick(); setQuery(""); setOpen(null); }}>
              <span className="app-name">{item.label}</span><span className="k-muted k-xs">{item.count}</span>
            </button>
          ))}
          <div className="st-elsewhere k-stack k-stack--tight">
            <span className="k-label">Find more</span>
            {ELSEWHERE.map((site) => <SiteButton key={site.url} url={site.url} title={site.title} />)}
          </div>
        </nav>
        <div className="st-body">
          {aisle === "palettes" && <>
            {shelves.length === 0 && <p className="k-muted k-small">No palette matches “{query}”.</p>}
            {shelves.map((shelf) => (
              <section key={shelf.name} className="k-stack">
                <header className="st-head"><span className="st-title">{shelf.name}</span><Credit author={shelf.author} license={shelf.license} source={shelf.source} /></header>
                {shelf.about && <p className="k-muted k-small st-about">{shelf.about}</p>}
                <div className="st-sets">
                  {shelf.sets.map((set) => {
                    const count = set.palettes.filter(has).length, all = count === set.palettes.length;
                    const expanded = open === set.id || Boolean(found);
                    return (
                      <article key={set.id} className="k-card st-set">
                        <button type="button" className="st-set-top" aria-expanded={expanded} onClick={() => setOpen(open === set.id ? null : set.id)} title={expanded ? "Hide its palettes" : "Show its palettes, to add one at a time"}>
                          <span className="st-set-name">{set.name}</span>
                          <span className="k-muted k-xs">{set.palettes.length} palette{set.palettes.length === 1 ? "" : "s"}{count && !all ? ` · ${count} added` : ""}</span>
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
                            : <Button size="sm" variant="primary" disabled={!projectName || busy} title={projectName ? "Adds every palette of the set the project doesn't have yet" : "Open a project to add palettes"} onClick={() => void add(set.palettes)}>{count ? "Add the rest" : "Add set"}</Button>}
                          <Button size="sm" variant="ghost" disabled={mine.has(set.id)} title="Keep the set in Mine (the palette manager), for any project" onClick={() => toMine(set)}>{mine.has(set.id) ? "In Mine" : "To Mine"}</Button>
                        </span>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </>}
          {aisle === "graphics" && (
            <section className="k-stack">
              <header className="st-head"><span className="st-title">{needle ? `Graphics matching “${query}”` : group}</span><Credit {...GRAPHICS_CREDIT} /></header>
              <p className="k-muted k-small st-about">Placeholder art drawn in plain shapes, ready to paint over your own way. Sprites come in GB Studio's classic strip, so it sets up their animations by itself.</p>
              {arts.length === 0 && <p className="k-muted k-small">Nothing matches “{query}”.</p>}
              <div className="st-sets st-sets--art">
                {arts.map(({ asset, art }) => (
                  <article key={asset.id} className="k-card st-set">
                    <div className="st-art-box"><Preview art={art} /></div>
                    <span className="st-set-name">{asset.name}</span>
                    <span className="k-row"><Chip>{KIND_NAMES[asset.kind] ?? asset.kind}</Chip><span className="k-muted k-xs">{art.width} × {art.height}</span></span>
                    {asset.about && <p className="k-muted k-xs st-about">{asset.about}</p>}
                    <span className="k-row st-actions">
                      {added.has(asset.id) ? <Chip tone="acc"><Check size={12} /> Added</Chip>
                        : <Button size="sm" variant="primary" icon={<FilePlus2 />} disabled={!projectName || busy} title={projectName ? `A new PNG in assets/${asset.kind}/ (never replaces a file), opened to paint` : "Open a project to add art to it"} onClick={() => void addArt(asset, art)}>Add</Button>}
                      <Button size="sm" variant="ghost" title="Open it as a new picture (Save asks where it goes)" onClick={() => onOpenArt(asset, art)}>Open</Button>
                    </span>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </Dialog>
  );
}
