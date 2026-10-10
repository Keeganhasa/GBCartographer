/** Files the painter hands to the user: saving a blob, and a sprite animation's frames put together. */
import type { PickerWindow, SpriteFrame } from "./model";

/**
 * Lets the user keep a file: a save dialog where the browser has one (Chromium, the desktop app), else a download.
 * Resolves true when kept; a cancel resolves false quietly, other failures go to `onError`.
 */
export async function saveFile(blob: Blob, name: string, types: object[], onError: (message: string) => void): Promise<boolean> {
  try {
    const picker = (window as PickerWindow).showSaveFilePicker;
    if (picker) {
      const handle = await picker.call(window, { suggestedName: name, types });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
    return true;
  } catch (error) {
    if ((error as Error).name !== "AbortError") onError(`Could not export ${name}: ${(error as Error).message}`);
    return false;
  }
}

/**
 * An animation's frames put together from their 8 × 16 slices of `sheet` (the picture as drawn), all on one size of
 * canvas: the union of every frame's extent.
 */
export function framesOf(sheet: HTMLCanvasElement, frames: readonly SpriteFrame[]): HTMLCanvasElement[] {
  if (!frames.length) return [];
  const left = Math.min(0, ...frames.flatMap((item) => item.tiles.map((tile) => tile.x))), top = Math.min(0, ...frames.flatMap((item) => item.tiles.map((tile) => tile.y)));
  const width = Math.max(16, ...frames.flatMap((item) => item.tiles.map((tile) => tile.x + 8))) - left, height = Math.max(16, ...frames.flatMap((item) => item.tiles.map((tile) => tile.y + 16))) - top;
  return frames.map((item) => {
    const canvas = document.createElement("canvas");
    Object.assign(canvas, { width, height });
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    for (const tile of item.tiles) {
      context.save();
      context.translate(tile.x - left + (tile.flipX ? 8 : 0), tile.y - top + (tile.flipY ? 16 : 0));
      context.scale(tile.flipX ? -1 : 1, tile.flipY ? -1 : 1);
      context.drawImage(sheet, tile.sliceX, tile.sliceY, 8, 16, 0, 0, 8, 16);
      context.restore();
    }
    return canvas;
  });
}
