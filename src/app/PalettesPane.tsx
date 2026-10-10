/**
 * The inspector's Palettes tab: the scene's eight palette slots, the open picture's palettes (the palette brush
 * paints the picked one onto tiles), and the picked palette's colors in this picture.
 */
import type { MouseEvent as ReactMouseEvent } from "react";
import { GB_SHADES, closeShades, namedSlot, type Palette } from "../paint";
import { HelpTip } from "./HelpTip";
import { Button, Chip, Switch } from "../ui/kit";
import type { Doc } from "./model";

interface Props {
  doc: Doc | null;
  palettes: Palette[];
  /** The scene's (or the defaults') eight palette ids, when the picture has slots. */
  sceneSlots: string[];
  /** Each slot's palette, as an index into `palettes` (-1: not in this picture). */
  slotPalettes: number[];
  /** Where Slot… puts a palette, in words. */
  slotWhere: string;
  activePalette: number; onPick: (palette: number) => void;
  namedSlots: boolean; onNamedSlots: (on: boolean) => void;
  filter: string; onFilter: (filter: string) => void;
  onSlotMenu: (x: number, y: number, palette: number) => void;
  /** The picked palette's colors in the project (or library), to revert to. */
  libraryColors: string[] | undefined;
  /** Rewrites the picked palette in the project; absent outside one. */
  onSaveToProject?: () => void;
  onRecolor: (colors: string[]) => void;
  copiedColors: string[] | null; onCopy: (colors: string[]) => void;
  /** Says something in a toast (a color edit that makes two colors hard to tell apart). */
  say: (message: string) => void;
}

const matches = (name: string, filter: string) => !filter.trim() || name.toLowerCase().includes(filter.trim().toLowerCase());

function helpFor(doc: Doc | null, slots: boolean) {
  const kind = doc?.asset?.kind;
  if (kind === "tilesets" && slots) return "Each 8 × 8 tile wears one of the project's eight default background palettes. Save writes the tileset in the GB greens and each tile's palette into GB Studio as its slot. None leaves a tile's slot as it is.";
  if (kind === "sprites" && slots) return "Each 8 × 16 sprite tile wears one of the scene's eight sprite palettes; a palette's colors 1–3 dress the shades and color 0 is see-through. Save writes the sheet in the GB greens and each tile's palette as its slot.";
  if (kind === "backgrounds" && slots) return "Each 8 × 8 tile wears one of the scene's eight palettes. Save writes the picture in the GB greens and each tile's palette into GB Studio as its slot. None leaves a tile's slot as it is.";
  return "Each 8 × 8 tile wears one palette, or none. Palettes are only for looking here: saving always writes the GB greens.";
}

export function PalettesPane({ doc, palettes, sceneSlots, slotPalettes, slotWhere, activePalette, onPick, namedSlots, onNamedSlots, filter, onFilter, onSlotMenu, libraryColors, onSaveToProject, onRecolor, copiedColors, onCopy, say }: Props) {
  const picked = activePalette ? palettes[activePalette - 1] : undefined;
  // A project background or sprite sheet carries its eight palette slots: shown as a strip, and first in the list.
  const slotOf = (palette: Palette) => palette.id ? sceneSlots.indexOf(palette.id) : -1;
  const slotNames = slotPalettes.map((index) => index >= 0 ? palettes[index].name : undefined);
  const shown = [{ name: "None (GB greens)", colors: [...GB_SHADES] } as Palette, ...palettes]
    .map((palette, index) => {
      const slot = index ? slotOf(palette) : -1;
      return { palette, index, slot, named: index && slot < 0 && namedSlots && sceneSlots.length ? namedSlot(palette.name, slotNames) : -1 };
    })
    .filter(({ palette, index }) => index === activePalette || matches(palette.name, filter))
    .sort((a, b) => (a.index === 0 ? -1 : b.index === 0 ? 1 : a.slot >= 0 && b.slot >= 0 ? a.slot - b.slot : a.slot >= 0 ? -1 : b.slot >= 0 ? 1 : a.index - b.index));
  const openSlotMenu = (event: ReactMouseEvent, palette: number) => { if (!sceneSlots.length || !palette) return; event.preventDefault(); onSlotMenu(event.clientX, event.clientY, palette); };
  const unchanged = !libraryColors || (picked && libraryColors.join() === picked.colors.join());
  const sprite = Boolean(doc?.keyGreen);
  const close = picked ? closeShades(picked.colors, sprite) : [];
  /** Recolors, and says so in a toast when the edit makes two colors hard to tell apart. */
  const recolor = (colors: string[]) => {
    const before = new Set(close.map(({ a, b }) => `${a}-${b}`));
    const fresh = closeShades(colors, sprite).filter(({ a, b }) => !before.has(`${a}-${b}`));
    onRecolor(colors);
    if (fresh.length) say(`Colors ${fresh[0].a + 1} and ${fresh[0].b + 1} of ${picked?.name ?? "this palette"} are hard to tell apart now (difference ${fresh[0].delta}; aim for 12 or more).`);
  };

  const Chips = ({ colors }: { colors: readonly string[] }) => <span className="app-chips">{colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>;
  return (
    <>
      {sceneSlots.length > 0 && (
        <section className="app-section" aria-label={doc?.asset?.kind === "sprites" ? "Sprite palette slots" : "The scene's palette slots"}>
          <div className="app-section-head"><span className="k-eyebrow">{doc?.asset?.kind === "sprites" ? "Sprite slots" : "Scene slots"}</span><Chip title={`Slots come from ${slotWhere}`}>{doc?.asset?.slotScene ?? "defaults"}</Chip></div>
          <div className="app-list gbp-slots">
            {slotPalettes.map((paletteIndex, slot) => {
              const palette = paletteIndex >= 0 ? palettes[paletteIndex] : null;
              return (
                <button key={slot} className="app-row gbp-slot-button" aria-pressed={Boolean(palette) && activePalette === paletteIndex + 1} disabled={!palette} title={palette ? `Slot ${slot + 1} · ${palette.name} · right-click: put another palette here` : `Slot ${slot + 1}: no palette`} onClick={() => palette && onPick(paletteIndex + 1)} onContextMenu={(event) => openSlotMenu(event, paletteIndex + 1)}>
                  <span className="app-slot">{slot + 1}</span><Chips colors={palette?.colors ?? ["#222", "#222", "#222", "#222"]} /><span className="app-name">{palette?.name ?? "—"}</span>
                </button>
              );
            })}
          </div>
          <span title="A time-of-day version (a name ending in D, N or S, like DWC-2-Computer N) saves as its base palette's slot when the base is in the scene's slots">
            <Switch checked={namedSlots} onChange={onNamedSlots}>Named slots: variants save as their base's</Switch>
          </span>
        </section>
      )}
      <section className="app-section">
        <div className="app-section-head"><span className="k-eyebrow">All palettes</span><span className="k-row"><span className="k-muted k-xs">{palettes.length}</span><HelpTip label="About the palette brush">{helpFor(doc, sceneSlots.length > 0)}</HelpTip></span></div>
        <input type="search" className="k-input" placeholder="Filter palettes" aria-label="Filter palettes by name" value={filter} onChange={(event) => onFilter(event.target.value)} />
        <div className="app-list gbp-palettes" role="listbox" aria-label="Palettes">
          {shown.map(({ palette, index, slot, named }) => (
            <button key={`${index}-${palette.name}`} role="option" aria-selected={activePalette === index} className="app-row" title={index && sceneSlots.length ? "Right-click: put in a slot" : undefined} onClick={() => onPick(index)} onContextMenu={(event) => openSlotMenu(event, index)}>
              <Chips colors={palette.colors} /><span className="app-name">{palette.name}</span>
              {slot >= 0 && <Chip title={doc?.asset?.kind === "sprites" ? `Sprite palette slot ${slot + 1}` : `Palette slot ${slot + 1} of this background's scene`}>{slot + 1}</Chip>}
              {named >= 0 && <Chip title={`Saves as slot ${named + 1} (named slots)`}>→ {named + 1}</Chip>}
            </button>
          ))}
        </div>
      </section>
      {doc && picked && (
        <section className="app-section gbp-palette-edit">
          <hr className="k-divider" />
          <div className="app-section-head"><span className="k-eyebrow">{picked.name} here</span>{close.length > 0 && <Chip tone="warn" title={close.map(({ a, b, delta }) => `Colors ${a + 1} and ${b + 1} are hard to tell apart (difference ${delta}; aim for 12 or more)`).join("\n")}>low contrast</Chip>}</div>
          <div className="app-colors">
            {picked.colors.map((color, index) => <input key={index} type="color" aria-label={`${picked.name} color ${index + 1}`} title={`Color ${index + 1}: ${color}`} value={color} onChange={(event) => recolor(picked.colors.map((old, at) => at === index ? event.target.value : old))} />)}
          </div>
          <div className="app-actions">
            {picked.id && onSaveToProject && <Button size="sm" variant="primary" disabled={unchanged} title={`Rewrite ${picked.name} in the GB Studio project with these colors (Save does this too)`} onClick={onSaveToProject}>Save to project</Button>}
            {sceneSlots.length > 0 && <Button size="sm" title={`Put ${picked.name} in one of ${slotWhere}`} onClick={(event) => { const r = event.currentTarget.getBoundingClientRect(); onSlotMenu(r.left, r.bottom + 4, activePalette); }}>Slot…</Button>}
            <Button size="sm" disabled={unchanged} title="Back to the colors the project has" onClick={() => libraryColors && recolor(libraryColors)}>Revert</Button>
            <Button size="sm" title="Copy these four colors, to paste onto a palette here or in another tab" onClick={() => onCopy([...picked.colors])}>Copy colors</Button>
            <Button size="sm" disabled={!copiedColors} title="Replace these four colors with the copied ones" onClick={() => copiedColors && recolor(copiedColors)}>Paste colors</Button>
          </div>
        </section>
      )}
    </>
  );
}
