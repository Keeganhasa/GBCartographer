/** The paint tools (with their icons and help) and the asset kinds' icons. */
import { CaseSensitive, Circle, DropletOff, Eraser, Ghost, Layers2, Move, PaintBucket, Palette as PaletteIcon, Pencil, Pipette, SprayCan, Square, Type } from "lucide-react";
import { FilledSquare, LineEnds } from "../ui/icons";
import { PhPuzzlePiece, PhSelection, PhSticker, PxAvatar, PxHand, PxImage, PxMessageReply, PxSmile } from "../ui/setIcons";

/** id, label, icon, key, one-clause hint (status bar), the longer explanation (the ? help). */
export const TOOLS = [
  ["pencil", "Pencil", Pencil, "B", "drag to paint · Shift-click line · right-click picks a shade", "Drag to paint with the active shade. Shift-click draws a straight line from the last point. Right-click picks the shade under the pointer."],
  ["eraser", "Eraser", Eraser, "E", "drag to erase", "Drag to erase to the lightest shade, or to see-through in a picture that has see-through pixels."],
  ["spray", "Spray can", SprayCan, "S", "drag to scatter pixels", "Drag to scatter pixels of the active shade inside the brush."],
  ["line", "Line", LineEnds, "L", "drag from one end to the other", "Drag from one end of the line to the other."],
  ["rect", "Rectangle", Square, "R", "drag a box", "Drag a box to outline it in the active shade."],
  ["rectFill", "Filled rectangle", FilledSquare, "Shift+R", "drag a box to fill · D pattern", "Drag a box to fill it with the active shade, or with the fill pattern (D cycles it)."],
  ["ellipse", "Ellipse", Circle, "O", "drag a box; the ellipse fills it", "Drag a box; the ellipse fills it."],
  ["fill", "Flood fill", PaintBucket, "G", "click an area to fill · Alt-click replaces that shade everywhere · D pattern", "Click an area to fill it with the active shade. Alt-click replaces that shade everywhere with the active one (inside the selection, if there is one). D cycles the fill pattern (solid, checker, dots, dense, rows, columns): only the pattern's pixels take the shade."],
  ["fillErase", "Flood erase", DropletOff, "Shift+G", "click an area to erase", "Click an area to erase it."],
  ["eyedropper", "Pick", Pipette, "I", "click to pick a shade, or a tile's palette", "Click a pixel to paint with its shade. Reached from the palette brush, it picks the tile's palette instead and goes back to the brush."],
  ["palette", "Palette brush", PaletteIcon, "P", "drag over tiles · Shift-click line · [ ] size · right-click picks", "Pick a palette on the right, then drag over tiles to give it to them. Shift-click draws a straight line of tiles. [ and ] set the brush to 1, 2 × 2 or 3 × 3 tiles. Right-click picks a tile's palette. On a project background or sprite sheet, Save writes each tile's palette into GB Studio as its slot; None leaves a tile's slot as it is."],
  ["select", "Select", PhSelection, "M", "drag a box · drag inside to move · Alt copies · F flip · T turn", "Drag a box to select. Drag inside it to move the selection (Alt copies). Arrow keys nudge, Delete clears, Esc drops it. F flips it left-right, Shift+F top-bottom, T turns it clockwise. A selection on tile edges (Snap helps) takes its tiles' palettes along, also when copied into another picture."],
  ["move", "Move", Move, "V", "drag the selection or the whole picture", "Drag the selection, or the whole picture when nothing is selected (Alt copies)."],
  ["hand", "Pan", PxHand, "H", "drag to pan · Space or middle button with any tool", "Drag to pan. Space or the middle mouse button pans with any tool."],
  ["stamp", "Stamp", PhSticker, "C", "right-click picks a tile · drag stamps it on the grid", "Right-click a tile to pick it up as the stamp (or select a block first, then pick the stamp tool), then click or drag to stamp copies on the 8 px grid. Tile palettes come along when the stamp is whole tiles."],
  ["priority", "Priority brush", Layers2, "U", "drag over tiles to draw them over sprites · Alt or right-drag clears", "On a background or tileset, drag over tiles to mark them as drawn over sprites (GB Studio's priority flag; marked tiles show hatched). Alt-drag or right-drag clears the mark. Save writes the flag into the tile colors."],
  ["text", "Text", CaseSensitive, "Y", "click to place text in a project font · drag to move · switch tools to stamp it", "Click the picture to place text set in one of the project's font sheets (pick the font, type, choose the ink above the picture). It floats: drag it, change the words, invert it, then switch tools or press Stamp it to put it down. Variable-width fonts keep their widths."],
] as const;
export const KIND_ICONS = { backgrounds: PxImage, sprites: Ghost, tilesets: PhPuzzlePiece, fonts: Type, emotes: PxSmile, avatars: PxAvatar, ui: PxMessageReply, stamps: PhSticker } as const;
