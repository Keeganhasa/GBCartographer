/**
 * A palette set (wizard W3): pure helpers that turn a source's colors into GB Studio palettes, four colors each,
 * lightest first. `groupColors` does the grouping for a loose color list (a Lospec palette); the rest are the small
 * steps the wizard needs (sorting, swapping, naming, the library's sets).
 */
import { LOW_CONTRAST, hexRgb } from "../paint";

/** CIE L*a*b* of "#RRGGBB" (D65), as paint.ts measures colors: kept here so a grouping measures each color once. */
function lab(hex: string): [number, number, number] {
  const linear = hexRgb(hex).map((value) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const [x, y, z] = [
    (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047,
    linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722,
    (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883,
  ].map((value) => value > 216 / 24389 ? Math.cbrt(value) : (24389 / 27 * value + 16) / 116);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** How light a color looks (L*, 0 black … 100 white). */
export const lightness = (hex: string) => lab(hex)[0];

/** A palette's colors lightest first (GB Studio's order: color 1 lightest … color 4 darkest). */
export const lightestFirst = (colors: readonly string[]) => [...colors].sort((a, b) => lightness(b) - lightness(a));

/** "#rgb…" variants to "#RRGGBB"; null when it isn't a 6-digit hex color. */
const normalize = (color: string) => { const hex = color.trim().replace(/^#/, ""); return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null; };

/** Every distinct color of some palettes, in order of first use (fetchLospec hands colors back already grouped). */
export function flattenColors(palettes: readonly { colors: readonly string[] }[]): string[] {
  const seen = new Set<string>();
  for (const palette of palettes) for (const color of palette.colors) { const hex = normalize(color); if (hex) seen.add(hex); }
  return [...seen];
}

/**
 * Groups a loose list of colors into `count` GB Studio palettes of four, each lightest first. Every color is used
 * at least once when there are at most 4 × count of them (and as many as fit when there are more); with fewer,
 * the lightest and darkest colors are the ones reused, since they make good first and last colors in any palette.
 * Each palette grows from one colorful seed by adding the colors that keep it in one hue family and its four shades
 * apart. No two palettes are the same, so with very few colors there can be fewer than `count`; with fewer than
 * four colors, there is one palette with the darkest repeated.
 */
export function groupColors(colors: readonly string[], count = 8): string[][] {
  const hexes = flattenColors([{ colors }]);
  if (!hexes.length || count < 1) return [];
  if (hexes.length < 4) { const sorted = lightestFirst(hexes); while (sorted.length < 4) sorted.push(sorted[sorted.length - 1]); return [sorted]; }

  const info = hexes.map((hex) => { const [l, a, b] = lab(hex); return { hex, l, a, b, chroma: Math.hypot(a, b), hue: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 }; });
  const n = info.length;
  const distance = (i: number, j: number) => Math.hypot(info[i].l - info[j].l, info[i].a - info[j].a, info[i].b - info[j].b);
  // The two lightest and two darkest: cheap to reuse (they fit as color 1 or 4 of nearly any palette).
  const byLight = info.map((_, at) => at).sort((i, j) => info[j].l - info[i].l);
  const extremes = new Set([byLight[0], byLight[1], byLight[n - 1], byLight[n - 2]]);
  const uses = new Array<number>(n).fill(0);

  /** How good a (partial) palette is: new colors first, then distinct shades, a wide range, and one hue family. */
  const score = (set: number[]) => {
    let total = 0;
    for (const at of set) total += uses[at] === 0 ? 50 : -(extremes.has(at) ? 2 : 8) * uses[at];
    const sorted = [...set].sort((i, j) => info[j].l - info[i].l);
    for (let at = 0; at + 1 < sorted.length; at += 1) { const gap = distance(sorted[at], sorted[at + 1]); if (gap < LOW_CONTRAST) total -= (LOW_CONTRAST - gap) * 6; }
    total += (info[sorted[0]].l - info[sorted[sorted.length - 1]].l) * 0.25;
    // Hue clashes count only between colorful colors; near-white and near-black are excused by half.
    const weight = (at: number) => Math.min(1, info[at].chroma / 40) * (info[at].l > 85 || info[at].l < 20 ? 0.5 : 1);
    for (let i = 0; i < set.length; i += 1) for (let j = i + 1; j < set.length; j += 1) {
      const turn = Math.abs(info[set[i]].hue - info[set[j]].hue), hueGap = Math.min(turn, 360 - turn);
      total -= hueGap / 15 * 3 * Math.min(weight(set[i]), weight(set[j]));
    }
    return total;
  };

  const made: string[][] = [], keys = new Set<string>();
  for (let palette = 0; palette < count; palette += 1) {
    // The seed: the most colorful color not used yet (else the least used), so each palette has a hue family to grow from.
    const order = info.map((_, at) => at).sort((i, j) => uses[i] - uses[j] || info[j].chroma - info[i].chroma);
    const set = [order[0]];
    const unusedLeft = () => uses.reduce((sum, value, at) => sum + (value === 0 && !set.includes(at) ? 1 : 0), 0);
    let stuck = false;
    while (set.length < 4) {
      const slotsLeft = (count - palette) * 4 - set.length;
      // When every remaining slot is needed for an unused color, only unused colors may go in.
      const mustCover = unusedLeft() >= slotsLeft;
      const last = set.length === 3;
      let best = -1, bestScore = -Infinity;
      for (const strict of mustCover ? [true, false] : [false]) {
        for (let at = 0; at < n; at += 1) {
          if (set.includes(at) || (strict && uses[at] > 0)) continue;
          const next = [...set, at];
          if (last && keys.has(key(next, info))) continue;
          const value = score(next);
          if (value > bestScore) { bestScore = value; best = at; }
        }
        if (best >= 0) break;
      }
      if (best < 0) { stuck = true; break; }
      set.push(best);
    }
    if (stuck) {
      // Every way to finish this palette repeats one already made (few colors): try every set of four instead.
      const best = n <= 24 ? bestUnmade(n, (four) => keys.has(key(four, info)) ? -Infinity : score(four)) : null;
      if (!best) break;
      set.splice(0, 4, ...best);
    }
    keys.add(key(set, info));
    for (const at of set) uses[at] += 1;
    made.push(set.sort((i, j) => info[j].l - info[i].l).map((at) => info[at].hex));
  }
  return made;
}

const key = (set: number[], info: { hex: string }[]) => set.map((at) => info[at].hex).sort().join();

/** The best-scoring set of four of n colors (by index), or null when every one scores -Infinity. */
function bestUnmade(n: number, value: (four: number[]) => number): number[] | null {
  let best: number[] | null = null, bestValue = -Infinity;
  for (let a = 0; a < n; a += 1) for (let b = a + 1; b < n; b += 1) for (let c = b + 1; c < n; c += 1) for (let d = c + 1; d < n; d += 1) {
    const four = [a, b, c, d], score = value(four);
    if (score > bestValue) { bestValue = score; best = four; }
  }
  return best;
}

/** Swaps two colors, within one palette or across two ([palette, color] positions). Returns new palettes. */
export function swapColors(palettes: readonly string[][], a: [number, number], b: [number, number]): string[][] {
  const next = palettes.map((colors) => [...colors]);
  const held = next[a[0]][a[1]];
  next[a[0]][a[1]] = next[b[0]][b[1]];
  next[b[0]][b[1]] = held;
  return next;
}

/** The palettes' names: each one's own name when given, else `<base>-<n>` (the project's "DWC-1-Cliffs" style, short). */
export function paletteNames(base: string, count: number, own: readonly string[] = []): string[] {
  return Array.from({ length: count }, (_, index) => own[index]?.trim() || `${base.trim()}-${index + 1}`);
}

/** A base name from a Lospec link or name ("lospec.com/palette-list/sweetie-16" → "sweetie-16"). */
export function baseFromLink(link: string): string {
  return /palette-list\/([a-z0-9-]+)/i.exec(link)?.[1] ?? link.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/** A picture's file name as a base name: no folder, no extension. */
export const baseFromFile = (name: string) => name.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, "").trim();

export interface LibrarySet { id: string; label: string; base: string; palettes: { name: string; colors: string[] }[] }

/**
 * The bundled library as sets to pick from: a small collection whole (eight or fewer), a big one by its name
 * prefixes ("DWC-1-Cliffs" … "DWC-8-UI" make the DWC set). Time-of-day variants ("… D", "… N", "… S") are left
 * out, since they are versions of a set's palettes rather than members of it.
 */
export function librarySets(collections: readonly { name: string; palettes: readonly { name: string; colors: readonly string[] }[] }[]): LibrarySet[] {
  const sets: LibrarySet[] = [];
  const copy = (palette: { name: string; colors: readonly string[] }) => ({ name: palette.name, colors: [...palette.colors] });
  for (const collection of collections) {
    const palettes = collection.palettes.filter((palette) => palette.colors.length === 4 && !/ [DNS]$/.test(palette.name));
    if (palettes.length <= 8) { if (palettes.length) sets.push({ id: collection.name, label: `${collection.name} (${palettes.length})`, base: collection.name, palettes: palettes.map(copy) }); continue; }
    const groups = new Map<string, typeof palettes>();
    for (const palette of palettes) {
      const prefix = palette.name.split("-")[0].trim();
      if (prefix && prefix !== palette.name) groups.set(prefix, [...(groups.get(prefix) ?? []), palette]);
    }
    for (const [prefix, members] of groups) {
      if (members.length < 2) continue;
      sets.push({ id: `${collection.name}/${prefix}`, label: `${collection.name} · ${prefix} (${members.length > 8 ? `first 8 of ${members.length}` : members.length})`, base: prefix, palettes: members.slice(0, 8).map(copy) });
    }
  }
  return sets;
}
