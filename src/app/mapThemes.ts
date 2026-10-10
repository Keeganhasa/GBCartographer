/**
 * Palette themes for the map generators (2026-10-10): which library palettes a generated map wears. An overworld
 * theme has seven palettes, one per terrain (grass, forest, mountain, water, shore, road, town), every terrain on
 * grass sharing shade 0 so cells meet cleanly; or one palette for the whole map. A cave theme is one palette (floor
 * shade 0, rock shades 2–3). The SpicyGame themes (public domain) use only that set's own colors, arranged by terrain.
 */
import library from "../palettes/library.json";

export interface MapPalette { name: string; colors: string[] }
export interface MapTheme { id: string; name: string; /** Who the colors are by, and their license. */ credit: string; palettes: MapPalette[] }

const named = (name: string): MapPalette | null => {
  for (const collection of library.collections) for (const palette of collection.palettes) if (palette.name === name) return { name, colors: [...palette.colors] };
  return null;
};
const terrains = (base: string, sets: string[][]): MapPalette[] => ["Grass", "Forest", "Mountain", "Water", "Shore", "Road", "Town"].map((terrain, at) => ({ name: `${base} ${terrain}`, colors: sets[at] }));
const SPICY = "SpicyGame, public domain";

/** The author's Overworld set, as it is in the library. */
export const OVERWORLD_PALETTES: MapPalette[] = (library.collections.find((group) => group.name === "Overworld")?.palettes ?? []).map(({ name, colors }) => ({ name, colors: [...colors] }));

export const WORLD_THEMES: MapTheme[] = [
  { id: "overworld", name: "Overworld", credit: "Keegan, CC0", palettes: OVERWORLD_PALETTES },
  { id: "vibe20", name: "VIBE-20", credit: SPICY, palettes: terrains("VIBE-20", [
    ["#43BD35", "#007A49", "#3E4A6D", "#1C162D"],
    ["#43BD35", "#A7FF19", "#007A49", "#1C162D"],
    ["#43BD35", "#96A3B0", "#5A7088", "#1C162D"],
    ["#FFEEE5", "#0099DB", "#124E89", "#1C162D"],
    ["#FFD09C", "#B94F38", "#0099DB", "#1C162D"],
    ["#43BD35", "#FFD09C", "#B94F38", "#1C162D"],
    ["#43BD35", "#FFEEE5", "#DA2424", "#1C162D"],
  ]) },
  { id: "vibrant14", name: "Vibrant-14", credit: SPICY, palettes: terrains("Vibrant-14", [
    ["#43BD35", "#07E5A0", "#124E89", "#1C162D"],
    ["#43BD35", "#07E5A0", "#124E89", "#1C162D"],
    ["#43BD35", "#5A7088", "#3E4A6D", "#1C162D"],
    ["#FFEEE5", "#0099DB", "#124E89", "#1C162D"],
    ["#FEE761", "#ECAB11", "#0099DB", "#1C162D"],
    ["#43BD35", "#FEE761", "#ECAB11", "#1C162D"],
    ["#43BD35", "#FFEEE5", "#DA2424", "#1C162D"],
  ]) },
  ...["SG-Winter Forest GB", "SG-Campfire GB"].flatMap((name) => { const palette = named(name); return palette ? [{ id: name, name: name.replace("SG-", ""), credit: `${SPICY} (one palette)`, palettes: [palette] }] : []; }),
];

export const CAVE_THEMES: MapTheme[] = [
  ["V20-5-Stone", "Stone (VIBE-20)", SPICY], ["V14-5-Stone", "Stone (Vibrant-14)", SPICY], ["SG-Winter Forest GB", "Winter Forest GB", SPICY],
  ["SG-Campfire GB", "Campfire GB", SPICY], ["DWC-1-Cliffs", "Dustwatch cliffs (Chorbi)", "Keegan, CC0"], ["DWC-6-MauveBldg", "Dustwatch mauve (Chorbi)", "Keegan, CC0"],
].flatMap(([palette, name, credit]) => { const found = named(palette); return found ? [{ id: palette, name, credit, palettes: [found] }] : []; });

export const themeOf = (themes: MapTheme[], id: string) => themes.find((theme) => theme.id === id) ?? null;
