/**
 * Themes (all dark) and the font choice, remembered per browser.
 * - "slate" (default) is a neutral dark gray with an orange accent; "oled" is true black; "shuffle" picks OLED
 *   with a random accent each launch.
 * - "slate" and the OLED themes are hand-tuned in theme.css (the accent comes from data-accent).
 * - Palette themes are built from four colors (lightest first, like a GB Studio palette): backgrounds take the
 *   darkest, text the lightest, and everything between sits on the ramp through the other two. They are
 *   computed here and set as inline CSS variables.
 */
import { LIGHT_TOKENS } from "./themeTokens";

export type ThemeChoice = "shuffle" | "oled" | "oled-maroon" | "oled-green" | "slate" | "dmg" | "pocket" | "berry";
export type FontChoice = "inter" | "mono" | "dyslexic" | "pixel";

export interface ThemeInfo {
  id: ThemeChoice;
  label: string;
  title: string;
  /** Four colors, lightest first, for palette themes. */
  colors?: string[];
}

/** One theme for now (the author's call, 2026-10-09): OLED Maroon (it began as mauve). The others stay here, unlisted, for later. */
export const THEMES: ThemeInfo[] = [
  { id: "oled-maroon", label: "OLED maroon", title: "OLED maroon: true black with a maroon accent" },
  { id: "slate", label: "Slate", title: "Slate: neutral dark gray, orange accent" },
  { id: "oled", label: "OLED orange", title: "OLED orange: true black with an orange accent" },
  { id: "oled-green", label: "OLED green", title: "OLED green: true black with a Game Boy green accent" },
  { id: "shuffle", label: "Shuffle", title: "Shuffle: OLED black with an orange, maroon or green accent, a new pick every launch" },
  { id: "dmg", label: "DMG", title: "DMG: the original Game Boy's four greens", colors: ["#9BBC0F", "#8BAC0F", "#306230", "#0F380F"] },
  { id: "pocket", label: "Pocket", title: "Pocket: the Game Boy Pocket's four grays", colors: ["#C4CFA1", "#8B956D", "#4D533C", "#1F1F1F"] },
  { id: "berry", label: "Berry", title: "Berry: Game Boy Color grape", colors: ["#F0E0F8", "#B48CDC", "#5A3A8C", "#1C0F2E"] },
];

export const FONTS: { id: FontChoice; label: string; title: string }[] = [
  { id: "inter", label: "Inter", title: "Inter (default)" },
  { id: "mono", label: "JetBrains Mono", title: "JetBrains Mono: a monospaced face" },
  { id: "pixel", label: "Public Pixel", title: "Public Pixel: GGBotNet's 8 × 8 pixel font (CC0)" },
  { id: "dyslexic", label: "OpenDyslexic", title: "OpenDyslexic, fetched the first time it is turned on" },
];

const THEME_KEY = "gb-cartographer.theme";
/** v2: Inter became the default (2026-10-09); an older saved pick (JetBrains Mono was the default) starts over. */
const FONT_KEY = "gb-cartographer.font-v2";
const DYSLEXIC_CSS = "https://cdn.jsdelivr.net/npm/@fontsource/opendyslexic@5.3.0/index.css";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Per-browser convenience only.
  }
}

export function themeColors(choice: ThemeChoice): string[] | null {
  return THEMES.find((theme) => theme.id === choice)?.colors ?? null;
}

export function loadTheme(): ThemeChoice {
  // One theme for now: whatever was saved, the app wears OLED Maroon.
  void read(THEME_KEY);
  return "oled-maroon";
}

const SHUFFLE: ThemeChoice[] = ["oled", "oled-maroon", "oled-green"];
/** This launch's Shuffle pick: one per page load, so it changes on every reload. */
const SHUFFLE_PICK: ThemeChoice = SHUFFLE[Math.floor(Math.random() * SHUFFLE.length)];

/** The theme actually shown: Shuffle resolves to this launch's pick. */
export function resolveTheme(choice: ThemeChoice): ThemeChoice {
  return choice === "shuffle" ? SHUFFLE_PICK : choice;
}

export function isOledTheme(choice: ThemeChoice): boolean {
  return resolveTheme(choice).startsWith("oled");
}

// --- Palette ramp ----------------------------------------------------------------------------------------

type Rgba = [number, number, number, number];
function parse(text: string): Rgba {
  if (text.startsWith("#")) {
    const h = text.length === 4 ? text.slice(1).split("").map((c) => c + c).join("") : text.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  const parts = (text.match(/[\d.]+/g) ?? []).map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
}
const hex2 = (value: number) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0");
function format([r, g, b, a]: Rgba): string {
  return a >= 1 ? `#${hex2(r)}${hex2(g)}${hex2(b)}` : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(3)})`;
}
function lightness([r, g, b]: Rgba) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  return { l: (max + min) / 2, chroma: max - min, s: max === min ? 0 : (max - min) / (1 - Math.abs(max + min - 1)) };
}

/** A point on the palette's ramp: 0 = darkest color, 1 = lightest, straight lines between the four. */
export function rampColor(colors: string[], t: number, alpha = 1): string {
  const stops = [...colors].reverse().map(parse); // darkest first
  const position = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(position));
  const mix = position - index;
  const [a, b] = [stops[index], stops[index + 1]];
  return format([a[0] + (b[0] - a[0]) * mix, a[1] + (b[1] - a[1]) * mix, a[2] + (b[2] - a[2]) * mix, alpha]);
}

/** Every CSS token for a palette theme: light UI colors mapped onto the palette's dark-to-light ramp. */
export function paletteThemeTokens(colors: string[]): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [name, value] of LIGHT_TOKENS) {
    const rgba = parse(value);
    const { l, chroma, s } = lightness(rgba);
    let t: number;
    if (chroma >= 0.3 && s >= 0.45 && l >= 0.3 && l <= 0.7) t = 0.86; // accents: bright
    else if (chroma >= 0.08 && l >= 0.2 && l <= 0.62) t = 0.42; // muted mid-tones (active tabs, selections)
    else t = Math.max(0, Math.min(1, (1 - l - 0.04) / 0.82)); // light backgrounds → dark, dark text → light
    tokens[name] = rampColor(colors, t, rgba[3]);
  }
  tokens["--red"] = rampColor(colors, 0.9);
  tokens["--red-text"] = tokens["--red"];
  tokens["--muted"] = rampColor(colors, 0.74);
  tokens["--on-red"] = lightness(parse(tokens["--red"])).l > 0.55 ? rampColor(colors, 0) : rampColor(colors, 1);
  tokens["--moss"] = rampColor(colors, 0.42);
  Object.assign(tokens, {
    "--deep": rampColor(colors, 0),
    "--bar-line": rampColor(colors, 0.3),
    "--status-bg": rampColor(colors, 0.04),
    "--status-ink": rampColor(colors, 0.95),
    "--bar-hover": rampColor(colors, 0.16),
    "--bar-hover-line": rampColor(colors, 0.5),
  });
  return tokens;
}

let appliedTokens: string[] = [];

/** Sets the theme on <html> (slate needs nothing; palette themes set inline variables) and remembers it. */
export function applyTheme(choice: ThemeChoice, remember = true) {
  const root = document.documentElement;
  const shown = resolveTheme(choice);
  appliedTokens.forEach((name) => root.style.removeProperty(name));
  appliedTokens = [];
  const colors = themeColors(shown);
  const accent = shown === "oled-maroon" ? "maroon" : shown === "oled-green" ? "green" : null;
  if (accent) root.dataset.accent = accent;
  else delete root.dataset.accent;
  if (colors) {
    root.dataset.theme = "palette";
    for (const [name, value] of Object.entries(paletteThemeTokens(colors))) {
      root.style.setProperty(name, value);
      appliedTokens.push(name);
    }
  } else if (shown === "slate") delete root.dataset.theme;
  else root.dataset.theme = isOledTheme(shown) ? "oled" : shown;
  if (remember) write(THEME_KEY, choice);
}

export function loadFont(): FontChoice {
  const value = read(FONT_KEY);
  return FONTS.some((font) => font.id === value) ? value as FontChoice : "inter";
}

/** Switches every text in the app to the chosen font (OpenDyslexic is fetched the first time it is turned on). */
export function applyFont(choice: FontChoice, remember = true) {
  if (choice === "dyslexic" && !document.getElementById("open-dyslexic-font")) {
    const link = document.createElement("link");
    link.id = "open-dyslexic-font";
    link.rel = "stylesheet";
    link.href = DYSLEXIC_CSS;
    document.head.appendChild(link);
  }
  if (choice === "inter") delete document.documentElement.dataset.font;
  else document.documentElement.dataset.font = choice;
  if (remember) write(FONT_KEY, choice);
}
