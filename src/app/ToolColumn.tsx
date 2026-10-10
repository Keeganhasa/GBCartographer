/** The paint tools: one button per tool, the view and painting toggles, and the brush size for the tool in hand. */
import { Dna, FlipHorizontal, Grid2x2, Minus, Plus } from "lucide-react";
import { PATTERNS, type Mirror, type Pattern } from "../paint";
import { MIRRORS, MIRROR_LABEL, type ToolId } from "./model";
import { TOOLS } from "./tools";
import { IconButton } from "../ui/kit";
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
    <aside className="k-panel app-tools gbp-tools" role="toolbar" aria-label="Paint tools">
      {TOOLS.map(([id, label, Icon, keys]) => <IconButton key={id} label={label} keys={keys} pressed={tool === id} onClick={() => onTool(id)}><Icon size={17} /></IconButton>)}
      <hr />
      <IconButton label="Seamless view: the tile under the pointer (or the selection) repeated 3 × 3" aria-label="Seamless view" pressed={seamless} onClick={() => onSeamless(!seamless)}><Grid2x2 size={17} /></IconButton>
      <IconButton label="Linked tiles: painting a tile paints every identical copy" keys="K" aria-label="Linked tiles" pressed={linked} onClick={() => onLinked(!linked)}><Dna size={17} /></IconButton>
      <IconButton label={`${MIRROR_LABEL[mirror]}: paint both halves at once`} keys="Shift+M" aria-label={MIRROR_LABEL[mirror]} pressed={mirror !== "off"} onClick={() => onMirror(MIRRORS[(MIRRORS.indexOf(mirror) + 1) % MIRRORS.length])}><FlipHorizontal size={17} /></IconButton>
      {(tool === "fill" || tool === "rectFill") && <IconButton label={`Fill pattern: ${patternLabel}`} keys="D" aria-label={`Fill pattern: ${patternLabel}`} pressed={pattern !== "solid"} onClick={onPattern}><PhCheckerboard size={17} /></IconButton>}
      <hr />
      {tool === "palette" || tool === "priority" ? (
        <span className="app-size" role="group" aria-label="Palette brush size">
          <IconButton label="Smaller palette brush" keys="[" variant="ghost" disabled={cellBrush <= 1} onClick={() => onCellBrush(cellBrush - 1)}><Minus /></IconButton>
          {cellBrush}×{cellBrush}
          <IconButton label="Bigger palette brush" keys="]" variant="ghost" disabled={cellBrush >= 3} onClick={() => onCellBrush(cellBrush + 1)}><Plus /></IconButton>
        </span>
      ) : (
        <span className="app-size" role="group" aria-label="Brush size">
          <IconButton label="Smaller brush" keys="[" variant="ghost" disabled={brush <= 1} onClick={() => onBrush(brush - 1)}><Minus /></IconButton>
          {brush} px
          <IconButton label="Bigger brush" keys="]" variant="ghost" disabled={brush >= 16} onClick={() => onBrush(brush + 1)}><Plus /></IconButton>
        </span>
      )}
    </aside>
  );
}
