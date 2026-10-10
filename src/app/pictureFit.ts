/**
 * Picture to background (W1, 2026-10-10): the pure part of the wizard. A framed RGBA picture goes through fewer
 * colors (the "keep colors" slider, optional dithering), the palette fit (four colors a tile, at most 8 or 7
 * palettes) and, when asked, the tile budget (near tiles merge until the count fits GB Studio's Color Only limit).
 */
import { countUniqueTiles, fitPalettes, fitTileBudget, posterize, type FitReport } from "../paint";
import { UNIQUE_TILE_LIMITS } from "../gb/limits";

export interface FitOptions {
  /** Colors to keep before fitting, 4 … 64 (fewer = cleaner tiles, more merging). */
  keep: number;
  dither: boolean;
  /** Palettes allowed: 8, or 7 to keep slot 8 for the UI. */
  max: 7 | 8;
  /** Merge near tiles until the picture fits the tile budget. */
  budget: boolean;
}

export interface FitResult {
  width: number; height: number;
  /** Each pixel's shade in its tile's palette. */
  pixels: Uint8Array;
  /** Each tile's palette, 1-based (0 none). */
  cells: Uint8Array;
  palettes: string[][];
  /** Unique tiles (flipped copies merged, as in a Color Only scene) before and after the budget step. */
  tilesBefore: number; tiles: number; merged: number;
  limit: number;
  report: FitReport;
}

export const TILE_LIMIT = UNIQUE_TILE_LIMITS.colorOnly;

export function fitPicture(rgba: Uint8ClampedArray, width: number, height: number, options: FitOptions): FitResult {
  const fewer = options.keep < 64 ? posterize(rgba, width, height, options.keep, options.dither) : options.dither ? posterize(rgba, width, height, 64, true) : rgba;
  const fit = fitPalettes(fewer, width, height, options.max);
  const tilesBefore = countUniqueTiles(fit.pixels, width, height, true);
  let pixels = fit.pixels, tiles = tilesBefore, merged = 0;
  if (options.budget && tilesBefore > TILE_LIMIT) {
    const under = fitTileBudget(fit.pixels, width, height, true, TILE_LIMIT);
    pixels = under.pixels; tiles = under.tiles; merged = under.merged;
  }
  return { width, height, pixels, cells: fit.cells, palettes: fit.palettes, tilesBefore, tiles, merged, limit: TILE_LIMIT, report: fit.report };
}

/** Size presets in whole screens; the label is what the wizard shows. */
export const SCREEN_SIZES: [number, number, string][] = [[160, 144, "1 screen"], [320, 144, "2 wide"], [160, 288, "2 tall"], [320, 288, "4 screens"]];
