/** The bits of GB Studio's project format GBPaint reads and writes. */
import { MAX_BACKGROUND_PALETTES } from "./limits";

/** Slot 7 is the UI palette in GB Studio; a scene has eight background palette slots in all. */
export const UI_PALETTE_SLOT = MAX_BACKGROUND_PALETTES;
/** Bit 7 of a tile color attribute: the tile draws above sprites. */
export const PRIORITY_FLAG = 0x80;

/**
 * Decodes a background's `tileColors` string: runs of a two-hex-digit CGB attribute followed by either
 * "!" (one cell) or a hex count terminated by "+". Low three bits are the palette slot.
 */
export function decodeTileColors(encoded: string): number[] {
  const values: number[] = [];
  const pattern = /([0-9a-f]{2})(!|([0-9a-f]+)\+)/y;
  let position = 0;
  while (position < encoded.length) {
    pattern.lastIndex = position;
    const match = pattern.exec(encoded);
    if (!match) throw new Error(`Unrecognized tileColors data at character ${position}.`);
    const count = match[2] === "!" ? 1 : parseInt(match[3], 16);
    for (let index = 0; index < count; index += 1) values.push(parseInt(match[1], 16));
    position = pattern.lastIndex;
  }
  return values;
}

/** The inverse of decodeTileColors, in GB Studio's own spelling: "07!" for one cell, "0714+" for a run of 0x14. */
export function encodeTileColors(values: readonly number[]): string {
  let out = "";
  for (let at = 0; at < values.length;) {
    const value = values[at];
    let count = 1;
    while (at + count < values.length && values[at + count] === value) count += 1;
    out += (value & 0xff).toString(16).padStart(2, "0") + (count === 1 ? "!" : `${count.toString(16)}+`);
    at += count;
  }
  return out;
}

/** Resolves a scene's eight palette slots; blank or missing slots use the project defaults. */
export function resolveScenePaletteIds(scenePaletteIds: readonly string[], defaultPaletteIds: readonly string[]): string[] {
  return Array.from({ length: UI_PALETTE_SLOT + 1 }, (_, slot) => scenePaletteIds[slot] || defaultPaletteIds[slot] || "");
}
