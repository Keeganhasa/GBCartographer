/**
 * Try a sprite on a background: one of the project's backgrounds, drawn in its scene's palettes, with the open
 * sprite sheet's frame on top (as shown in the painter). Drag the sprite around (Shift snaps to 8 px); the edge
 * contrast says how much of its outline is hard to see against the spot it stands on.
 * The window is a kit Dialog: background, play and zoom on top, the readout in the foot.
 */
import { Image as ImageIcon, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LOW_CONTRAST, colorDistance } from "../paint";
import { Dialog, IconButton, Segmented, Select } from "../ui/kit";
import type { Asset } from "./model";
import "./SpriteOnBackground.css";

interface Props {
  backgrounds: Asset[];
  /** The animation's frames, each drawn as shown (palettes and screen look), all the same size. */
  frames: HTMLCanvasElement[];
  fps: number;
  onClose: () => void;
}

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;

/** The share of the sprite's outline (opaque pixels next to see-through ones) that is hard to tell from the background. */
function edgeContrast(sprite: ImageData, background: ImageData, x: number, y: number): { edge: number; low: number; weakest: number } {
  let edge = 0, low = 0, weakest = Infinity;
  const { width, height, data } = sprite;
  const opaque = (px: number, py: number) => px >= 0 && py >= 0 && px < width && py < height && data[(py * width + px) * 4 + 3] >= 128;
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      if (!opaque(px, py)) continue;
      for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
        if (opaque(nx, ny)) continue;
        const bx = x + nx, by = y + ny;
        if (bx < 0 || by < 0 || bx >= background.width || by >= background.height) continue;
        const s = (py * width + px) * 4, b = (by * background.width + bx) * 4;
        edge += 1;
        const delta = colorDistance(hex(data[s], data[s + 1], data[s + 2]), hex(background.data[b], background.data[b + 1], background.data[b + 2]));
        weakest = Math.min(weakest, delta);
        if (delta < LOW_CONTRAST) low += 1;
      }
    }
  }
  return { edge, low, weakest };
}

export function SpriteOnBackground({ backgrounds, frames, fps, onClose }: Props) {
  const [picked, setPicked] = useState(backgrounds[0]?.file ?? "");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [position, setPosition] = useState({ x: 72, y: 64 });
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(frames.length > 1);
  const [zoom, setZoom] = useState(3);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const background = backgrounds.find((item) => item.file === picked);
  const width = frames[0]?.width ?? 16, height = frames[0]?.height ?? 16;

  useEffect(() => {
    if (!background) return;
    let live = true;
    const next = new Image();
    next.onload = () => { if (live) setImage(next); };
    next.src = `./__cartographer/gbstudio-asset-preview?${new URLSearchParams({ kind: "backgrounds", file: background.file })}&v=${Math.round(background.mtime)}&pv=2`;
    return () => { live = false; };
  }, [background]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = window.setInterval(() => setFrame((at) => (at + 1) % frames.length), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [playing, frames.length, fps]);

  // Draw the background and the frame; work out the edge contrast where the sprite stands.
  const [contrast, setContrast] = useState<{ edge: number; low: number; weakest: number } | null>(null);
  useEffect(() => {
    const target = canvas.current, sprite = frames[frame % Math.max(1, frames.length)];
    if (!target || !image || !sprite) return;
    Object.assign(target, { width: image.naturalWidth, height: image.naturalHeight });
    const context = target.getContext("2d", { willReadFrequently: true })!;
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0);
    const under = context.getImageData(0, 0, target.width, target.height);
    context.drawImage(sprite, position.x, position.y);
    setContrast(edgeContrast(sprite.getContext("2d")!.getImageData(0, 0, sprite.width, sprite.height), under, position.x, position.y));
  }, [image, frame, frames, position]);

  const point = (event: React.PointerEvent) => {
    const box = canvas.current!.getBoundingClientRect();
    return { x: Math.floor((event.clientX - box.left) / zoom), y: Math.floor((event.clientY - box.top) / zoom) };
  };
  const share = contrast && contrast.edge ? Math.round((contrast.low / contrast.edge) * 100) : 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} wide icon={<ImageIcon size={18} />} title="On a background" sub="The sprite's animation over one of the project's backgrounds"
      headExtra={<>
        {backgrounds.length > 0 && <span className="sob-pick"><Select label="Background" value={picked} onChange={setPicked} options={backgrounds.map((item) => ({ value: item.file, label: item.name }))} /></span>}
        {frames.length > 1 && <IconButton size="sm" label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)}>{playing ? <Pause /> : <Play />}</IconButton>}
        <Segmented size="sm" label="Zoom" value={String(zoom) as "2" | "3" | "4"} onChange={(value) => setZoom(Number(value))} options={[2, 3, 4].map((step) => ({ value: String(step) as "2" | "3" | "4", label: `${step}×` }))} />
      </>}
      footer={<>
        <span className="k-muted k-small">Drag the sprite (Shift snaps to 8 px) · at {position.x}, {position.y} · tile {Math.floor(position.x / 8)}, {Math.floor(position.y / 8)}</span>
        <span className="k-spacer" />
        {contrast && <span className={`k-small sob-readout ${share > 25 ? "sob-warn" : "k-muted"}`} title="Outline pixels whose color is within 12 (CIE ΔE) of the background right next to them">{contrast.edge ? `${share ? `${share}% of the outline is hard to see here` : "The whole outline clears the bar here"} · weakest contrast ${Math.round(contrast.weakest * 10) / 10} (aim for 12 or more)` : "Off the background"}</span>}
      </>}>
      <div className="k-well sob-stage">
        {!backgrounds.length ? <p className="k-muted sob-empty">This project has no backgrounds.</p> : (
          <canvas ref={canvas} style={image ? { width: image.naturalWidth * zoom, height: image.naturalHeight * zoom } : undefined}
            onPointerDown={(event) => { const at = point(event); if (at.x >= position.x && at.y >= position.y && at.x < position.x + width && at.y < position.y + height) { drag.current = { dx: at.x - position.x, dy: at.y - position.y }; event.currentTarget.setPointerCapture(event.pointerId); } }}
            onPointerMove={(event) => { if (!drag.current) return; const at = point(event); let x = at.x - drag.current.dx, y = at.y - drag.current.dy; if (event.shiftKey) { x = Math.round(x / 8) * 8; y = Math.round(y / 8) * 8; } setPosition({ x, y }); }}
            onPointerUp={() => { drag.current = null; }} />
        )}
      </div>
    </Dialog>
  );
}
