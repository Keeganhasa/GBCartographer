/**
 * Day, sunset and night (W2, the author's pick 2026-10-10): time-of-day versions of a scene's slot palettes in one
 * go. Three steps: pick the palettes and times, look at the versions (with a strength and the open picture under
 * each time), then add them to the project. Versions are named "<base> D", "<base> S" and "<base> N", so with
 * Named slots on, tiles painted with one save in their base's slot and GB Studio events can swap them in.
 */
import { ArrowLeft, ArrowRight, Check, Moon, Sun, Sunset } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import { closeShades, hexRgb, paletteVariant, timeVariant, toRgba } from "../paint";
import { Button, Checkbox, Chip, Dialog, Field, Slider } from "../ui/kit";
import { PxCloudMoon } from "../ui/setIcons";
import "./DnsWizard.css";

type SlotPalette = { id: string; name: string; colors: string[] };

export interface DnsWizardProps {
  /** The scene's slot palettes (up to 8, in slot order; null for an empty slot) — the ones to make versions of. */
  slots: (SlotPalette | null)[];
  /** Where the slots come from, in words (e.g. "Winter scene's palettes" or "the project's default palettes"). */
  where: string;
  /** Names of every palette already in the project (to show which versions exist and avoid duplicates). */
  existing: string[];
  /** The open picture, to preview the scene under each time of day (null when no picture with slots is open). */
  picture: { pixels: Uint8Array; cells: Uint8Array; width: number; height: number; palettes: { name: string; colors: string[]; id?: string }[] } | null;
  onClose: () => void;
  /** Adds these palettes to the project; resolves to how many were written (the parent writes them, with backups). */
  onCreate: (palettes: { name: string; colors: string[] }[]) => Promise<number>;
}

type Time = "D" | "S" | "N";
const TIMES: { key: Time; name: string; icon: ReactNode; hint: string }[] = [
  { key: "D", name: "Day", icon: <Sun size={14} />, hint: "Cooler and lilac" },
  { key: "S", name: "Sunset", icon: <Sunset size={14} />, hint: "Warm and saturated" },
  { key: "N", name: "Night", icon: <Moon size={14} />, hint: "Dark and blue" },
];
const STEPS = ["Palettes", "Versions", "Create"];

interface Version { base: SlotPalette; time: Time; name: string; colors: string[]; exists: boolean; close: number }

// Project palettes may come with or without the "#"; the helpers want "#RRGGBB".
const hex = (color: string) => (color.startsWith("#") ? color : `#${color}`).slice(0, 7).toUpperCase();

/** base + (variant − base) × amount, per channel: 0 keeps the base, 1 is paletteVariant's full version. */
function blend(base: string[], variant: string[], amount: number): string[] {
  return base.map((color, at) => {
    const a = hexRgb(color), b = hexRgb(variant[at]);
    return `#${a.map((value, channel) => Math.round(value + (b[channel] - value) * amount).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  });
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function Swatches({ colors, small, title, className }: { colors: string[]; small?: boolean; title?: string; className?: string }) {
  return <span className={`dw-swatches${small ? " dw-swatches--small" : ""}${className ? ` ${className}` : ""}`} title={title}>{colors.map((color, at) => <i key={at} style={{ background: color }} />)}</span>;
}

function Pixels({ rgba, width, height }: { rgba: Uint8ClampedArray; width: number; height: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    if (target.width !== width || target.height !== height) Object.assign(target, { width, height });
    target.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  }, [rgba, width, height]);
  return <canvas ref={canvas} width={width} height={height} />;
}

export function DnsWizard({ slots, where, existing, picture, onClose, onCreate }: DnsWizardProps): JSX.Element {
  // The slot palettes once each (a palette may sit in two slots); ones that are already a version are left out.
  const bases = useMemo(() => {
    const seen = new Set<string>();
    const usable: SlotPalette[] = [], variants: SlotPalette[] = [];
    for (const slot of slots) {
      if (!slot || seen.has(slot.id)) continue;
      seen.add(slot.id);
      const palette = { ...slot, colors: slot.colors.map(hex) };
      (timeVariant(slot.name) ? variants : usable).push(palette);
    }
    return { usable, variants };
  }, [slots]);

  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(bases.usable.map((base) => base.id)));
  const [times, setTimes] = useState<Set<Time>>(() => new Set<Time>(["D", "S", "N"]));
  const [strength, setStrength] = useState(100);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const picked = useMemo(() => bases.usable.filter((base) => chosen.has(base.id)), [bases, chosen]);
  const pickedTimes = useMemo(() => TIMES.filter((time) => times.has(time.key)), [times]);

  const versions = useMemo(() => {
    const taken = new Set(existing.map((name) => name.trim()));
    const list: Version[] = [];
    for (const base of picked) for (const { key } of pickedTimes) {
      const name = `${base.name} ${key}`;
      const colors = blend(base.colors, paletteVariant(base.colors, key), strength / 100);
      // A name already in the project (or twice in this list) is skipped, so nothing gets a duplicate.
      list.push({ base, time: key, name, colors, exists: taken.has(name), close: closeShades(colors).length });
      taken.add(name);
    }
    return list;
  }, [picked, pickedTimes, strength, existing]);
  const toAdd = versions.filter((version) => !version.exists);
  const skipped = versions.length - toAdd.length;
  const tooClose = toAdd.filter((version) => version.close > 0).length;

  // The open picture as it is and under each chosen time: slot palettes swap for their versions, others stay.
  const previews = useMemo(() => {
    if (step !== 1 || !picture) return [];
    const draw = (time: Time | null) => toRgba(picture.pixels, picture.cells, picture.width, picture.palettes.map((palette) => {
      if (!time) return palette;
      const version = versions.find((entry) => entry.time === time && (palette.id ? entry.base.id === palette.id : entry.base.name === palette.name));
      return version ? { ...palette, colors: version.colors } : palette;
    }));
    return [{ key: "now", label: "As it is", rgba: draw(null) }, ...pickedTimes.map((time) => ({ key: time.key, label: time.name, rgba: draw(time.key) }))];
  }, [step, picture, versions, pickedTimes]);

  const toggle = <T,>(set: Set<T>, value: T, on: boolean) => { const next = new Set(set); if (on) next.add(value); else next.delete(value); return next; };

  const create = async () => {
    setBusy(true);
    setError(null);
    try { setDone(await onCreate(toAdd.map(({ name, colors }) => ({ name, colors })))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  const first = picked[0];
  const steps = (
    <div className="dw-steps">{STEPS.map((name, index) => {
      const state = done !== null || index < step ? "done" : index === step ? "now" : "";
      return (
        <button key={name} type="button" className={`dw-step ${state}`} disabled={done !== null || index >= step || busy} onClick={() => setStep(index)}>
          <b>{state === "done" ? <Check size={10} strokeWidth={3} /> : index + 1}</b>{name}
        </button>
      );
    })}</div>
  );

  const palettesStep = (
    <div className="dw-two">
      <div className="k-stack k-stack--tight">
        <div className="k-row"><span className="k-eyebrow">From {where}</span><span className="k-spacer" />
          <Button size="sm" variant="ghost" onClick={() => setChosen(new Set(bases.usable.map((base) => base.id)))}>All</Button>
          <Button size="sm" variant="ghost" onClick={() => setChosen(new Set())}>None</Button>
        </div>
        {bases.usable.length === 0 && <div className="k-well dw-note">No palettes in {where} to make versions of.</div>}
        <div className="dw-list">{bases.usable.map((base) => (
          <div key={base.id} className="dw-item">
            <Checkbox checked={chosen.has(base.id)} onChange={(on) => setChosen(toggle(chosen, base.id, on))}><span className="dw-name">{base.name}</span></Checkbox>
            <span className="k-spacer" />
            <span className="k-muted k-xs">slot {slots.findIndex((slot) => slot?.id === base.id) + 1}</span>
            <Swatches colors={base.colors} small />
          </div>
        ))}</div>
        {bases.variants.length > 0 && <span className="k-muted k-xs">Skipped, already a time-of-day version: {bases.variants.map((variant) => variant.name).join(", ")}.</span>}
      </div>
      <div className="k-stack k-stack--tight">
        <span className="k-eyebrow">Times to make</span>
        {TIMES.map((time) => (
          <button key={time.key} type="button" className="k-card k-card--button dw-time" aria-pressed={times.has(time.key)} onClick={() => setTimes(toggle(times, time.key, !times.has(time.key)))}>
            {time.icon}<b>{time.name}</b><span className="k-muted k-xs">{time.hint}</span><span className="k-spacer" /><span className="k-muted k-xs k-mono">… {time.key}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const versionsStep = first && (
    <div className="k-stack">
      <div className="k-row"><Chip>{first.name}</Chip>{picked.length > 1 && <span className="k-muted k-small">and {picked.length - 1} more from {where}</span>}</div>
      <div className="dw-trio" style={{ gridTemplateColumns: `repeat(${pickedTimes.length}, minmax(0, 1fr))` }}>{pickedTimes.map((time) => {
        const mine = versions.filter((version) => version.time === time.key);
        const [big, ...rest] = mine;
        return (
          <div key={time.key} className="k-card dw-card">
            <div className="k-row">{time.icon}<b>{time.name}</b><span className="k-spacer" />{big.exists ? <Chip title={`${big.name} is already in the project`}>exists — skipped</Chip> : <Chip>{big.name}</Chip>}</div>
            <Swatches colors={big.colors} className={big.exists ? "is-exists" : undefined} />
            {big.close > 0 && !big.exists && <div><Chip tone="warn" title="Neighbouring shades are hard to tell apart on a small screen">shades too close</Chip></div>}
            {rest.length > 0 && <div className="dw-minis">{rest.map((version) => (
              <Swatches key={version.name} colors={version.colors} small className={version.exists ? "is-exists" : version.close > 0 ? "is-close" : undefined}
                title={`${version.name}${version.exists ? " — exists, skipped" : version.close > 0 ? " — shades too close" : ""}`} />
            ))}</div>}
          </div>
        );
      })}</div>
      <Field label={<>Strength <span className="k-muted">· {strength}%</span></>} hint="From a hint of the time of day to the full version"><Slider label="Strength" value={strength} onChange={setStrength} min={0} max={100} /></Field>
      {previews.length > 0 && picture && (
        <div className="k-stack k-stack--tight">
          <span className="k-eyebrow">The open picture under each time</span>
          <div className="dw-pics">{previews.map((preview) => (
            <figure key={preview.key} className="dw-pic"><figcaption className="k-muted k-xs">{preview.label}</figcaption><Pixels rgba={preview.rgba} width={picture.width} height={picture.height} /></figure>
          ))}</div>
        </div>
      )}
      <div className="k-row dw-summary">
        {skipped > 0 && <Chip title="Versions whose name is already in the project are not added again">{skipped} exist — skipped</Chip>}
        {tooClose > 0 && <Chip tone="warn" title="Some neighbouring shades are hard to tell apart; a lower strength or a tweak in the palette manager helps">{plural(tooClose, "version")} with shades too close</Chip>}
      </div>
    </div>
  );

  const createStep = done !== null ? (
    <div className="k-well dw-note dw-done"><Check size={16} /><span>Added {plural(done, "palette")}. With Named slots on, tiles painted with a version save in their base's slot.</span></div>
  ) : (
    <div className="k-stack">
      <div className="k-well dw-note">Adds {plural(toAdd.length, "palette")} to the project{pickedTimes.length ? ` (${picked.length} × ${pickedTimes.map((time) => time.key).join(", ")}${skipped ? `, less ${skipped} that exist` : ""})` : ""}. Named slots then save them in their bases' slots.</div>
      <div className="dw-list dw-list--grid">{versions.map((version) => (
        <div key={version.name} className={`dw-item${version.exists ? " is-skipped" : ""}`}>
          <span className="dw-name">{version.name}</span><span className="k-spacer" />
          {version.exists ? <Chip>exists — skipped</Chip> : version.close > 0 && <Chip tone="warn">too close</Chip>}
          <Swatches colors={version.colors} small />
        </div>
      ))}</div>
      {error && <span className="dw-error k-small">Couldn't add them: {error}</span>}
    </div>
  );

  const canNext = step === 0 ? picked.length > 0 && times.size > 0 : true;
  const footer = done !== null ? <><span className="k-spacer" /><Button variant="primary" onClick={onClose}>Close</Button></> : <>
    <span className="k-muted k-small">Step {step + 1} of {STEPS.length}</span>
    <span className="k-spacer" />
    <Button icon={<ArrowLeft />} disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>Back</Button>
    {step < 2
      ? <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Next<ArrowRight /></Button>
      : <Button variant="primary" disabled={busy || toAdd.length === 0} onClick={() => void create()}>{busy ? "Adding…" : `Add ${plural(toAdd.length, "palette")}`}</Button>}
  </>;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }} wide title="Day, sunset and night" sub="Time-of-day versions of your palettes, named so GB Studio events can swap them" icon={<PxCloudMoon size={18} />} footer={footer}>
      {steps}
      {step === 0 ? palettesStep : step === 1 ? versionsStep : createStep}
    </Dialog>
  );
}
