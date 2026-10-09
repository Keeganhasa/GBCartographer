/**
 * Writes the app's icons from the logo (src/app/logo.ts):
 *   public/favicon.svg   the browser tab icon, pixel for pixel
 *   build/icon.png       1024 × 1024 app icon (Dock, window, and what electron-builder turns into .icns / .ico):
 *                        the logo on a rounded dark plate, like other macOS app icons
 *   npm run build-app-icon
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { encodePng } from "../src/gb/png";
import { APP_LOGO, APP_LOGO_COLORS } from "../src/ui/logo";

const [w, h] = [APP_LOGO[0].length, APP_LOGO.length];
const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

// Favicon: one rect per run of a shade, centred in a square view box.
const side = Math.max(w, h);
const rects = APP_LOGO.flatMap((row, y) => {
  const out: string[] = [];
  for (let x = 0; x < row.length;) {
    let end = x + 1;
    while (end < row.length && row[end] === row[x]) end += 1;
    if (row[x] !== ".") out.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${APP_LOGO_COLORS[Number(row[x])]}"/>`);
    x = end;
  }
  return out;
});
writeFileSync("public/favicon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-(side - w) / 2} ${-(side - h) / 2} ${side} ${side}" shape-rendering="crispEdges">${rects.join("")}</svg>\n`);

// App icon: 1024 px. The Dock shows an icon set at runtime as-is (no margin added), so the rounded plate fills the
// image almost edge to edge, like the other apps beside it, and the logo is scaled up by whole pixels to fill it.
const SIZE = 1024, PLATE = 1000, RADIUS = 225, PLATE_COLOR = rgb("#1B2420"), EDGE = rgb("#306850");
const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
const plate0 = (SIZE - PLATE) / 2;
const inPlate = (x: number, y: number, inset = 0) => {
  const [x0, y0, x1, y1] = [plate0 + inset, plate0 + inset, plate0 + PLATE - inset, plate0 + PLATE - inset];
  if (x < x0 || y < y0 || x >= x1 || y >= y1) return false;
  const r = RADIUS - inset;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
  if (!inPlate(x + 0.5, y + 0.5)) continue;
  pixels.set([...(inPlate(x + 0.5, y + 0.5, 12) ? PLATE_COLOR : EDGE), 255], (y * SIZE + x) * 4);
}
const scale = Math.floor((PLATE * 0.8) / side);
const [ox, oy] = [Math.round((SIZE - w * scale) / 2), Math.round((SIZE - h * scale) / 2)];
APP_LOGO.forEach((row, y) => [...row].forEach((shade, x) => {
  if (shade === ".") return;
  const color = rgb(APP_LOGO_COLORS[Number(shade)]);
  for (let dy = 0; dy < scale; dy += 1) for (let dx = 0; dx < scale; dx += 1) pixels.set([...color, 255], ((oy + y * scale + dy) * SIZE + ox + x * scale + dx) * 4);
}));
mkdirSync("build", { recursive: true });
writeFileSync("build/icon.png", encodePng(pixels, SIZE, SIZE, deflateSync));
console.log(`Icons: public/favicon.svg, build/icon.png (${SIZE} × ${SIZE}, logo at ${scale}×)`);
