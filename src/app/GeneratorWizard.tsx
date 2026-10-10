/**
 * The map generators (2026-10-10): a cave or dungeon, and an RPG-style overworld. Sliders on the left, the map on
 * the right, redrawn as they move, with the screen edges marked. Placeholder art (wireframe primitives in the four
 * shades, src/app/generators.ts) to paint over: opened as a new picture, or made a project background.
 */
import { Dices, Mountain, Pickaxe } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { countUniqueTiles, toRgba } from "../paint";
import { Button, Chip, Dialog, IconButton, Segmented, Slider, Switch } from "../ui/kit";
import { CAVE_DEFAULTS, WORLD_DEFAULTS, drawCave, drawWorld, type CaveSettings, type Generated, type WorldSettings } from "./generators";
import "./GeneratorWizard.css";

export type GeneratorMode = "cave" | "world";

interface Props {
  mode: GeneratorMode;
  /** The open project's name (null: only Open as picture). */
  projectName: string | null;
  /** The scene's unique-tile limit, for the tile chip. */
  limit: number;
  onClose: () => void;
  onOpen: (picture: Generated, name: string) => void;
  onSave: (picture: Generated, name: string) => Promise<boolean>;
}

const newSeed = () => Math.floor(Math.random() * 1_000_000);

/** A labelled slider with its value. */
function Setting({ label, value, unit = "", min, max, step, onChange, title }: { label: string; value: number; unit?: string; min: number; max: number; step?: number; onChange: (value: number) => void; title?: string }) {
  return (
    <div className="gw-setting" title={title}>
      <span className="gw-setting-head"><span className="k-label">{label}</span><span className="k-mono k-small">{value}{unit}</span></span>
      <Slider label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
    </div>
  );
}

export function GeneratorWizard({ mode, projectName, limit, onClose, onOpen, onSave }: Props) {
  const [cave, setCave] = useState<CaveSettings>(() => ({ ...CAVE_DEFAULTS, seed: newSeed() }));
  const [world, setWorld] = useState<WorldSettings>(() => ({ ...WORLD_DEFAULTS, seed: newSeed() }));
  const [name, setName] = useState(mode === "cave" ? "Cave" : "Overworld");
  const [busy, setBusy] = useState(false);
  const setC = (change: Partial<CaveSettings>) => setCave((old) => ({ ...old, ...change }));
  const setW = (change: Partial<WorldSettings>) => setWorld((old) => ({ ...old, ...change }));
  const columns = mode === "cave" ? cave.columns : world.columns, rows = mode === "cave" ? cave.rows : world.rows;

  const picture = useMemo(() => mode === "cave" ? drawCave(cave) : drawWorld(world), [mode, cave, world]);
  const tiles = useMemo(() => countUniqueTiles(picture.pixels, picture.width, picture.height, false), [picture]);

  // A state ref: the dialog mounts its content after this component's first effects, so redraw when the canvas arrives.
  const [target, setTarget] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!target) return;
    Object.assign(target, { width: picture.width, height: picture.height });
    const cells = new Uint8Array(Math.ceil(picture.width / 8) * Math.ceil(picture.height / 8));
    target.getContext("2d")!.putImageData(new ImageData(toRgba(picture.pixels, cells, picture.width, []), picture.width, picture.height), 0, 0);
  }, [picture, target]);

  const valid = /^[\w ()\-.]+$/.test(name.trim());
  async function save() {
    setBusy(true);
    const done = await onSave(picture, name.trim());
    setBusy(false);
    if (done) onClose();
  }

  const reroll = <IconButton label="New layout (another seed)" onClick={() => mode === "cave" ? setC({ seed: newSeed() }) : setW({ seed: newSeed() })}><Dices /></IconButton>;
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }} wide tall
      title={mode === "cave" ? "Cave or dungeon" : "Overworld"} icon={mode === "cave" ? <Pickaxe size={18} /> : <Mountain size={18} />}
      sub={mode === "cave" ? "A cave or dungeon in placeholder art, sized in screens" : "An RPG-style overworld in placeholder art: water, forest, mountains, castles"}
      footer={<>
        <span className="k-label">Name</span><input className="k-input gw-name" aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <span className="k-spacer" />
        <Button onClick={() => { onOpen(picture, name.trim() || "Map"); onClose(); }} disabled={busy}>Open as picture</Button>
        <Button variant="primary" disabled={!projectName || !valid || busy} title={!projectName ? "Open a GB Studio project first" : valid ? `Makes assets/backgrounds/${name.trim()}.png (never replaces a file)` : "Give it a name (letters, digits, spaces, - _ ( ) .)"} onClick={() => void save()}>{busy ? "Making…" : "Make background"}</Button>
      </>}>
      <div className="gw">
        <div className="gw-controls k-stack">
          {mode === "cave" && <Segmented fill size="sm" label="Style" value={cave.style} onChange={(style) => { setC({ style }); if (name === "Cave" || name === "Dungeon") setName(style === "cave" ? "Cave" : "Dungeon"); }} options={[{ value: "cave", label: "Cave" }, { value: "dungeon", label: "Dungeon" }]} />}
          <Setting label="Screens wide" value={columns} min={1} max={mode === "cave" ? 4 : 6} onChange={(value) => mode === "cave" ? setC({ columns: value }) : setW({ columns: value })} />
          <Setting label="Screens tall" value={rows} min={1} max={mode === "cave" ? 4 : 6} onChange={(value) => mode === "cave" ? setC({ rows: value }) : setW({ rows: value })} />
          {mode === "cave" && <>
            <div className="k-stack k-stack--tight">
              <span className="k-label">Cells</span>
              <Segmented fill size="sm" label="Cell size" value={String(cave.cell)} onChange={(cell) => setC({ cell: Number(cell) as 8 | 16 })} options={[{ value: "16", label: "16 px", title: "2 × 2 tiles a cell: broad passages" }, { value: "8", label: "8 px", title: "One tile a cell: twisty passages" }]} />
            </div>
            {cave.style === "cave" ? <>
              <Setting label="Rock" value={cave.fill} unit="%" min={30} max={62} onChange={(fill) => setC({ fill })} title="How much starts as rock: more is tighter" />
              <Setting label="Smoothing" value={cave.smooth} min={0} max={8} onChange={(smooth) => setC({ smooth })} title="Passes that round the walls off" />
              <Switch checked={cave.connected} onChange={(connected) => setC({ connected })}>One connected cave</Switch>
            </> : <>
              <Setting label="Rooms" value={cave.rooms} min={2} max={20} onChange={(rooms) => setC({ rooms })} />
              <Setting label="Room size" value={cave.roomSize} min={3} max={10} onChange={(roomSize) => setC({ roomSize })} title="Typical room size, in cells" />
            </>}
            <Switch checked={cave.stairs} onChange={(stairs) => setC({ stairs })}>Stairs at the far ends</Switch>
          </>}
          {mode === "world" && <>
            <Setting label="Water" value={world.water} unit="%" min={0} max={80} onChange={(water) => setW({ water })} />
            <Setting label="Mountains" value={world.mountains} unit="%" min={0} max={60} onChange={(mountains) => setW({ mountains })} title="Share of the land" />
            <Setting label="Forest" value={world.forest} unit="%" min={0} max={80} onChange={(forest) => setW({ forest })} title="Share of the lowland" />
            <Setting label="Castles" value={world.castles} min={0} max={8} onChange={(castles) => setW({ castles })} />
            <Setting label="Feature size" value={world.scale} min={2} max={12} onChange={(scale) => setW({ scale })} title="Bigger: broader land and seas" />
            <Switch checked={world.island} onChange={(island) => setW({ island })}>Island (water all round)</Switch>
            <Switch checked={world.roads} onChange={(roads) => setW({ roads })}>Roads between castles</Switch>
          </>}
          <span className="k-row"><span className="k-label">Layout</span><span className="k-mono k-small k-muted">#{mode === "cave" ? cave.seed : world.seed}</span><span className="k-spacer" />{reroll}</span>
        </div>
        <div className="gw-stage">
          <div className="gw-map" style={{ aspectRatio: `${picture.width} / ${picture.height}`, ["--gw-cols" as string]: columns, ["--gw-rows" as string]: rows }}>
            <canvas ref={setTarget} aria-label="Generated map" />
            <span className="gw-screens" aria-hidden />
          </div>
          <span className="k-row">
            <Chip>{picture.width} × {picture.height} px</Chip>
            <Chip>{columns} × {rows} screens</Chip>
            <Chip tone={tiles > limit ? "warn" : undefined} title="Unique 8 × 8 tiles; GB Studio's limit for one background">{tiles} / {limit} tiles</Chip>
            <span className="k-muted k-xs">Placeholder art: paint over it. Red lines are screen edges.</span>
          </span>
        </div>
      </div>
    </Dialog>
  );
}
