/**
 * The frames strip above a sprite sheet: the animation playing on one of the project's backgrounds (always shown,
 * the author's review note R16), its animations (from GB Studio's sprite file, read only here), each frame drawn
 * small, play at GB Studio's speed, and the bigger "On a background…" window to drag the sprite around.
 */
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ASSET_URL, PREVIEW_VERSION, type Asset, type SpriteAnimation } from "./model";
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
  /** The project's backgrounds, to play the animation on (none: on the checkerboard). */
  backgrounds: Asset[];
}

const SCENE_W = 160, SCENE_H = 144, SHOWN = 1.5;

export function FramesStrip({ animations, frame, onFrame, playing, onPlaying, animSpeed, fps, canvases, onBackground, backgrounds }: Props) {
  const [backgroundFile, setBackgroundFile] = useState(backgrounds[0]?.file ?? "");
  const [scene, setScene] = useState<HTMLImageElement | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const picked = backgrounds.find((item) => item.file === backgroundFile);
  useEffect(() => {
    if (!picked) return setScene(null);
    const image = new Image();
    image.onload = () => setScene(image);
    image.src = `${ASSET_URL}-preview?${new URLSearchParams({ kind: picked.kind, file: picked.file })}&v=${Math.round(picked.mtime)}&pv=${PREVIEW_VERSION}`;
  }, [picked]);
  // The current frame on the background's first screen, near the bottom middle (after the frame thumbnails are drawn).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const target = preview.current, source = canvases.current[frame.index];
      if (!target) return;
      const context = target.getContext("2d")!;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, SCENE_W, SCENE_H);
      if (scene) context.drawImage(scene, 0, 0, SCENE_W, SCENE_H, 0, 0, SCENE_W, SCENE_H);
      if (source?.width) context.drawImage(source, Math.round((SCENE_W - source.width) / 2), SCENE_H - 32 - source.height);
    });
    return () => cancelAnimationFrame(id);
  });
  const animation = animations[Math.min(frame.animation, Math.max(0, animations.length - 1))];
  const frames = animation?.frames ?? [];
  const speed = animSpeed == null ? "Play the animation (8 frames a second)" : animSpeed === 255 ? "Play the frames (GB Studio's speed is None: it doesn't animate this sheet; 8 a second here)" : `Play the animation at GB Studio's speed ${[127, 63, 31, 15, 7, 3, 1, 0].indexOf(animSpeed) + 1 || "?"} (${Math.round(fps * 100) / 100} frames a second)`;
  return (
    <div className="k-card app-strip" role="group" aria-label="Frames">
      <canvas ref={preview} width={SCENE_W} height={SCENE_H} className="app-anim-scene" style={{ width: SCENE_W * SHOWN, height: SCENE_H * SHOWN }} title={picked ? `The animation on ${picked.name}` : "The animation"} />
      <div className="k-stack k-stack--tight">
      <div className="k-row">
      <IconButton label={playing ? "Pause" : speed} aria-label={playing ? "Pause" : "Play"} disabled={frames.length < 2} onClick={() => onPlaying(!playing)}>{playing ? <Pause /> : <Play />}</IconButton>
      {animations.length > 1 && <Select label="Animation" value={String(frame.animation)} onChange={(value) => onFrame({ animation: Number(value), index: 0 })} options={animations.map((item, index) => ({ value: String(index), label: `${item.name} · ${item.frames.length}` }))} />}
      {backgrounds.length > 0 && <Select label="Background" value={backgroundFile} onChange={setBackgroundFile} options={backgrounds.map((item) => ({ value: item.file, label: `On ${item.name}` }))} />}
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
