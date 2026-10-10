/**
 * Painting on the open picture: the pointer handlers for every tool (strokes, shapes, fills, the palette and
 * priority brushes, the stamp, selections and panning), and the pieces they share. Called once per render with the
 * app's current state; it owns only the state of a drag in progress.
 */
import { useRef, type PointerEvent, type RefObject } from "react";
import { CELL, CLEAR, cellsWide, clipRect, dot, drop, dropCells, ellipsePoints, fillRect, floodFill, lift, liftCells, linePoints, linkGroups, mirrorPoints, onTiles, rectFrom, replaceShade, snapRect, spray, syncLinked, type Floating, type Mirror, type Palette, type Pattern } from "../paint";
import type { Doc, Drag, Point, ToolId } from "./model";

interface Painting {
  doc: Doc | null;
  tool: ToolId;
  shade: number;
  brush: number;
  /** The palette brush's size in tiles. */
  cellBrush: number;
  mirror: Mirror;
  pattern: Pattern;
  linked: boolean;
  snap: boolean;
  seamless: boolean;
  activePalette: number;
  hoverCell: { x: number; y: number } | null;
  wrapRef: RefObject<HTMLDivElement | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  readoutRef: RefObject<HTMLSpanElement | null>;
  brushRef: RefObject<HTMLDivElement | null>;
  spaceDown: RefObject<boolean>;
  /** The tool the eyedropper goes back to. */
  paintTool: RefObject<ToolId>;
  setShade: (shade: number) => void;
  setActivePalette: (palette: number) => void;
  setHoverCell: (cell: { x: number; y: number }) => void;
  setToolState: (tool: ToolId) => void;
  say: (message: string) => void;
  pushUndo: (target: Doc) => void;
  touch: (target: Doc) => void;
  bump: () => void;
  floatSelection: (target: Doc, copy: boolean) => Floating | null;
  dropFloat: (target: Doc) => void;
  moveFloat: (target: Doc, x: number, y: number) => void;
  clonePalettes: (list: readonly Palette[]) => Palette[];
  blank: (target: Doc) => number;
}

export function usePainting(app: Painting) {
  const { doc, tool, shade, brush, cellBrush, mirror, pattern, linked, snap, activePalette } = app;
  const drag = useRef<Drag | null>(null);
  const lastPoint = useRef<Point | null>(null);
  /** The stamp tool's block: pixels, tile palettes when whole tiles, and the palettes they refer to. */
  const stamp = useRef<(Floating & { palettes: Palette[] }) | null>(null);
  /** During a stroke with linked tiles: the groups, the pixels before the stroke, and after the last step. */
  const linkStroke = useRef<{ link: ReturnType<typeof linkGroups>; base: Uint8Array; previous: Uint8Array } | null>(null);

  function pointAt(event: { clientX: number; clientY: number }): Point {
    const box = app.wrapRef.current!.getBoundingClientRect();
    return { x: Math.floor((event.clientX - box.left) / box.width * doc!.width), y: Math.floor((event.clientY - box.top) / box.height * doc!.height) };
  }

  const inside = (target: Doc, { x, y }: Point) => x >= 0 && y >= 0 && x < target.width && y < target.height;

  function mark(target: Doc, { x, y }: Point, value: number) {
    for (const [mx, my] of mirrorPoints(x, y, target.width, target.height, mirror)) dot(target.pixels, target.width, target.height, mx, my, brush, value);
  }

  /**
   * The palette brush covers `cellBrush` × `cellBrush` tiles around the pointer (8 × 8 each, or on a sprite sheet
   * the 8 × 16 pairs GB Studio's sprite tiles are made of).
   */
  function setCell(target: Doc, point: Point) {
    if (!inside(target, point)) return;
    const cw = cellsWide(target.width), ch = Math.ceil(target.height / CELL);
    const tall = target.keyGreen ? 2 : 1;
    const offset = Math.floor((cellBrush - 1) / 2);
    const cx0 = (point.x >> 3) - offset, cy0 = (target.keyGreen ? point.y >> 4 << 1 : point.y >> 3) - offset * tall;
    for (let by = 0; by < cellBrush * tall; by += 1) {
      for (let bx = 0; bx < cellBrush; bx += 1) {
        const cx = cx0 + bx, cy = cy0 + by;
        if (cx >= 0 && cy >= 0 && cx < cw && cy < ch) target.cells[cy * cw + cx] = activePalette;
      }
    }
  }

  /** Picks up a block of the picture (and, on tile edges, its tile palettes) as the stamp. */
  function takeStamp(target: Doc, rect: { x: number; y: number; w: number; h: number }) {
    const area = clipRect(rect, target.width, target.height);
    if (!area) return;
    const flat = target.float ? target.pixels.slice() : target.pixels;
    if (target.float) drop(flat, target.width, target.height, target.float);
    stamp.current = { ...lift(flat, target.width, area), ...(onTiles(area) ? { cells: liftCells(target.cells, target.width, area) } : {}), palettes: app.clonePalettes(target.palettes) };
    app.say(`Stamp: ${area.w} × ${area.h}${onTiles(area) ? " (with its tile palettes)" : ""}. Click or drag to stamp it on the grid.`);
  }

  /** Stamps a copy with its top-left on the 8 px grid under `point` (see-through pixels leave the picture alone). */
  function putStamp(target: Doc, point: Point) {
    const source = stamp.current;
    if (!source) return;
    const x = point.x & ~7, y = point.y & ~7;
    drop(target.pixels, target.width, target.height, { ...source, x, y });
    if (source.cells) {
      // Tile palettes land on the same palettes in this picture (matched by id, else name and colors; added if missing).
      const cells = source.cells.map((wear) => {
        const palette = wear ? source.palettes[wear - 1] : undefined;
        if (!palette) return 0;
        let index = target.palettes.findIndex((own) => (palette.id && own.id === palette.id) || (!palette.id && own.name === palette.name && own.colors.join() === palette.colors.join()));
        if (index < 0) index = target.palettes.push({ ...palette, colors: [...palette.colors] }) - 1;
        return index + 1;
      });
      dropCells(target.cells, target.width, target.height, { ...source, x, y, cells });
    }
  }

  /** Marks (or clears) the priority flag of the tiles under the palette brush's size. */
  function setPriority(target: Doc, point: Point, on: boolean) {
    if (!target.priority || !inside(target, point)) return;
    const cw = cellsWide(target.width), ch = Math.ceil(target.height / CELL), offset = Math.floor((cellBrush - 1) / 2);
    for (let by = 0; by < cellBrush; by += 1) for (let bx = 0; bx < cellBrush; bx += 1) {
      const cx = (point.x >> 3) - offset + bx, cy = (point.y >> 3) - offset + by;
      if (cx >= 0 && cy >= 0 && cx < cw && cy < ch) target.priority[cy * cw + cx] = on ? 1 : 0;
    }
  }

  function drawShape(target: Doc, a: Point, b: Point, value: number) {
    if (tool === "rectFill") return fillRect(target.pixels, target.width, target.height, rectFrom(a.x, a.y, b.x, b.y), value, pattern);
    const points = tool === "line" ? linePoints(a.x, a.y, b.x, b.y)
      : tool === "ellipse" ? ellipsePoints(a.x, a.y, b.x, b.y)
      : [...linePoints(a.x, a.y, b.x, a.y), ...linePoints(b.x, a.y, b.x, b.y), ...linePoints(b.x, b.y, a.x, b.y), ...linePoints(a.x, b.y, a.x, a.y)];
    for (const [x, y] of points) dot(target.pixels, target.width, target.height, x, y, brush, value);
  }

  function pickShade(target: Doc, point: Point) {
    if (!inside(target, point)) return;
    const flat = target.float ? target.pixels.slice() : target.pixels;
    if (target.float) drop(flat, target.width, target.height, target.float);
    app.setShade(flat[point.y * target.width + point.x]);
  }

  /** With linked tiles on, what the last step painted goes to every identical copy of each tile it touched. */
  function followLinks(target: Doc) {
    const stroke = linkStroke.current;
    if (!stroke) return;
    syncLinked(target.pixels, stroke.previous, stroke.base, target.width, target.height, stroke.link);
    stroke.previous.set(target.pixels);
  }

  function pointerDown(event: PointerEvent) {
    if (!doc || event.button === 1) return;
    const scroller = app.scrollerRef.current!;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "hand" || app.spaceDown.current) {
      drag.current = { kind: "pan", x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
      return;
    }
    const point = pointAt(event);
    if (event.button === 2 && tool === "stamp") {
      if (inside(doc, point)) takeStamp(doc, { x: point.x & ~7, y: point.y & ~7, w: CELL, h: CELL });
      return;
    }
    if (event.button === 2 && tool === "priority" && doc.priority) {
      app.pushUndo(doc);
      setPriority(doc, point, false);
      drag.current = { kind: "priority", last: point, on: false };
      return app.touch(doc);
    }
    if (event.button === 2) {
      if (tool === "palette" && inside(doc, point)) app.setActivePalette(doc.cells[(point.y >> 3) * cellsWide(doc.width) + (point.x >> 3)]);
      else pickShade(doc, point);
      return;
    }
    const value = tool === "eraser" || tool === "fillErase" || (shade === CLEAR && !doc.hasAlpha) ? app.blank(doc) : shade;
    linkStroke.current = linked && !["eyedropper", "select", "move", "palette", "hand"].includes(tool) ? { link: linkGroups(doc.pixels, doc.width, doc.height), base: doc.pixels.slice(), previous: doc.pixels.slice() } : null;
    if (tool === "eyedropper") {
      // Came here from the palette brush: pick the tile's palette instead of a shade.
      if (app.paintTool.current === "palette") { if (inside(doc, point)) app.setActivePalette(doc.cells[(point.y >> 3) * cellsWide(doc.width) + (point.x >> 3)]); }
      else pickShade(doc, point);
      app.setToolState(app.paintTool.current);
    } else if (tool === "select" || tool === "move") {
      const sel = doc.sel;
      if (tool === "move" || (sel && point.x >= sel.x && point.y >= sel.y && point.x < sel.x + sel.w && point.y < sel.y + sel.h)) {
        const floating = app.floatSelection(doc, event.altKey);
        if (floating) drag.current = { kind: "move", start: point, ox: floating.x, oy: floating.y };
      } else {
        app.dropFloat(doc);
        doc.sel = null;
        drag.current = { kind: "marquee", start: point };
      }
    } else if (tool === "stamp") {
      if (!stamp.current) { app.say("Right-click a tile to pick it up as the stamp, or select a block and pick the stamp tool again."); return; }
      app.dropFloat(doc);
      app.pushUndo(doc);
      putStamp(doc, point);
      const origin = { x: point.x & ~7, y: point.y & ~7 };
      drag.current = { kind: "stamp", origin, last: origin };
    } else if (tool === "priority") {
      if (!doc.priority) { app.say("The priority brush is for project backgrounds and tilesets (GB Studio's draw-over-sprites flag)."); return; }
      app.pushUndo(doc);
      const on = !event.altKey;
      setPriority(doc, point, on);
      drag.current = { kind: "priority", last: point, on };
    } else if (tool === "palette") {
      app.pushUndo(doc);
      for (const [x, y] of event.shiftKey && lastPoint.current ? linePoints(lastPoint.current.x, lastPoint.current.y, point.x, point.y) : [[point.x, point.y]]) setCell(doc, { x, y });
      drag.current = { kind: "cells", last: point };
      lastPoint.current = point;
    } else if (tool === "fill" || tool === "fillErase") {
      app.pushUndo(doc);
      // Alt-click replaces that shade everywhere (inside the selection, if any) instead of filling one area.
      const changed = event.altKey ? replaceShade(doc.pixels, doc.width, doc.height, doc.pixels[point.y * doc.width + point.x], value, doc.sel) > 0 : floodFill(doc.pixels, doc.width, doc.height, point.x, point.y, value, pattern);
      if (!changed) doc.undo.pop();
    } else if (tool === "pencil" || tool === "eraser") {
      app.pushUndo(doc);
      for (const [x, y] of event.shiftKey && lastPoint.current ? linePoints(lastPoint.current.x, lastPoint.current.y, point.x, point.y) : [[point.x, point.y]]) mark(doc, { x, y }, value);
      drag.current = { kind: "stroke", last: point };
      lastPoint.current = point;
    } else if (tool === "spray") {
      app.pushUndo(doc);
      for (const [x, y] of mirrorPoints(point.x, point.y, doc.width, doc.height, mirror)) spray(doc.pixels, doc.width, doc.height, x, y, brush, value);
      drag.current = { kind: "spray", last: point };
    } else {
      app.pushUndo(doc);
      drag.current = { kind: "shape", start: point, base: doc.pixels.slice() };
      drawShape(doc, point, point, value);
    }
    followLinks(doc);
    app.touch(doc);
  }

  function pointerMove(event: PointerEvent) {
    if (!doc) return;
    const point = pointAt(event);
    if (app.readoutRef.current) app.readoutRef.current.textContent = inside(doc, point) ? `${point.x}, ${point.y} · tile ${point.x >> 3}, ${point.y >> 3}` : "";
    const outline = app.brushRef.current;
    if (outline) {
      if (tool === "stamp") {
        // The stamp's footprint where it would land.
        const visible = inside(doc, point) && Boolean(stamp.current);
        Object.assign(outline.style, { display: visible ? "block" : "none", left: `${(point.x & ~7) * doc.zoom}px`, top: `${(point.y & ~7) * doc.zoom}px`, width: `${(stamp.current?.w ?? CELL) * doc.zoom}px`, height: `${(stamp.current?.h ?? CELL) * doc.zoom}px` });
      } else {
        const cells = tool === "palette" || tool === "priority", tall = tool === "palette" && doc.keyGreen;
        const cellH = tall ? 2 * CELL : CELL, cellOffset = Math.floor((cellBrush - 1) / 2);
        const size = cells ? CELL * cellBrush : brush, offset = cells ? 0 : Math.floor((brush - 1) / 2);
        const [x, y] = cells ? [(point.x & ~7) - cellOffset * CELL, (tall ? point.y & ~15 : point.y & ~7) - cellOffset * cellH] : [point.x - offset, point.y - offset];
        const visible = inside(doc, point) && tool !== "hand" && tool !== "select" && tool !== "move";
        Object.assign(outline.style, { display: visible ? "block" : "none", left: `${x * doc.zoom}px`, top: `${y * doc.zoom}px`, width: `${size * doc.zoom}px`, height: `${(cells ? cellH * cellBrush : size) * doc.zoom}px` });
      }
    }
    if (app.seamless && inside(doc, point) && (app.hoverCell?.x !== point.x >> 3 || app.hoverCell?.y !== point.y >> 3)) app.setHoverCell({ x: point.x >> 3, y: point.y >> 3 });
    const state = drag.current;
    if (!state) return;
    const value = tool === "eraser" || (shade === CLEAR && !doc.hasAlpha) ? app.blank(doc) : shade;
    if (state.kind === "pan") {
      const scroller = app.scrollerRef.current!;
      scroller.scrollLeft = state.left - (event.clientX - state.x);
      scroller.scrollTop = state.top - (event.clientY - state.y);
      return;
    }
    if (state.kind === "stroke") {
      for (const [x, y] of linePoints(state.last.x, state.last.y, point.x, point.y)) mark(doc, { x, y }, value);
      state.last = lastPoint.current = point;
    } else if (state.kind === "spray") {
      for (const [x, y] of mirrorPoints(point.x, point.y, doc.width, doc.height, mirror)) spray(doc.pixels, doc.width, doc.height, x, y, brush, value);
    } else if (state.kind === "cells") {
      for (const [x, y] of linePoints(state.last.x, state.last.y, point.x, point.y)) setCell(doc, { x, y });
      state.last = lastPoint.current = point;
    } else if (state.kind === "stamp") {
      // Copies tile outward from the first one, a stamp's size apart, so a block repeats seamlessly.
      const source = stamp.current;
      if (source) {
        const at = { x: state.origin.x + Math.floor((point.x - state.origin.x) / source.w) * source.w, y: state.origin.y + Math.floor((point.y - state.origin.y) / source.h) * source.h };
        if (at.x !== state.last.x || at.y !== state.last.y) {
          drop(doc.pixels, doc.width, doc.height, { ...source, ...at });
          if (source.cells && at.x % CELL === 0 && at.y % CELL === 0) putStamp(doc, at);
          state.last = at;
        }
      }
    } else if (state.kind === "priority") {
      for (const [x, y] of linePoints(state.last.x, state.last.y, point.x, point.y)) setPriority(doc, { x, y }, state.on);
      state.last = point;
    } else if (state.kind === "shape") {
      doc.pixels.set(state.base);
      drawShape(doc, state.start, point, value);
    } else if (state.kind === "marquee") {
      const rect = rectFrom(state.start.x, state.start.y, point.x, point.y);
      doc.sel = clipRect(snap ? snapRect(rect, CELL) : rect, doc.width, doc.height);
    } else if (state.kind === "move") {
      const step = (distance: number) => snap ? Math.round(distance / CELL) * CELL : distance;
      app.moveFloat(doc, state.ox + step(point.x - state.start.x), state.oy + step(point.y - state.start.y));
    }
    if (state.kind === "stroke" || state.kind === "spray" || state.kind === "shape" || state.kind === "stamp") followLinks(doc);
    app.bump();
  }

  function pointerUp() {
    const state = drag.current;
    drag.current = null;
    linkStroke.current = null;
    if (!doc || !state || state.kind === "pan") return;
    if (state.kind === "marquee" && doc.sel && doc.sel.w < 2 && doc.sel.h < 2) doc.sel = null;
    if (state.kind !== "marquee") app.touch(doc);
    else app.bump();
  }

  return { takeStamp, pointerDown, pointerMove, pointerUp };
}
