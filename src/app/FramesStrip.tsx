/**
 * The frames strip above a sprite sheet: the animation playing big on a plain grey backdrop (the author, 2026-10-10:
 * on a background it was far too small; the background is for the "Bigger…" window), its animations (from GB
 * Studio's sprite file, read only here), each frame drawn small, play at GB Studio's speed, and the bigger
 * "On a background…" window to drag the sprite around.
 */
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import type { Asset, SpriteAnimation } from "./model";
import { Button, IconButton, Select } from "../ui/kit";

interface Props {
  animations: SpriteAnimation[];
  /** Which animation and frame is current. */
  frame: { animation: number; index: number }; onFrame: (frame: { animation: number; index: number }) => void;
  playing: boolean; onPlaying: (playing: boolean) => void;
  /** GB Studio's animSpeed for the sheet (255: none), and the frames a second it plays at here. */
  animSpeed: number | null | undefined; fps: number;
  /** Where the parent draws each frame. */
  canvases: RefObject<(HTMLCanvasElement | null)[]>;
  /** Opens the animation on a background; absent when the project has none. */
  onBackground?: () => void;
  /** The project's backgrounds (the "Bigger…" window plays the animation on one). */
  backgrounds: Asset[];
}

/** The backdrop box in CSS pixels; the frame scales to fit it (whole multiples when it can). */
const BOX = 216;

export function FramesStrip({ animations, frame, onFrame, playing, onPlaying, animSpeed, fps, canvases, onBackground }: Props) {
  const preview = useRef<HTMLCanvasElement>(null);
  // The current frame, as big as the box allows (after the frame thumbnails are drawn).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const target = preview.current, source = canvases.current[frame.index];
      if (!target || !source?.width) return;
      if (target.width !== source.width || target.height !== source.height) Object.assign(target, { width: source.width, height: source.height });
      const scale = Math.max(1, Math.floor(BOX / Math.max(source.width, source.height)));
      Object.assign(target.style, { width: `${source.width * scale}px`, height: `${source.height * scale}px` });
      const context = target.getContext("2d")!;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, target.width, target.height);
      context.drawImage(source, 0, 0);
    });
    return () => cancelAnimationFrame(id);
  });
  const animation = animations[Math.min(frame.animation, Math.max(0, animations.length - 1))];
  const frames = animation?.frames ?? [];
  const speed = animSpeed == null ? "Play the animation (8 frames a second)" : animSpeed === 255 ? "Play the frames (GB Studio's speed is None: it doesn't animate this sheet; 8 a second here)" : `Play the animation at GB Studio's speed ${[127, 63, 31, 15, 7, 3, 1, 0].indexOf(animSpeed) + 1 || "?"} (${Math.round(fps * 100) / 100} frames a second)`;
  return (
    <div className="k-card app-strip" role="group" aria-label="Frames">
      <div className="app-anim-scene" style={{ width: BOX, height: BOX }} title="The animation"><canvas ref={preview} width={16} height={16} /></div>
      <div className="k-stack k-stack--tight">
      <div className="k-row">
      <IconButton label={playing ? "Pause" : speed} aria-label={playing ? "Pause" : "Play"} disabled={frames.length < 2} onClick={() => onPlaying(!playing)}>{playing ? <Pause /> : <Play />}</IconButton>
      {animations.length > 1 && <Select label="Animation" value={String(frame.animation)} onChange={(value) => onFrame({ animation: Number(value), index: 0 })} options={animations.map((item, index) => ({ value: String(index), label: `${item.name} · ${item.frames.length}` }))} />}
      </div>
      <div className="app-frames">
        {frames.map((_, index) => (
          <button key={index} className="app-frame" aria-pressed={index === frame.index} title={`Frame ${index + 1}`} onClick={() => { onFrame({ ...frame, index }); onPlaying(false); }}>
            <canvas ref={(element) => { canvases.current[index] = element; }} />
            <small>{index + 1}</small>
          </button>
        ))}
      </div>
      <span className="app-strip-label">{animations.length > 1 ? animation.name : "Frame"} {frame.index + 1} of {frames.length}</span>
      <div className="k-row">
        <span className="k-muted k-xs">Frames come from GB Studio's sprite editor.</span>
        {onBackground && <Button size="sm" title="A bigger view where you can drag the sprite and check its contrast" onClick={onBackground}>Bigger…</Button>}
      </div>
      </div>
    </div>
  );
}
