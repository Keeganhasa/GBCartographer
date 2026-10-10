/**
 * The inspector's Picture tab: the open picture's facts, Resize and Fit, where its tiles go (the tile budget view),
 * and the view settings (tile budget, screen look, tint, UI font).
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

export function PicturePane({ doc, tileCount, budget, onBudget, look, onLook, tint, onTint, paletteNames, customTint, onCustomTint, font, onFont, onResize, onFit, usage, budgetView, onBudgetView, onMerge }: Props) {
  return (
    <div className="gbp-side-pane gbp-picture">
      {doc ? (
        <>
          <dl>
            <dt>Picture</dt><dd>{doc.name}</dd>
            <dt>Size</dt><dd>{doc.width} × {doc.height} px · {Math.ceil(doc.width / CELL)} × {Math.ceil(doc.height / CELL)} tiles</dd>
            {doc.asset && <><dt>File</dt><dd>assets/{doc.asset.kind}/{doc.asset.file}</dd></>}
            <dt>Unique tiles</dt><dd>{tileCount} of {budget.limit}</dd>
          </dl>
          <button className="quiet-button" title="A new size in whole tiles" onClick={onResize}>Resize…</button>
          {!doc.keyGreen && <button className="quiet-button" title="Fit the picture's colors to GB Studio's limits: four colors a tile, at most eight palettes; see what changes first" onClick={onFit}>Fit to 8 palettes…</button>}
          <div className="gbp-budget">
            <span className="eyebrow">Where the tiles go</span>
            {usage ? <p className="gbp-note">{tileCount} different tiles; {usage.usedOnce} used only once{usage.nearCount ? `, ${usage.nearCount} of them within 3 pixels of another tile` : ""}.</p> : <p className="gbp-note">Counting…</p>}
            <span className="gbp-budget-actions">
              <button className={`quiet-button ${budgetView ? "active-tool" : ""}`} onClick={() => onBudgetView(!budgetView)}>{budgetView ? "Hide" : "Show"} on the picture</button>
              <button className="quiet-button" disabled={!usage?.nearCount} title="Each tile within 3 pixels of another becomes a copy of it (undoable)" onClick={onMerge}>Merge {usage?.nearCount || ""} near matches</button>
            </span>
          </div>
        </>
      ) : <p className="gbp-note">No picture open.</p>}
      <label className="gbp-field">Tile budget
        <select aria-label="Tile budget" value={budget.id} onChange={(event) => onBudget(event.target.value)}>
          {BUDGETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label className="gbp-field" title="How the picture shows while you paint, like a real Game Boy screen. Never saved.">Screen
        <select aria-label="Screen" value={look} onChange={(event) => onLook(event.target.value as Look)}>
          <option value="plain">Plain (as the file and palettes say)</option>
          <option value="dmg">Game Boy (green LCD, shades only)</option>
          <option value="pocket">Game Boy Pocket (grey, shades only)</option>
          <option value="gbc">Game Boy Color (its screen's colors)</option>
        </select>
      </label>
      <label className="gbp-field" title="Preview colors for tiles without a palette. Saving always writes the GB greens.">Tint
        <select value={tint} onChange={(event) => onTint(event.target.value)}>
          {BUILT_IN_TINTS.map(({ name }) => <option key={name}>{name}</option>)}
          {paletteNames.length > 0 && <optgroup label="Palettes">{paletteNames.map((name) => <option key={name}>{name}</option>)}</optgroup>}
          <option>Custom</option>
        </select>
      </label>
      {tint === "Custom" && <div className="gbp-palette-colors">{customTint.map((color, index) => <input key={index} type="color" aria-label={`Tint shade ${index + 1}`} value={color} onChange={(event) => onCustomTint(customTint.map((old, at) => at === index ? event.target.value.toUpperCase() : old))} />)}</div>}
      <label className="gbp-field">Font
        <select value={font} onChange={(event) => onFont(event.target.value as FontChoice)}>
          {FONTS.map((item) => <option key={item.id} value={item.id} title={item.title}>{item.label}</option>)}
        </select>
      </label>
    </div>
  );
}
