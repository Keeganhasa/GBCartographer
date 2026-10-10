/**
 * The text tool's strip above the picture: the font (one of the project's font sheets), the words, the ink shade,
 * invert and box, and Stamp it / Cancel while the text floats.
 */
import { Check, X } from "lucide-react";
import { Button, Segmented, Select, Switch } from "../ui/kit";
import type { Asset } from "./model";

export interface TextSettings { font: string; text: string; ink: number; invert: boolean; box: boolean }

interface Props {
  fonts: Asset[];
  settings: TextSettings; onChange: (settings: TextSettings) => void;
  /** The four shade colors shown on the ink buttons. */
  shades: readonly string[];
  /** Whether text is floating on the picture (Stamp it and Cancel apply). */
  placed: boolean;
  onStamp: () => void; onCancel: () => void;
}

export function TextStrip({ fonts, settings, onChange, shades, placed, onStamp, onCancel }: Props) {
  const set = (change: Partial<TextSettings>) => onChange({ ...settings, ...change });
  if (!fonts.length) return <div className="k-card app-strip" role="group" aria-label="Text"><span className="app-strip-label">The text tool types with the project's font sheets: this project has none yet (New → Font).</span></div>;
  return (
    <div className="k-card app-strip" role="group" aria-label="Text">
      <label className="k-field" style={{ width: 260 }}>
        <span className="k-label">Text</span>
        <textarea className="k-input" rows={2} style={{ height: "auto", padding: "6px 10px", resize: "vertical" }} aria-label="Text to type" value={settings.text} spellCheck={false} onChange={(event) => set({ text: event.target.value })} />
      </label>
      <div className="k-stack k-stack--tight">
        <Select label="Font" value={settings.font} onChange={(font) => set({ font })} options={fonts.map((font) => ({ value: font.file, label: font.name }))} />
        <Segmented size="sm" label="Ink" value={String(settings.ink)} onChange={(ink) => set({ ink: Number(ink) })} options={shades.slice(0, 4).map((color, shade) => ({ value: String(shade), title: `Shade ${shade + 1}`, label: <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: color, boxShadow: "0 0 0 1px rgba(255,255,255,.25)" }} /> }))} />
      </div>
      <div className="k-stack k-stack--tight">
        <Switch checked={settings.invert} onChange={(invert) => set({ invert })}>Invert</Switch>
        <Switch checked={settings.box} onChange={(box) => set({ box })}>Box behind</Switch>
      </div>
      {placed
        ? <span className="k-row"><Button size="sm" variant="primary" icon={<Check />} onClick={onStamp}>Stamp it</Button><Button size="sm" icon={<X />} onClick={onCancel}>Cancel</Button></span>
        : <span className="app-strip-label">Click the picture to place it</span>}
    </div>
  );
}
