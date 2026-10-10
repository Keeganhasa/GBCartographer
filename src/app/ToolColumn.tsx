/** The paint tools: one button per tool, the view and painting toggles, and the brush size for the tool in hand. */
import { Dna, FlipHorizontal, Grid2x2, Minus, Plus } from "lucide-react";
import { PATTERNS, type Mirror, type Pattern } from "../paint";
import { MIRRORS, MIRROR_LABEL, type ToolId } from "./model";
import { TOOLS } from "./tools";
import { PhCheckerboard } from "../ui/setIcons";

interface Props {
  tool: ToolId; onTool: (tool: ToolId) => void;
  seamless: boolean; onSeamless: (on: boolean) => void;
  linked: boolean; onLinked: (on: boolean) => void;
  mirror: Mirror; onMirror: (mirror: Mirror) => void;
  pattern: Pattern; onPattern: () => void;
  cellBrush: number; onCellBrush: (size: number) => void;
  brush: number; onBrush: (size: number) => void;
}

export function ToolColumn({ tool, onTool, seamless, onSeamless, linked, onLinked, mirror, onMirror, pattern, onPattern, cellBrush, onCellBrush, brush, onBrush }: Props) {
  const patternLabel = PATTERNS.find((item) => item.id === pattern)?.label;
  return (
    <aside className="gbp-tools pixel-toolbar vertical" role="toolbar" aria-label="Paint tools">
      {TOOLS.map(([id, label, Icon, keys]) => <button key={id} className={`tool-button ${tool === id ? "active" : ""}`} aria-label={label} aria-pressed={tool === id} title={`${label} · ${keys}`} onClick={() => onTool(id)}><Icon size={17} /></button>)}
      <button className={`tool-button ${seamless ? "active" : ""}`} aria-label="Seamless view" aria-pressed={seamless} title="Seamless view: the tile under the pointer (or the selection) repeated 3 × 3 above the picture, to check it tiles cleanly" onClick={() => onSeamless(!seamless)}><Grid2x2 size={17} /></button>
      <button className={`tool-button ${linked ? "active" : ""}`} aria-label="Linked tiles" aria-pressed={linked} title="Linked tiles: painting a tile paints every identical copy of it too (one-color tiles are not linked) · K" onClick={() => onLinked(!linked)}><Dna size={17} /></button>
      <button className={`tool-button ${mirror !== "off" ? "active" : ""}`} aria-label={MIRROR_LABEL[mirror]} title={`${MIRROR_LABEL[mirror]}: paint both halves at once · Shift+M`} onClick={() => onMirror(MIRRORS[(MIRRORS.indexOf(mirror) + 1) % MIRRORS.length])}><FlipHorizontal size={17} /></button>
      {(tool === "fill" || tool === "rectFill") && (
        <button className={`tool-button gbp-pattern ${pattern !== "solid" ? "active" : ""}`} aria-label={`Fill pattern: ${patternLabel}`} title={`Fill pattern: ${patternLabel} · D for the next`} onClick={onPattern}>
          <PhCheckerboard size={17} />
        </button>
      )}
      {tool === "palette" || tool === "priority" ? (
        <span className="gbp-brush" role="group" aria-label="Palette brush size" title="Palette brush: 1, 2 × 2 or 3 × 3 tiles · [ smaller, ] bigger">
          <button className="tool-button" aria-label="Smaller palette brush" disabled={cellBrush <= 1} onClick={() => onCellBrush(cellBrush - 1)}><Minus size={12} /></button>
          <b>{cellBrush}×{cellBrush}</b>
          <button className="tool-button" aria-label="Bigger palette brush" disabled={cellBrush >= 3} onClick={() => onCellBrush(cellBrush + 1)}><Plus size={12} /></button>
        </span>
      ) : (
        <span className="gbp-brush" role="group" aria-label="Brush size" title="Brush size · [ smaller, ] bigger">
          <button className="tool-button" aria-label="Smaller brush" disabled={brush <= 1} onClick={() => onBrush(brush - 1)}><Minus size={12} /></button>
          <b>{brush}</b>
          <button className="tool-button" aria-label="Bigger brush" disabled={brush >= 16} onClick={() => onBrush(brush + 1)}><Plus size={12} /></button>
        </span>
      )}
    </aside>
  );
}
