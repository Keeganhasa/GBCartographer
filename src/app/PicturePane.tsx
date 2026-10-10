/**
 * The inspector's Picture tab: the open picture's facts on top, its tiles as bars (unique against the budget, used
 * once, near matches) with what to do about them, then the view settings as buttons (tile budget, screen look,
 * tint, UI font).
 */
import { CELL, type Look } from "../paint";
import { FONTS, type FontChoice } from "../ui/theme";
import { BUDGETS, BUILT_IN_TINTS, type Doc } from "./model";
import { Button, Meter, Segmented, Select } from "../ui/kit";

interface Props {
  doc: Doc | null;
  tileCount: number;
  budget: (typeof BUDGETS)[number]; onBudget: (id: string) => void;
  look: Look; onLook: (look: Look) => void;
  tint: string; onTint: (tint: string) => void; paletteNames: string[];
  customTint: string[]; onCustomTint: (colors: string[]) => void;
  font: FontChoice; onFont: (font: FontChoice) => void;
  onResize: () => void; onFit: () => void;
  /** The tile budget view's counts, once worked out. */
  usage: { usedOnce: number; nearCount: number } | null;
  budgetView: boolean; onBudgetView: (on: boolean) => void; onMerge: () => void;
}

const LOOKS: [Look, string, string][] = [["plain", "Plain", "As the file and palettes say"], ["dmg", "GB", "Game Boy: green LCD, shades only"], ["pocket", "Pocket", "Game Boy Pocket: grey, shades only"], ["gbc", "GBC", "Game Boy Color: its screen's colors"]];

export function PicturePane({ doc, tileCount, budget, onBudget, look, onLook, tint, onTint, paletteNames, customTint, onCustomTint, font, onFont, onResize, onFit, usage, budgetView, onBudgetView, onMerge }: Props) {
  const folder = doc?.asset ? (doc.asset.kind === "stamps" ? "Cartographer/stamps" : `assets/${doc.asset.kind}`) : "";
  return (
    <>
      {doc ? (
        <>
          <div className="app-facts">
            <b title={doc.name}>{doc.name}</b>
            <span>{doc.width} × {doc.height} px · {Math.ceil(doc.width / CELL)} × {Math.ceil(doc.height / CELL)} tiles</span>
            {doc.asset && <span className="k-mono" title={`${folder}/${doc.asset.file}`}>{folder}/{doc.asset.file}</span>}
          </div>
          <section className="app-section">
            <span className="k-eyebrow">Tiles</span>
            <Meter label="Unique" value={tileCount} of={budget.limit} tone={tileCount > budget.limit ? "bad" : tileCount > budget.limit * 0.9 ? "warn" : undefined} title={`Different 8 × 8 tiles, as GB Studio counts them, against the ${budget.label} budget`} />
            <Meter label="Once" value={usage?.usedOnce ?? 0} of={tileCount} tone="warn" title="Tiles that appear only once: the first to look at when over budget (red on the picture)" />
            <Meter label="Near" value={usage?.nearCount ?? 0} of={tileCount} tone="warn" title="Used-once tiles within 3 pixels of another tile (amber on the picture): Merge makes them copies" />
            <div className="app-actions">
              <Button size="sm" pressed={budgetView} title="Color the tiles used once (red) and the near matches (amber) on the picture" onClick={() => onBudgetView(!budgetView)}>{budgetView ? "Hide tiles" : "Show tiles"}</Button>
              <Button size="sm" disabled={!usage?.nearCount} title="Each tile within 3 pixels of another becomes a copy of it (undoable)" onClick={onMerge}>Merge {usage?.nearCount || ""} near</Button>
              <Button size="sm" title="A new size in whole tiles" onClick={onResize}>Resize…</Button>
              {!doc.keyGreen && <Button size="sm" title="Fit the picture's colors to GB Studio's limits: four colors a tile, at most eight palettes; see what changes first" onClick={onFit}>Fit colors…</Button>}
            </div>
          </section>
        </>
      ) : <p className="k-muted k-small">No picture open.</p>}
      <hr className="k-divider" />
      <section className="app-section">
        <span className="k-label">Tile budget</span>
        <Segmented fill size="sm" label="Tile budget" value={budget.id as string} onChange={onBudget} options={BUDGETS.map((item) => ({ value: item.id, label: `${item.id === "colorOnly" ? "Color" : "Mono"} · ${item.limit}`, title: item.label }))} />
      </section>
      <section className="app-section" title="How the picture shows while you paint, like a real Game Boy screen. Never saved.">
        <span className="k-label">Screen</span>
        <Segmented fill size="sm" label="Screen" value={look} onChange={onLook} options={LOOKS.map(([value, label, title]) => ({ value, label, title }))} />
      </section>
      <section className="app-section" title="Preview colors for tiles without a palette. Saving always writes the GB greens.">
        <span className="k-label">Tint</span>
        <Select label="Tint" value={tint} onChange={onTint} options={[...BUILT_IN_TINTS.map(({ name }) => ({ value: name, label: name })), ...paletteNames.map((name) => ({ value: name, label: name })), { value: "Custom", label: "Custom" }]} />
        {tint === "Custom" && <div className="app-colors">{customTint.map((color, index) => <input key={index} type="color" aria-label={`Tint shade ${index + 1}`} value={color} onChange={(event) => onCustomTint(customTint.map((old, at) => at === index ? event.target.value.toUpperCase() : old))} />)}</div>}
      </section>
      <section className="app-section">
        <span className="k-label">App font</span>
        <Select label="App font" value={font} onChange={(next) => onFont(next as FontChoice)} options={FONTS.map((item) => ({ value: item.id, label: item.label }))} />
      </section>
    </>
  );
}
