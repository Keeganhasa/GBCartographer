/**
 * The frames strip above a sprite sheet: its animations (GB Studio's sidecar), each frame drawn small, play at
 * GB Studio's speed, and the animation tried on one of the project's backgrounds.
 */
import { Pause, Play } from "lucide-react";
import type { RefObject } from "react";
import type { SpriteAnimation } from "./model";

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
    <div className="gbp-frames" role="group" aria-label="Frames">
      {animations.length > 1 && (
        <select aria-label="Animation" value={frame.animation} onChange={(event) => onFrame({ animation: Number(event.target.value), index: 0 })}>
          {animations.map((item, index) => <option key={index} value={index}>{item.name} · {item.frames.length}</option>)}
        </select>
      )}
      <button className="icon-button small" aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : speed} disabled={frames.length < 2} onClick={() => onPlaying(!playing)}>{playing ? <Pause size={12} /> : <Play size={12} />}</button>
      <div className="gbp-frames-list">
        {frames.map((_, index) => (
          <button key={index} className={`gbp-frame ${index === frame.index ? "selected" : ""}`} title={`Frame ${index + 1}`} onClick={() => { onFrame({ ...frame, index }); onPlaying(false); }}>
            <canvas ref={(element) => { canvases.current[index] = element; }} />
            <small>{index + 1}</small>
          </button>
        ))}
      </div>
      <span className="gbp-frames-label">{animations.length > 1 ? animation.name : "frame"} {frame.index + 1} of {frames.length}</span>
      {onBackground && <button className="quiet-button" title="See this animation on one of the project's backgrounds, to check contrast and palette clashes" onClick={onBackground}>On a background…</button>}
    </div>
  );
}
