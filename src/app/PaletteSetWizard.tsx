/**
 * A palette set (wizard W3): eight GB Studio palettes at once from a Lospec palette, the open picture or the
 * bundled library, each four colors lightest first. Three steps like the approved mockup: Source (where the colors
 * come from), Group (swap colors between palettes, re-sort one, see which have shades too close to tell apart) and
 * Name (a base name, "<base>-1" … "<base>-8", each optionally renamed). The parent writes them: into the project
 * (optionally into slots 1–8 of a scene or the defaults) or into "Mine".
 */
import { ArrowDownWideNarrow, ArrowLeft, ArrowRight, Check, ImageUp, Palette as PaletteIcon, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { fetchLospecColors } from "../PaletteManager";
import library from "../palettes/library.json";
import { closeShades, fitPalettes } from "../paint";
import { Button, Checkbox, Chip, Dialog, Field, IconButton, Segmented, Select } from "../ui/kit";
import { baseFromFile, baseFromLink, flattenColors, groupColors, librarySets, lightestFirst, paletteNames, swapColors } from "./paletteSet";
import "./PaletteSetWizard.css";

export interface PaletteSetWizardProps {
  /** The project's name (null: no project, then only "Add to Mine" is offered). */
  projectName: string | null;
  /** Where "Put in slots" puts them, in words (e.g. "the project's default palettes"); null hides that option. */
  slotsWhere: string | null;
  /** The open picture as RGBA, to make a set from (null when nothing is open). */
  picture: { rgba: Uint8ClampedArray; width: number; height: number; name: string } | null;
  onClose: () => void;
  /** Adds the palettes to the project; with putInSlots also into slots 1…n of slotsWhere. Resolves to how many were written. */
  onAddToProject: (palettes: { name: string; colors: string[] }[], putInSlots: boolean) => Promise<number>;
  /** Adds them to "Mine" (the user's own palettes in this browser). */
  onAddToMine: (palettes: { name: string; colors: string[] }[]) => void;
}

type SourceKind = "lospec" | "picture" | "library";
/** What a source gives: the palettes, a base name, and (library only) each palette's own name. */
interface Made { palettes: string[][]; base: string; names: string[] }

const STEPS = ["Source", "Group", "Name"];
const SETS = librarySets(library.collections);

type Picture = { rgba: Uint8ClampedArray; width: number; height: number; name: string };

/** A picture file as RGBA, big photos scaled down to 640 pixels on their longer side (plenty to find eight palettes in). */
async function readPicture(file: File): Promise<Picture> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  Object.assign(canvas, { width, height });
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = scale < 1;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { rgba: context.getImageData(0, 0, width, height).data, width, height, name: file.name };
}

/** The picture the set comes from, small. */
function Thumb({ picture }: { picture: Picture }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!canvas) return;
    Object.assign(canvas, { width: picture.width, height: picture.height });
    canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(picture.rgba), picture.width, picture.height), 0, 0);
  }, [picture, canvas]);
  return <canvas ref={setCanvas} className="psw-thumb" aria-label={picture.name} />;
}

const Strip = ({ colors }: { colors: readonly string[] }) => <div className="psw-strip">{colors.map((color, at) => <i key={at} style={{ background: color }} title={color} />)}</div>;
const Mini = ({ palettes }: { palettes: string[][] }) => <div className="psw-mini">{palettes.map((colors, index) => <span key={index} title={`Palette ${index + 1}: ${colors.join(" ")}`}>{colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>)}</div>;

export function PaletteSetWizard({ projectName, slotsWhere, picture, onClose, onAddToProject, onAddToMine }: PaletteSetWizardProps): JSX.Element {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<SourceKind>("lospec");
  const [link, setLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const [lospec, setLospec] = useState<{ colors: string[]; base: string } | null>(null);
  const [setId, setSetId] = useState(SETS[0]?.id ?? "");
  // The working set, loaded from the source on Next and edited in the Group and Name steps.
  const [palettes, setPalettes] = useState<string[][]>([]);
  const [base, setBase] = useState("");
  const [own, setOwn] = useState<string[]>([]);
  const [picked, setPicked] = useState<[number, number] | null>(null);
  const [slots, setSlots] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // What was added, so each button is pressed once per version of the set (an edit clears it).
  const [done, setDone] = useState<{ project?: string; mine?: string }>({});
  const [loadedFrom, setLoadedFrom] = useState<Made | null>(null);
  // A picture chosen here instead of the open one.
  const [chosen, setChosen] = useState<Picture | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const source = chosen ?? picture;
  async function choose(file: File | undefined) {
    if (!file) return;
    try { setChosen(await readPicture(file)); setError(""); } catch { setError(`${file.name} could not be read as a picture.`); }
  }

  // Each source's set, worked out only while it is the chosen one (fitting a picture takes a moment).
  const grouped = useMemo<Made | null>(() => lospec ? { palettes: groupColors(lospec.colors), base: lospec.base, names: [] } : null, [lospec]);
  const fitted = useMemo<Made | null>(() => kind === "picture" && source ? { palettes: fitPalettes(source.rgba, source.width, source.height, 8).palettes, base: baseFromFile(source.name), names: [] } : null, [kind, source]);
  const chosenSet = SETS.find((set) => set.id === setId);
  const fromLibrary = useMemo<Made | null>(() => chosenSet ? { palettes: chosenSet.palettes.map((palette) => palette.colors), base: chosenSet.base, names: chosenSet.palettes.map((palette) => palette.name) } : null, [chosenSet]);
  const made = kind === "lospec" ? grouped : kind === "picture" ? fitted : fromLibrary;

  const names = paletteNames(base, palettes.length, own);
  // Every palette needs a name: from the base, or its own when the base is empty.
  const named = palettes.length > 0 && (base.trim() !== "" || own.slice(0, palettes.length).filter((name) => name?.trim()).length === palettes.length);
  const result = () => palettes.map((colors, index) => ({ name: names[index], colors }));

  const load = (from: Made) => { setLoadedFrom(from); setPalettes(from.palettes.map((colors) => [...colors])); setBase(from.base); setOwn(from.names); setPicked(null); setDone({}); };
  const edit = (next: string[][]) => { setPalettes(next); setDone({}); };

  const fetchLink = async () => {
    setFetching(true);
    setError("");
    try {
      // Every color (grouping four at a time would drop the last ones of a palette that isn't a multiple of four).
      const colors = flattenColors([await fetchLospecColors(link)]);
      if (colors.length < 2) throw new Error("That Lospec palette has too few colors.");
      setLospec({ colors, base: baseFromLink(link) || "lospec" });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setFetching(false);
    }
  };

  const next = () => {
    // Going on from Source loads its set, unless it is the one already loaded (edits survive Back and Next).
    if (step === 0 && made && loadedFrom !== made) load(made);
    setError("");
    setStep(Math.min(2, step + 1));
  };

  const pick = (palette: number, color: number) => {
    if (!picked) return setPicked([palette, color]);
    if (picked[0] !== palette || picked[1] !== color) edit(swapColors(palettes, picked, [palette, color]));
    setPicked(null);
  };

  const addToProject = async () => {
    setBusy(true);
    setError("");
    try {
      const written = await onAddToProject(result(), Boolean(slotsWhere) && slots);
      setDone((was) => ({ ...was, project: `Added ${written} palette${written === 1 ? "" : "s"} to ${projectName}` }));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };
  const addToMine = () => { onAddToMine(result()); setDone((was) => ({ ...was, mine: `Added ${palettes.length} to Mine` })); };

  const sources = [{ value: "lospec" as const, label: "Lospec link" }, { value: "picture" as const, label: "A picture" }, { value: "library" as const, label: "Library" }];
  const last = palettes.length;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} wide title="A palette set" sub="Eight GB Studio palettes from a Lospec palette, a picture or the library" icon={<PaletteIcon size={18} />}
      footer={<>
        {step === 2 && projectName && slotsWhere && !done.project
          ? <Checkbox checked={slots} onChange={setSlots}>Put them in slots 1–{Math.min(8, last)} of {slotsWhere}</Checkbox>
          : <span className="k-muted k-small">Step {step + 1} of {STEPS.length}</span>}
        <span className="k-spacer" />
        {error && step > 0 && <p className="psw-error" role="alert">{error}</p>}
        {step === 2 && (done.project || done.mine) && <Chip tone="acc"><Check size={12} strokeWidth={3} />{[done.project, done.mine].filter(Boolean).join(" · ")}</Chip>}
        <Button icon={<ArrowLeft />} disabled={step === 0 || busy} onClick={() => { setPicked(null); setStep(step - 1); }}>Back</Button>
        {step < 2 ? <Button variant="primary" disabled={step === 0 ? !made?.palettes.length : !palettes.length} onClick={next}>Next<ArrowRight /></Button>
          : <>
            <Button variant={projectName ? undefined : "primary"} disabled={!named || busy || Boolean(done.mine)} title="Your own palettes, kept in this browser" onClick={addToMine}>Add to Mine</Button>
            {projectName && !done.project && <Button variant="primary" disabled={!named || busy} title={`New palette files in ${projectName}`} onClick={() => void addToProject()}>{busy ? "Adding…" : `Add to ${projectName}`}</Button>}
            {(done.project || (!projectName && done.mine)) && <Button variant="primary" onClick={onClose}>Close</Button>}
          </>}
      </>}>
      <div className="psw-steps">{STEPS.map((name, index) => <span key={name} className={`psw-step${index < step ? " is-done" : index === step ? " is-now" : ""}`}><b>{index < step ? <Check size={10} strokeWidth={3} /> : index + 1}</b>{name}</span>)}</div>

      {step === 0 && (
        <div className="psw-two">
          <div className="k-stack">
            <Segmented fill size="sm" label="Source" value={kind} onChange={(value) => { setKind(value); setError(""); }} options={sources} />
            {kind === "lospec" && <>
              <form className="k-row" onSubmit={(event) => { event.preventDefault(); if (link.trim() && !fetching) void fetchLink(); }}>
                <input className="k-input" aria-label="Lospec link" placeholder="lospec.com/palette-list/…" value={link} onChange={(event) => setLink(event.target.value)} />
                <Button type="submit" disabled={!link.trim() || fetching}>{fetching ? "Fetching…" : "Fetch"}</Button>
              </form>
              {error && <p className="psw-error" role="alert">{error}</p>}
              {lospec ? <><Strip colors={lospec.colors} /><span className="k-muted k-xs">{lospec.colors.length} colors from Lospec</span></>
                : <span className="k-muted k-xs">A palette's link or name on lospec.com, such as sweetie-16.</span>}
            </>}
            {kind === "picture" && <div className={`psw-drop${dragging ? " is-over" : ""}`}
              onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDragging(true); }} onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setDragging(false); void choose(event.dataTransfer.files[0]); }}>
              {source && <Thumb picture={source} />}
              <span className="k-muted k-small">{source ? <>{chosen ? "The chosen picture" : "The open picture"}, <b>{source.name}</b>: up to eight palettes that cover its colors, four a tile.</> : "Choose a picture, or drop one here: up to eight palettes that cover its colors, four a tile."}</span>
              <span className="k-row">
                <Button size="sm" icon={<ImageUp />} onClick={() => fileInput.current?.click()}>{source ? "Another picture…" : "Choose a picture…"}</Button>
                {chosen && picture && <Button size="sm" variant="ghost" onClick={() => setChosen(null)}>Use the open picture</Button>}
              </span>
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
              {error && <p className="psw-error" role="alert">{error}</p>}
            </div>}
            {kind === "library" && <>
              <Select label="Library set" value={setId} onChange={setSetId} options={SETS.map((set) => ({ value: set.id, label: set.label }))} />
              <span className="k-muted k-xs">The bundled palettes: Game Boy screens, the author's Chorbi and Overworld sets (CC0) and SpicyGame's (public domain).</span>
            </>}
          </div>
          <div className="k-stack k-stack--tight">
            {made?.palettes.length ? <>
              <span className="k-eyebrow">{kind === "lospec" ? `Grouped into ${made.palettes.length} palettes, lightest first` : `${made.palettes.length} palette${made.palettes.length === 1 ? "" : "s"}, lightest first`}</span>
              <Mini palettes={made.palettes} />
            </> : <div className="k-well psw-empty k-muted k-small">{kind === "lospec" ? "Fetch a Lospec palette to see it grouped." : "Nothing to make a set from yet."}</div>}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="k-stack">
          <div className="k-row">
            <span className="k-eyebrow">{last} palette{last === 1 ? "" : "s"}, lightest first</span>
            <span className="k-spacer" />
            <span className="k-muted k-xs">{picked ? "Now click the color to swap it with." : "Click a color, then another, to swap them."}</span>
            <Button size="sm" variant="ghost" icon={<RotateCcw />} disabled={!loadedFrom} title="Back to the palettes as the source gave them" onClick={() => loadedFrom && load(loadedFrom)}>Start over</Button>
          </div>
          <div className="psw-grid">
            {palettes.map((colors, index) => {
              const close = closeShades(colors);
              const sorted = lightestFirst(colors).join() === colors.join();
              return (
                <div key={index} className="k-card psw-row">
                  <span className="psw-num">{index + 1}</span>
                  <div className="psw-swatches" role="group" aria-label={`Palette ${index + 1}`}>
                    {colors.map((color, at) => <button key={at} type="button" className="psw-swatch" style={{ background: color }} aria-pressed={picked?.[0] === index && picked[1] === at} aria-label={`Color ${at + 1}: ${color}`} title={`Color ${at + 1}: ${color}`} onClick={() => pick(index, at)} />)}
                  </div>
                  {close.length > 0 && <Chip tone="warn" title={close.map(({ a, b }) => `Colors ${a + 1} and ${b + 1} are hard to tell apart`).join("; ")}><TriangleAlert size={11} />close</Chip>}
                  <IconButton size="sm" variant="ghost" label={sorted ? "Already lightest first" : "Sort lightest first"} disabled={sorted} onClick={() => edit(palettes.map((each, at) => at === index ? lightestFirst(each) : each))}><ArrowDownWideNarrow /></IconButton>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="k-stack">
          <div className="psw-base">
            <Field label="Base name" hint={`Palettes are named ${base.trim() || "<base>"}-1 … ${base.trim() || "<base>"}-${last}, unless you name one below`}>
              <input className="k-input" value={base} onChange={(event) => { setBase(event.target.value); setDone({}); }} />
            </Field>
          </div>
          <div className="psw-names">
            {palettes.map((colors, index) => (
              <label key={index} className="psw-name">
                <Strip colors={colors} />
                <input className="k-input" aria-label={`Palette ${index + 1} name`} placeholder={`${base.trim() || "name"}-${index + 1}`} value={own[index] ?? ""} onChange={(event) => { const nextOwn = [...own]; nextOwn[index] = event.target.value; setOwn(nextOwn); setDone({}); }} />
              </label>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
