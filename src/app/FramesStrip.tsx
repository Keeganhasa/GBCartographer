/**
 * The frames strip above a sprite sheet: its animations (GB Studio's sidecar), each frame drawn small, play at
 * GB Studio's speed, and the animation tried on one of the project's backgrounds.
 */
import { Pause, Play } from "lucide-react";
import type { RefObject } from "react";
import type { SpriteAnimation } from "./model";
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
}

export function FramesStrip({ animations, frame, onFrame, playing, onPlaying, animSpeed, fps, canvases, onBackground }: Props) {
  const animation = animations[Math.min(frame.animation, Math.max(0, animations.length - 1))];
  const frames = animation?.frames ?? [];
  const speed = animSpeed == null ? "Play the animation (8 frames a second)" : animSpeed === 255 ? "Play the frames (GB Studio's speed is None: it doesn't animate this sheet; 8 a second here)" : `Play the animation at GB Studio's speed ${[127, 63, 31, 15, 7, 3, 1, 0].indexOf(animSpeed) + 1 || "?"} (${Math.round(fps * 100) / 100} frames a second)`;
  return (
    <div className="k-card app-strip" role="group" aria-label="Frames">
      <IconButton label={playing ? "Pause" : speed} aria-label={playing ? "Pause" : "Play"} disabled={frames.length < 2} onClick={() => onPlaying(!playing)}>{playing ? <Pause /> : <Play />}</IconButton>
      {animations.length > 1 && <Select label="Animation" value={String(frame.animation)} onChange={(value) => onFrame({ animation: Number(value), index: 0 })} options={animations.map((item, index) => ({ value: String(index), label: `${item.name} · ${item.frames.length}` }))} />}
      <div className="app-frames">
        {frames.map((_, index) => (
          <button key={index} className="app-frame" aria-pressed={index === frame.index} title={`Frame ${index + 1}`} onClick={() => { onFrame({ ...frame, index }); onPlaying(false); }}>
            <canvas ref={(element) => { canvases.current[index] = element; }} />
            <small>{index + 1}</small>
          </button>
        ))}
      </div>
      <span className="app-strip-label">{animations.length > 1 ? animation.name : "Frame"} {frame.index + 1} of {frames.length}</span>
      {onBackground && <Button size="sm" title="See this animation on one of the project's backgrounds, to check contrast and palette clashes" onClick={onBackground}>On a background…</Button>}
    </div>
  );
}
