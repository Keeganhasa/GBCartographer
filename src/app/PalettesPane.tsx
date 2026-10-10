/**
 * The inspector's Palettes tab: the scene's eight palette slots, the open picture's palettes (the palette brush
 * paints the picked one onto tiles), and the picked palette's colors in this picture.
 */
import type { MouseEvent as ReactMouseEvent } from "react";
import { GB_SHADES, closeShades, namedSlot, type Palette } from "../paint";
import { HelpTip } from "./HelpTip";
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

  return (
    <div className="gbp-side-pane">
      {sceneSlots.length > 0 && (
        <div className="gbp-slots" role="group" aria-label={doc?.asset?.kind === "sprites" ? "Sprite palette slots" : "The scene's palette slots"}>
          {slotPalettes.map((paletteIndex, slot) => {
            const palette = paletteIndex >= 0 ? palettes[paletteIndex] : null;
            return (
              <button key={slot} className={`gbp-slot-button ${palette && activePalette === paletteIndex + 1 ? "selected" : ""}`} disabled={!palette} title={palette ? `Slot ${slot + 1} · ${palette.name}` : `Slot ${slot + 1}: no palette`} onClick={() => palette && onPick(paletteIndex + 1)} onContextMenu={(event) => openSlotMenu(event, paletteIndex + 1)}>
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
          <input type="checkbox" checked={namedSlots} onChange={(event) => onNamedSlots(event.target.checked)} />
          Named slots: variants save as their base's
        </label>
      )}
      <div className="gbp-side-row">
        <input type="search" className="gbp-filter" placeholder="Filter palettes" aria-label="Filter palettes by name" value={filter} onChange={(event) => onFilter(event.target.value)} />
        <HelpTip label="About the palette brush">{helpFor(doc, sceneSlots.length > 0)}</HelpTip>
      </div>
      <div className="gbp-palettes" role="listbox" aria-label="Palettes">
        {shown.map(({ palette, index, slot, named }) => (
          <button key={`${index}-${palette.name}`} role="option" aria-selected={activePalette === index} className={activePalette === index ? "selected" : ""} title={index && sceneSlots.length ? "Right-click: put in a slot" : undefined} onClick={() => onPick(index)} onContextMenu={(event) => openSlotMenu(event, index)}>
            <span className="gbp-chips">{palette.colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>
            <span>{palette.name}</span>
            {slot >= 0 && <small className="gbp-slot" title={doc?.asset?.kind === "sprites" ? `Sprite palette slot ${slot + 1}` : `Palette slot ${slot + 1} of this background's scene`}>{slot + 1}</small>}
            {named >= 0 && <small className="gbp-slot named" title={`Saves as slot ${named + 1} (named slots)`}>{named + 1}</small>}
          </button>
        ))}
      </div>
      {doc && picked && (
        <div className="gbp-palette-edit">
          <h2>{picked.name} in this picture{close.length > 0 && <span className="gbp-low-contrast" title={close.map(({ a, b, delta }) => `Colors ${a + 1} and ${b + 1} are hard to tell apart (difference ${delta}; aim for 12 or more)`).join("\n")}>low contrast</span>}</h2>
          <div className="gbp-palette-colors">
            {picked.colors.map((color, index) => <input key={index} type="color" aria-label={`${picked.name} color ${index + 1}`} title={`Color ${index + 1}: ${color}`} value={color} onChange={(event) => recolor(picked.colors.map((old, at) => at === index ? event.target.value : old))} />)}
          </div>
          <div className="gbp-palette-actions">
            {picked.id && onSaveToProject && <button className="quiet-button primary" disabled={unchanged} title={`Rewrite ${picked.name} in the GB Studio project with these colors (Save does this too)`} onClick={onSaveToProject}>Save to project</button>}
            {sceneSlots.length > 0 && <button className="quiet-button" title={`Put ${picked.name} in one of ${slotWhere}`} onClick={(event) => { const r = event.currentTarget.getBoundingClientRect(); onSlotMenu(r.left, r.bottom + 4, activePalette); }}>Slot…</button>}
            <button className="quiet-button" disabled={unchanged} title="Back to the colors the project has" onClick={() => libraryColors && recolor(libraryColors)}>Revert</button>
            <button className="quiet-button" title="Copy these four colors, to paste onto a palette here or in another tab" onClick={() => onCopy([...picked.colors])}>Copy values</button>
            <button className="quiet-button" disabled={!copiedColors} title="Replace these four colors with the copied ones" onClick={() => copiedColors && recolor(copiedColors)}>Paste values</button>
          </div>
        </div>
      )}
    </div>
  );
}
