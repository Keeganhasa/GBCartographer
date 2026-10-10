/**
 * A dialogue box as GB Studio draws it, roughly: the project's frame (assets/ui/frame.png, nine 8 × 8 tiles), a
 * font sheet (8 × 8 glyphs from character 32, 16 a row) and the UI palette (background slot 8 of the project's
 * defaults; the greens in monochrome), over one of the backgrounds if you like. Approximate: GB Studio's event
 * options (lines, position, variable-width fonts) change the real box.
 * The window is a kit Dialog: font and background on top, the box, the text to try, notes in the foot.
 */
import { MessageSquareText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GB_SHADES, gbStudioShade, hexRgb } from "../paint";
import { Dialog, Field, Select } from "../ui/kit";
import type { Asset } from "./model";
import "./DialoguePreview.css";

/** The kit's Select can't hold an empty value, so "no background" has its own (file names end in .png). */
const NONE = "none";

interface Settings { colorMode: string; uiPalette: string[] | null; defaultFont: string | null; fonts: { file: string; name: string }[] }

const load = (src: string) => new Promise<HTMLImageElement | null>((resolve) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = src; });
const pixelsOf = (image: HTMLImageElement) => {
  const canvas = document.createElement("canvas");
  Object.assign(canvas, { width: image.naturalWidth, height: image.naturalHeight });
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
};

export function DialoguePreview({ backgrounds, hasFrame, onClose }: { backgrounds: Asset[]; hasFrame: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [font, setFont] = useState("");
  const [background, setBackground] = useState("");
  const [text, setText] = useState("Hello! It's cold out\nhere. Come inside?");
  const [images, setImages] = useState<{ frame: ImageData | null; font: ImageData | null; scene: HTMLImageElement | null }>({ frame: null, font: null, scene: null });
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void fetch("./__cartographer/dialogue-settings", { cache: "no-cache" }).then((response) => response.json() as Promise<Settings>).then((result) => { setSettings(result); setFont(result.defaultFont ?? ""); });
  }, []);
  useEffect(() => {
    let live = true;
    void (async () => {
      const frame = hasFrame ? await load(`./__cartographer/gbstudio-asset?kind=ui&file=frame.png&t=${Date.now()}`) : null;
      const sheet = font ? await load(`./__cartographer/gbstudio-asset?${new URLSearchParams({ kind: "fonts", file: font })}`) : null;
      const picked = backgrounds.find((item) => item.file === background);
      const scene = picked ? await load(`./__cartographer/gbstudio-asset-preview?${new URLSearchParams({ kind: "backgrounds", file: picked.file })}&v=${Math.round(picked.mtime)}&pv=2`) : null;
      if (live) setImages({ frame: frame ? pixelsOf(frame) : null, font: sheet ? pixelsOf(sheet) : null, scene });
    })();
    return () => { live = false; };
  }, [font, background, hasFrame, backgrounds]);
  const palette = (settings?.uiPalette ?? [...GB_SHADES]).map(hexRgb);
  const lines = text.split("\n").slice(0, 4);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    Object.assign(target, { width: 160, height: 144 });
    const context = target.getContext("2d")!;
    context.fillStyle = "#000";
    context.fillRect(0, 0, 160, 144);
    if (images.scene) context.drawImage(images.scene, 0, 0);
    const out = context.getImageData(0, 0, 160, 144);
    const put = (x: number, y: number, shade: number) => {
      if (x < 0 || y < 0 || x >= 160 || y >= 144) return;
      const at = (y * 160 + x) * 4, [r, g, b] = palette[shade];
      out.data.set([r, g, b, 255], at);
    };
    // The box: the frame's nine tiles stretched around the lines (or a plain box without a frame).
    const rows = Math.max(1, lines.length), height = rows * 8 + 16, top = 144 - height;
    for (let ty = 0; ty < height / 8; ty += 1) {
      for (let tx = 0; tx < 20; tx += 1) {
        const fx = tx === 0 ? 0 : tx === 19 ? 16 : 8, fy = ty === 0 ? 0 : ty === height / 8 - 1 ? 16 : 8;
        for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
          let shade = fx === 8 && fy === 8 ? 0 : 3;
          if (images.frame) {
            const at = ((fy + y) * images.frame.width + fx + x) * 4;
            shade = gbStudioShade(images.frame.data[at + 1]);
          }
          put(tx * 8 + x, top + ty * 8 + y, shade);
        }
      }
    }
    // The text: 8 × 8 glyphs from character 32, 16 a row. GB Studio's font rule: white (green above 249) and
    // magenta are see-through; a variable-width font marks a glyph's unused columns in magenta, so each glyph
    // advances by the columns before them.
    const sheet = images.font;
    if (sheet) {
      const at = (x: number, y: number) => (y * sheet.width + x) * 4;
      const magenta = (p: number) => sheet.data[p] > 249 && sheet.data[p + 2] > 249 && sheet.data[p + 1] < 250;
      lines.forEach((line, row) => {
        let pen = 8;
        for (const char of line) {
          const index = char.charCodeAt(0) - 32;
          if (index < 0) continue;
          const sx = (index % 16) * 8, sy = Math.floor(index / 16) * 8;
          if (sy + 8 > sheet.height) continue;
          let width = 8;
          while (width > 0 && Array.from({ length: 8 }, (_, y) => magenta(at(sx + width - 1, sy + y))).every(Boolean)) width -= 1;
          if (pen + width > 152) break;
          for (let y = 0; y < 8; y += 1) for (let x = 0; x < width; x += 1) {
            const p = at(sx + x, sy + y);
            if (sheet.data[p + 3] < 128 || sheet.data[p + 1] > 249 || magenta(p)) continue;
            const shade = gbStudioShade(sheet.data[p + 1]);
            if (shade > 0) put(pen + x, top + 8 + row * 8 + y, shade);
          }
          pen += Math.max(1, width);
        }
      });
    }
    context.putImageData(out, 0, 0);
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} icon={<MessageSquareText size={18} />} title="Dialogue box" sub="As GB Studio draws it, roughly"
      footer={
        <div className="dp-notes k-small k-muted">
          <span>{settings ? (settings.uiPalette ? "UI palette: background slot 8 of the project's defaults" : settings.colorMode === "mono" ? "Monochrome project: the greens" : "No UI palette found: the greens") : "…"}{hasFrame ? "" : " · no assets/ui/frame.png, so a plain box"}</span>
          <span>Approximate: up to 4 lines; GB Studio's event options change the real box.</span>
        </div>
      }>
      <div className="k-stack">
        <div className="dp-tools">
          <Field label="Font"><Select label="Font" value={font} onChange={setFont} placeholder="No font" options={(settings?.fonts ?? []).map((item) => ({ value: item.file, label: item.name }))} /></Field>
          <Field label="Background"><Select label="Background" value={background || NONE} onChange={(value) => setBackground(value === NONE ? "" : value)}
            options={[{ value: NONE, label: "No background" }, ...backgrounds.map((item) => ({ value: item.file, label: item.name }))]} /></Field>
        </div>
        <div className="k-well dp-stage"><canvas ref={canvas} style={{ width: 480, height: 432 }} /></div>
        <Field label="Text"><textarea className="k-input dp-text" value={text} rows={4} spellCheck={false} onChange={(event) => setText(event.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
