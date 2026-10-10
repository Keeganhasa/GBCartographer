/**
 * The project check-up's pure parts (W8, CheckupWizard.tsx): which fix goes with which health issue, the order the
 * issues are shown in, and the palette fix itself (separateColors: pull two hard-to-tell-apart colors apart in
 * lightness, keeping their hue). No React, no fetches.
 */
import { colorDistance, hexRgb, LOW_CONTRAST } from "../paint";

/** One entry of GET /__cartographer/project-health (server/assets.ts projectHealth). */
export interface CheckupIssue { level: "problem" | "warning" | "note"; kind: string; file?: string; title: string; detail: string }

/** What the check-up can offer for an issue. Only "contrast", "unused", "twin" and "tiles" have a one-click fix. */
export type FixKind = "contrast" | "unused" | "twin" | "tiles" | "explain";

/** Picture kinds the painter can open (palettes and project settings have nowhere to open). */
const PICTURE_KINDS = new Set(["backgrounds", "sprites", "tilesets", "fonts", "emotes", "avatars", "ui"]);

export const isPicture = (issue: CheckupIssue) => Boolean(issue.file) && PICTURE_KINDS.has(issue.kind);

/** A stable key for an issue (the report has no ids). */
export const issueKey = (issue: CheckupIssue) => `${issue.level}|${issue.kind}|${issue.file ?? ""}|${issue.title}`;

/** "412 tiles, over 384" or "350 of 384 tiles": the count and the limit. */
export function tileCount(issue: CheckupIssue): { tiles: number; limit: number } | null {
  const over = /^(\d+) tiles, over (\d+)$/.exec(issue.title) ?? /^(\d+) of (\d+) tiles$/.exec(issue.title);
  return over ? { tiles: Number(over[1]), limit: Number(over[2]) } : null;
}

export function fixKind(issue: CheckupIssue): FixKind {
  if (issue.kind === "palettes" && issue.file) {
    if (issue.title === "Low contrast") return "contrast";
    if (issue.title === "Unused palette") return "unused";
    if (issue.title === "Same colors as another") return "twin";
  }
  if (issue.kind === "backgrounds" && issue.file && tileCount(issue)) return "tiles";
  return "explain";
}

/** Notes are only shown when they come with something to do (or when asked for). */
export const worthShowing = (issue: CheckupIssue, notes: boolean) => notes || issue.level !== "note" || fixKind(issue) !== "explain";

/** Worst first (problems, warnings, notes), the report's own order kept within a level. */
export function checkupOrder(issues: readonly CheckupIssue[], notes: boolean): CheckupIssue[] {
  const rank = { problem: 0, warning: 1, note: 2 } as const;
  return issues.map((issue, at) => ({ issue, at })).filter(({ issue }) => worthShowing(issue, notes))
    .sort((a, b) => rank[a.issue.level] - rank[b.issue.level] || a.at - b.at).map(({ issue }) => issue);
}

/** The close pairs a low-contrast detail names ("colors 2 and 3 differ by 4; …"), as 0-based positions. */
export function contrastPairs(detail: string): [number, number][] {
  return [...detail.matchAll(/colors (\d+) and (\d+)/g)].map((match) => [Number(match[1]) - 1, Number(match[2]) - 1] as [number, number]).filter(([a, b]) => a >= 0 && b >= 0 && a !== b);
}

/** The other palettes a "same colors" detail names ("The same four colors as A, B."), checked against the known names. */
export function twinNames(detail: string, known: readonly string[]): string[] {
  const list = detail.replace(/^The same four colors as /, "").replace(/\.$/, "");
  // Known names first (a name may hold a comma); otherwise the plain comma split.
  const found = known.filter((name) => list === name || list.startsWith(`${name}, `) || list.endsWith(`, ${name}`) || list.includes(`, ${name}, `));
  return found.length ? found : list.split(", ").filter(Boolean);
}

// ---- separating two colors ----------------------------------------------------------------------------------

/** CIE L* (0–100) of "#RRGGBB": how light a color looks. */
export function lightness(hex: string): number {
  const y = hexRgb(hex).map((value) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, value, at) => sum + value * [0.2126, 0.7152, 0.0722][at], 0);
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : 24389 / 27 * y;
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexRgb(hex).map((value) => value / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[f(0), f(8), f(4)].map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * Moves colors[index] lighter (+1) or darker (-1), hue and saturation kept, a small step at a time until it is
 * minDelta from colors[other]. It never passes its outer neighbour's lightness, so the palette stays lightest first.
 */
function push(colors: string[], index: number, direction: 1 | -1, other: number, minDelta: number) {
  const [h, s, start] = toHsl(colors[index]);
  const neighbour = colors[index - direction];
  const bound = neighbour === undefined ? null : lightness(neighbour);
  for (let l = start + direction * 0.005; l >= 0 && l <= 1; l += direction * 0.005) {
    if (colorDistance(colors[index], colors[other]) >= minDelta) return;
    const next = fromHsl(h, s, l);
    if (bound !== null && (direction > 0 ? lightness(next) > bound : lightness(next) < bound)) return;
    colors[index] = next;
  }
  // The ends: pure white or black, if the neighbour allows it.
  if (colorDistance(colors[index], colors[other]) < minDelta) {
    const end = fromHsl(h, s, direction > 0 ? 1 : 0);
    if (bound === null || (direction > 0 ? lightness(end) <= bound : lightness(end) >= bound)) colors[index] = end;
  }
}

/**
 * Pulls colors a and b of a lightest-first palette apart until they differ by at least minDelta (CIE76 ΔE, the
 * health check's measure). The color nearer the middle of the lightness range moves first (lighter if it is the
 * lighter one of the pair, darker if not); if it runs out of room the other one moves too. Hues are kept, the order
 * stays lightest first, other colors are untouched. Returns a new array (as far as it could go, if not all the way).
 */
export function separateColors(colors: string[], a: number, b: number, minDelta = LOW_CONTRAST): string[] {
  const out = [...colors];
  if (a === b || !(a in out) || !(b in out)) return out;
  const [light, dark] = a < b ? [a, b] : [b, a];
  if (colorDistance(out[light], out[dark]) >= minDelta) return out;
  const nearMiddle = Math.abs(lightness(out[light]) - 50) <= Math.abs(lightness(out[dark]) - 50) ? light : dark;
  for (const index of nearMiddle === light ? [light, dark] : [dark, light]) {
    push(out, index, index === light ? 1 : -1, index === light ? dark : light, minDelta);
    if (colorDistance(out[light], out[dark]) >= minDelta) break;
  }
  return out;
}

/** Separates every named pair in turn (twice over, as moving one pair can tighten its neighbour). */
export function separatePairs(colors: string[], pairs: readonly [number, number][], minDelta = LOW_CONTRAST): string[] {
  let out = [...colors];
  for (let pass = 0; pass < 2; pass += 1) for (const [a, b] of pairs) out = separateColors(out, a, b, minDelta);
  return out;
}

/**
 * What to do about an issue the check-up can't fix by itself, in plain words. GB Cartographer doesn't write project
 * settings or sizes from here, so these point at GB Studio or at the painter.
 */
export function whatToDo(issue: CheckupIssue): string {
  const size = /^Should be (\d+) × (\d+)$/.exec(issue.title);
  if (issue.title === "Color mode is off") return "In GB Studio, open Settings and set the color mode to Color only (384 tiles a background) or GB + Color (192). GB Cartographer leaves project settings to GB Studio.";
  if (issue.title === "Not read by GB Studio yet") return "Nothing to fix by hand: open the project in GB Studio once and it adds the .gbsres file beside the picture.";
  if (issue.title === "Not whole tiles") return "Open it and resize it to whole tiles (8 × 8, or 8 × 16 for sprites in 8 × 16 mode), then check its scenes in GB Studio.";
  if (size) return `Open it and resize it to ${size[1]} × ${size[2]} px; GB Studio reads nothing else for this file.`;
  if (issue.title === "Smaller than the screen") return "Fine if it's meant to be small: GB Studio fills the rest of the scene. To draw the whole screen, open it and resize it to at least 160 × 144.";
  if (/ in slot 8$/.test(issue.title)) return "Open it and repaint those tiles with another palette (the palette brush), unless they are meant to change with the dialogue and menu palette.";
  if (/time-of-day palette/.test(issue.title)) return "Nothing to do: events switch these palettes in, so being unused or dim is expected.";
  return issue.file && PICTURE_KINDS.has(issue.kind) ? "Open it to have a look." : "Nothing to fix from here.";
}

/** "Fixed 3, skipped 2" (and what is left to do in GB Studio). */
export function checkupSummary(fixed: number, skipped: number, elsewhere: number): string {
  const parts = [`Fixed ${fixed}`, `skipped ${skipped}`];
  if (elsewhere) parts.push(`${elsewhere} to do in GB Studio or the painter`);
  return parts.join(", ");
}
