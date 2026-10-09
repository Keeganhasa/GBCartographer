export const TILE_SIZE = 8;
export const MIN_MAP_WIDTH_PX = 160;
export const MIN_MAP_HEIGHT_PX = 144;
export const MAX_MAP_WIDTH_PX = 2040;
export const MAX_MAP_HEIGHT_PX = 2040;
export const MAX_MAP_AREA_PX = 1_048_320;
export const UNIQUE_TILE_LIMITS = {
  monochrome: 192,
  colorMonochrome: 192,
  colorOnly: 384,
} as const;
export type ColorMode = keyof typeof UNIQUE_TILE_LIMITS;
export const MONOCHROME_PALETTE = ["#E0F8CF", "#86C06C", "#306850", "#071821"] as const;
export const MAX_BACKGROUND_PALETTES = 7;
export const COLORS_PER_TILE = 4;
