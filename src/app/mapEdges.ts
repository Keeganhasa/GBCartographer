/**
 * Map Room edges: neighbouring screens share their edge tiles (adventure-style flip screens): a screen's last tile
 * column is its east neighbour's first, its last tile row its south neighbour's first. Pictures are RGBA in the
 * GB greens; tiles compare by GB Studio's shade (the green channel) and see-through.
 */
import { gbStudioShade } from "../paint";

export type Side = "north" | "south" | "east" | "west";
export const SIDES: Side[] = ["north", "east", "south", "west"];
export const OFFSET: Record<Side, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
export const OPPOSITE: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };

export interface Picture { rgba: Uint8ClampedArray; width: number; height: number }

/** The pixel rectangle of a picture's edge strip on `side`, `depth` tiles deep. */
function strip(picture: Picture, side: Side, depth: number): { x: number; y: number; w: number; h: number } {
  const d = depth * 8;
  if (side === "west") return { x: 0, y: 0, w: d, h: picture.height };
  if (side === "east") return { x: picture.width - d, y: 0, w: d, h: picture.height };
  if (side === "north") return { x: 0, y: 0, w: picture.width, h: d };
  return { x: 0, y: picture.height - d, w: picture.width, h: d };
}

const shadeAt = (picture: Picture, x: number, y: number) => {
  const at = (y * picture.width + x) * 4;
  return picture.rgba[at + 3] < 128 ? 4 : gbStudioShade(picture.rgba[at + 1]);
};

/**
 * How many tiles along the shared edge match: `mine`'s edge strip on `side` against `theirs` on the opposite side,
 * `depth` tiles deep (the map's overlap: the screens share that many tile columns or rows). Returns matching and
 * total positions along the edge.
 */
export function edgeMatch(mine: Picture, theirs: Picture, side: Side, depth = 1): { match: number; total: number } {
  const a = strip(mine, side, depth), b = strip(theirs, OPPOSITE[side], depth);
  const along = side === "east" || side === "west" ? Math.min(a.h, b.h) : Math.min(a.w, b.w);
  const total = Math.floor(along / 8), across = depth * 8;
  let match = 0;
  for (let tile = 0; tile < total; tile += 1) {
    let same = true;
    for (let i = 0; i < 8 * across && same; i += 1) {
      const u = tile * 8 + (side === "east" || side === "west" ? Math.floor(i / across) : (i & 7)), v = side === "east" || side === "west" ? i % across : (i >> 3);
      const [ax, ay, bx, by] = side === "east" || side === "west" ? [a.x + v, a.y + u, b.x + v, b.y + u] : [a.x + u, a.y + v, b.x + u, b.y + v];
      if (shadeAt(mine, ax, ay) !== shadeAt(theirs, bx, by)) same = false;
    }
    if (same) match += 1;
  }
  return { match, total };
}

/**
 * Copies `from`'s edge strip that faces `to` onto `to`'s opposite edge, `depth` tiles deep: with `side` the side of
 * `to` that `from` is on. E.g. side "west": from's last columns become to's first columns. Changes `to` in place.
 */
export function copyEdge(from: Picture, to: Picture, side: Side, depth: number) {
  const source = strip(from, OPPOSITE[side], depth), target = strip(to, side, depth);
  const w = Math.min(source.w, target.w), h = Math.min(source.h, target.h);
  for (let y = 0; y < h; y += 1) {
    const s = ((source.y + y) * from.width + source.x) * 4, t = ((target.y + y) * to.width + target.x) * 4;
    to.rgba.set(from.rgba.subarray(s, s + w * 4), t);
  }
}
