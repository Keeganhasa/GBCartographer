/**
 * The inspector's Picture tab: the open picture's facts on top, its tiles as bars (unique against the budget, used
 * once, near matches) with what to do about them, then the view settings as buttons (tile budget, screen look,
 * tint, UI font).
 */
import { CELL, type Look } from "../paint";
import { FONTS, type FontChoice } from "../ui/theme";
import { BUDGETS, BUILT_IN_TINTS, type Doc } from "./model";

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

/** One count as a bar: label, the bar, and "n / of". */
function Meter({ label, value, of, tone = "", title }: { label: string; value: number; of: number; tone?: "" | "warn" | "over"; title: string }) {
  return (
    <div className={`gbp-meter ${tone}`} title={title}>
      <span>{label}</span>
      <span className="gbp-meter-track" aria-hidden="true"><b style={{ width: `${Math.min(1, of ? value / of : 0) * 100}%` }} /></span>
      <span className="gbp-meter-count">{value}<small> / {of}</small></span>
    </div>
  );
}

/** A row of buttons that picks one of a few choices. */
function Choice<T extends string>({ label, value, options, onPick, title, wrap }: { label: string; value: T; options: [T, string, string][]; onPick: (value: T) => void; title?: string; /** Two to a row. */ wrap?: boolean }) {
  return (
    <div className="gbp-choice" title={title}>
      <span className="gbp-choice-label">{label}</span>
      <span className={`gbp-choice-row ${wrap ? "wrap" : ""}`} role="group" aria-label={label}>
        {options.map(([id, text, hint]) => <button key={id} className={`quiet-button ${value === id ? "active-tool" : ""}`} aria-pressed={value === id} title={hint} onClick={() => onPick(id)}>{text}</button>)}
      </span>
    </div>
  );
}

export function PicturePane({ doc, tileCount, budget, onBudget, look, onLook, tint, onTint, paletteNames, customTint, onCustomTint, font, onFont, onResize, onFit, usage, budgetView, onBudgetView, onMerge }: Props) {
  return (
    <div className="gbp-side-pane gbp-picture">
      {doc ? (
        <>
          <div className="gbp-facts">
            <b title={doc.name}>{doc.name}</b>
            <span>{doc.width} × {doc.height} px · {Math.ceil(doc.width / CELL)} × {Math.ceil(doc.height / CELL)} tiles</span>
            {doc.asset && <span className="gbp-facts-file" title={`assets/${doc.asset.kind}/${doc.asset.file}`}>assets/{doc.asset.kind}/{doc.asset.file}</span>}
          </div>
          <div className="gbp-meters">
            <Meter label="Unique" value={tileCount} of={budget.limit} tone={tileCount > budget.limit ? "over" : tileCount > budget.limit * 0.9 ? "warn" : ""} title={`Different 8 × 8 tiles, as GB Studio counts them, against the ${budget.label} budget`} />
            <Meter label="Once" value={usage?.usedOnce ?? 0} of={tileCount} tone="warn" title="Tiles that appear only once: the first to look at when over budget (red on the picture)" />
            <Meter label="Near" value={usage?.nearCount ?? 0} of={tileCount} tone="warn" title="Used-once tiles within 3 pixels of another tile (amber on the picture): Merge makes them copies" />
          </div>
          <div className="gbp-button-grid">
            <button className={`quiet-button ${budgetView ? "active-tool" : ""}`} aria-pressed={budgetView} title="Color the tiles used once (red) and the near matches (amber) on the picture" onClick={() => onBudgetView(!budgetView)}>{budgetView ? "Hide tiles" : "Show tiles"}</button>
            <button className="quiet-button" disabled={!usage?.nearCount} title="Each tile within 3 pixels of another becomes a copy of it (undoable)" onClick={onMerge}>Merge {usage?.nearCount || ""} near</button>
            <button className="quiet-button" title="A new size in whole tiles" onClick={onResize}>Resize…</button>
            {!doc.keyGreen && <button className="quiet-button" title="Fit the picture's colors to GB Studio's limits: four colors a tile, at most eight palettes; see what changes first" onClick={onFit}>Fit colors…</button>}
          </div>
        </>
      ) : <p className="gbp-note">No picture open.</p>}
      <div className="gbp-options">
        <Choice label="Tile budget" value={budget.id as string} options={BUDGETS.map((item) => [item.id, `${item.id === "colorOnly" ? "Color" : "Mono"} · ${item.limit}`, item.label])} onPick={onBudget} title="GB Studio's tile limit for the scene's color mode" />
        <Choice label="Screen" value={look} options={LOOKS} onPick={onLook} title="How the picture shows while you paint, like a real Game Boy screen. Never saved." />
        <label className="gbp-choice" title="Preview colors for tiles without a palette. Saving always writes the GB greens.">
          <span className="gbp-choice-label">Tint</span>
          <select value={tint} onChange={(event) => onTint(event.target.value)}>
            {BUILT_IN_TINTS.map(({ name }) => <option key={name}>{name}</option>)}
            {paletteNames.length > 0 && <optgroup label="Palettes">{paletteNames.map((name) => <option key={name}>{name}</option>)}</optgroup>}
            <option>Custom</option>
          </select>
        </label>
        {tint === "Custom" && <div className="gbp-palette-colors">{customTint.map((color, index) => <input key={index} type="color" aria-label={`Tint shade ${index + 1}`} value={color} onChange={(event) => onCustomTint(customTint.map((old, at) => at === index ? event.target.value.toUpperCase() : old))} />)}</div>}
        <Choice label="App font" value={font} options={FONTS.map((item) => [item.id, item.label, item.title])} onPick={onFont} wrap />
      </div>
    </div>
  );
}
