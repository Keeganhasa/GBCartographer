/**
 * The Backups window: every project file GB Cartographer has backed up before overwriting it, with its last versions
 * (newest first). A version shows next to the file as it is now (pictures side by side with how many pixels and
 * tiles differ, project JSON as a short list of what changed, the raw text on request) and can be put back; the
 * restore itself is backed up first, so it can be undone from here too.
 */
import { FolderOpen, History } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { decodeTileColors } from "./gb/gbstudio";
import { Button, Dialog, Slider, Switch } from "./ui/kit";
import "./BackupsWindow.css";

export interface BackupVersion { id: string; time: number; size: number }
export interface BackupFile { file: string; versions: BackupVersion[] }

interface BackupsWindowProps {
  projectName: string;
  /** Open on this file (a path inside the project), e.g. from a picture's right-click menu. */
  initialFile?: string;
  onClose: () => void;
  /** Puts a version back; resolves true when it was restored (the parent reloads what it shows). */
  onRestore: (file: string, version: string) => Promise<boolean>;
}

const ago = (time: number) => {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};
const when = (time: number) => new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
const kb = (size: number) => size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * What a backed-up file is, in words: its name and a kind line, so a picture and its sidecar ("Cabin Interior",
 * picture / tile palettes) read differently in the list.
 */
function describe(file: string): { name: string; kind: string; picture: boolean } {
  let match = /^assets\/[^/]+\/(.+)\.png$/i.exec(file);
  if (match) return { name: match[1], kind: "picture", picture: true };
  match = /^assets\/([^/]+)\/(.+)\.png\.gbsres$/i.exec(file);
  if (match) return { name: match[2], kind: match[1] === "sprites" ? "sprite palettes" : match[1] === "backgrounds" || match[1] === "tilesets" ? "tile palettes" : "settings", picture: false };
  match = /^project\/palettes\/(.+)\.gbsres$/i.exec(file);
  if (match) return { name: match[1], kind: "palette", picture: false };
  match = /^project\/scenes\/([^/]+)\//i.exec(file);
  if (match) return { name: match[1], kind: "scene palettes", picture: false };
  if (file === "project/settings.gbsres") return { name: "Project settings", kind: "default palettes", picture: false };
  if (/maps\.json$/i.test(file)) return { name: "Map Room", kind: "map layouts", picture: false };
  return { name: file.split("/").pop() ?? file, kind: file.endsWith(".png") ? "picture" : "file", picture: file.endsWith(".png") };
}

/** A picture's pixels, decoded by the browser. */
function loadPixels(url: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) { reject(new Error("No canvas")); return; }
      context.drawImage(image, 0, 0);
      resolve(context.getImageData(0, 0, canvas.width, canvas.height));
    };
    image.onerror = () => reject(new Error("Could not read the picture"));
    image.src = url;
  });
}

/** How two pictures differ: changed pixels and the 8 × 8 tiles they fall in (see-through pixels match whatever their color). */
function pictureDiff(before: ImageData, after: ImageData): string {
  if (before.width !== after.width || before.height !== after.height) return `Size changed: ${before.width} × ${before.height} px in the backup, ${after.width} × ${after.height} px now.`;
  const { width, height } = before, a = before.data, b = after.data;
  const columns = Math.ceil(width / 8), tiles = new Set<number>();
  let pixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const same = a[at + 3] === 0 && b[at + 3] === 0 || (a[at] === b[at] && a[at + 1] === b[at + 1] && a[at + 2] === b[at + 2] && a[at + 3] === b[at + 3]);
      if (same) continue;
      pixels += 1;
      tiles.add((y >> 3) * columns + (x >> 3));
    }
  }
  if (!pixels) return "Same pixels as the file now.";
  return `${plural(pixels, "pixel")} differ, in ${tiles.size} of ${columns * Math.ceil(height / 8)} tiles (8 × 8).`;
}

/** A picture's backup next to the file now, pixelated, with a line saying how much differs. */
function PictureCompare({ backupUrl, nowUrl, time }: { backupUrl: string; nowUrl: string; time: number }) {
  const [diff, setDiff] = useState("Comparing…");
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let live = true;
    setDiff("Comparing…");
    setGone(false);
    Promise.all([loadPixels(backupUrl), loadPixels(nowUrl).catch(() => null)])
      .then(([before, after]) => { if (!live) return; if (!after) { setGone(true); setDiff("The file is no longer in the project."); } else setDiff(pictureDiff(before, after)); })
      .catch(() => { if (live) setDiff("Could not compare the two."); });
    return () => { live = false; };
  }, [backupUrl, nowUrl]);
  return (
    <>
      <div className="bw-compare">
        <figure><figcaption title={when(time)}>Backup</figcaption><div className="bw-pic"><img src={backupUrl} alt="The backed-up version" /></div></figure>
        <figure><figcaption>Now in the project</figcaption><div className="bw-pic">{gone ? <span className="k-muted k-small">Not in the project</span> : <img src={nowUrl} alt="The file as it is now" />}</div></figure>
      </div>
      <div className="k-well bw-summary">{diff}</div>
    </>
  );
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null;
/** The palette slot lists GB Cartographer writes, and how a slot of each reads. */
const SLOT_LISTS: Record<string, string> = { paletteIds: "Background slot", spritePaletteIds: "Sprite slot", defaultBackgroundPaletteIds: "Default background slot", defaultSpritePaletteIds: "Default sprite slot" };

/** Every leaf (path) that differs between two JSON values. */
function changedLeaves(a: unknown, b: unknown, path: string[] = [], out: string[][] = []): string[][] {
  if (out.length > 5000) return out;
  if (isObject(a) && isObject(b) && Array.isArray(a) === Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) changedLeaves(a[key], b[key], [...path, key], out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(path);
  return out;
}

/** A short list of what changed between a backed-up JSON file and the file now, in words. */
function summarize(before: Json, after: Json, paletteName: (id: string) => string): ReactNode[] {
  const lines: ReactNode[] = [];
  const handled = new Set<string>();
  if ("tileColors" in before || "tileColors" in after) {
    handled.add("tileColors");
    const a = String(before.tileColors ?? ""), b = String(after.tileColors ?? "");
    if (a !== b) {
      try {
        const old = decodeTileColors(a), now = decodeTileColors(b);
        let slots = 0, priority = 0;
        for (let at = 0; at < Math.max(old.length, now.length); at += 1) {
          if (((old[at] ?? 0) & 7) !== ((now[at] ?? 0) & 7)) slots += 1;
          if (((old[at] ?? 0) & 0x80) !== ((now[at] ?? 0) & 0x80)) priority += 1;
        }
        if (slots) lines.push(`${plural(slots, "tile")} changed palette.`);
        if (priority) lines.push(`${plural(priority, "tile")} changed priority (drawn above sprites or not).`);
        if (!slots && !priority) lines.push("Tile palettes written differently, same slots.");
      } catch {
        lines.push("Tile palettes changed.");
      }
    }
  }
  if (typeof before.name === "string" && typeof after.name === "string" && before.name !== after.name) lines.push(`Name: "${before.name}" in the backup, "${after.name}" now.`);
  handled.add("name");
  if (Array.isArray(before.colors) && Array.isArray(after.colors)) {
    handled.add("colors");
    const old = before.colors.map(String), now = after.colors.map(String);
    for (let at = 0; at < Math.max(old.length, now.length); at += 1) {
      if (old[at] === now[at]) continue;
      lines.push(<span className="bw-color">Color {at + 1}: <i style={{ background: `#${old[at] ?? "000"}` }} />#{old[at] ?? "—"} → <i style={{ background: `#${now[at] ?? "000"}` }} />#{now[at] ?? "—"}</span>);
    }
  }
  for (const [key, label] of Object.entries(SLOT_LISTS)) {
    if (!Array.isArray(before[key]) && !Array.isArray(after[key])) continue;
    handled.add(key);
    const old = Array.isArray(before[key]) ? before[key].map(String) : [], now = Array.isArray(after[key]) ? after[key].map(String) : [];
    for (let at = 0; at < Math.max(old.length, now.length); at += 1) {
      if ((old[at] ?? "") !== (now[at] ?? "")) lines.push(`${label} ${at + 1}: ${paletteName(old[at] ?? "")} in the backup, ${paletteName(now[at] ?? "")} now.`);
    }
  }
  // Everything else: sprite slices' palettes counted, other fields named.
  const rest = changedLeaves(before, after).filter((path) => !handled.has(path[0]));
  const sprite = rest.filter((path) => path[path.length - 1] === "paletteIndex").length;
  if (sprite) lines.push(`${plural(sprite, "sprite tile")} changed palette.`);
  const fields = [...new Set(rest.filter((path) => path[path.length - 1] !== "paletteIndex").map((path) => path[0]).filter(Boolean))];
  if (fields.length) lines.push(`Also changed: ${fields.slice(0, 8).join(", ")}${fields.length > 8 ? ", …" : ""}.`);
  return lines;
}

/** Fetches a text file (a backup, or the file now); null when it isn't there. */
function useText(url: string): string | null | undefined {
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setText(undefined);
    fetch(url, { cache: "no-cache" }).then((response) => response.ok ? response.text() : null)
      .then((body) => { if (live) setText(body); })
      .catch(() => { if (live) setText(null); });
    return () => { live = false; };
  }, [url]);
  return text;
}

const clip = (text: string | null | undefined) => text === undefined ? "…" : text === null ? "(not available)" : text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text;
const parse = (text: string | null | undefined): Json | null => { try { const value: unknown = text ? JSON.parse(text) : null; return isObject(value) ? value : null; } catch { return null; } };

/** A JSON file's backup against the file now: what changed in words, the raw text of both behind a switch. */
function TextCompare({ backupUrl, nowUrl, time }: { backupUrl: string; nowUrl: string; time: number }) {
  const before = useText(backupUrl), after = useText(nowUrl);
  const [raw, setRaw] = useState(false);
  const [names, setNames] = useState<Map<string, string> | null>(null);
  const old = parse(before), now = parse(after);
  // Palette ids read as names: the project's palettes are fetched once, only for files that list slots.
  const wantNames = [old, now].some((value) => value && Object.keys(SLOT_LISTS).some((key) => key in value));
  useEffect(() => {
    if (!wantNames || names) return;
    let live = true;
    fetch("./__cartographer/gbstudio-assets", { cache: "no-cache" }).then((response) => response.json() as Promise<{ palettes?: { id: string; name: string }[] }>)
      .then((result) => { if (live) setNames(new Map((result.palettes ?? []).map((palette) => [palette.id, palette.name]))); })
      .catch(() => { if (live) setNames(new Map()); });
    return () => { live = false; };
  }, [wantNames, names]);
  const paletteName = (id: string) => !id ? "the default" : names?.get(id) ?? (id.length > 12 ? `${id.slice(0, 8)}…` : id);

  let lines: ReactNode[];
  if (before === undefined || after === undefined) lines = ["Reading…"];
  else if (after === null) lines = ["The file is no longer in the project."];
  else if (before === after) lines = ["Same as the file now."];
  else if (!old || !now) lines = ["The text differs (not JSON this window can read); switch on the raw text to compare."];
  else {
    lines = summarize(old, now, paletteName);
    if (!lines.length) lines = ["Same content as the file now (written differently)."];
  }
  return (
    <>
      <div className="k-stack k-stack--tight">
        <div className="k-row"><span className="k-eyebrow">Since this backup</span><span className="k-spacer" /><Switch checked={raw} onChange={setRaw}>Show raw</Switch></div>
        <ul className="k-well bw-summary bw-lines">{lines.map((line, at) => <li key={at}>{line}</li>)}</ul>
      </div>
      {raw && (
        <div className="bw-compare">
          <figure><figcaption title={when(time)}>Backup</figcaption><pre className="bw-raw k-mono">{clip(before)}</pre></figure>
          <figure><figcaption>Now in the project</figcaption><pre className="bw-raw k-mono">{clip(after)}</pre></figure>
        </div>
      )}
    </>
  );
}

export default function BackupsWindow({ projectName, initialFile, onClose, onRestore }: BackupsWindowProps) {
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [picked, setPicked] = useState<string | null>(initialFile ?? null);
  const [version, setVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(0);
  /** Backups from before history was kept exist (a flat folder, any project): offered as a folder to look in. */
  const [older, setOlder] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("./__cartographer/backups", { cache: "no-cache" }).then((response) => response.json() as Promise<{ files?: BackupFile[]; older?: boolean }>)
      .then((result) => {
        if (!live) return;
        setOlder(Boolean(result.older));
        const list = result.files ?? [];
        setFiles(list);
        setPicked((current) => current && list.some((entry) => entry.file === current) ? current : list[0]?.file ?? null);
      })
      .catch(() => { if (live) setFiles([]); });
    return () => { live = false; };
  }, [stamp]);

  const entry = files?.find((item) => item.file === picked) ?? null;
  const chosen = entry?.versions.find((item) => item.id === version) ?? entry?.versions[0] ?? null;
  const about = entry ? describe(entry.file) : null;
  const backupUrl = entry && chosen ? `./__cartographer/backup?${new URLSearchParams({ file: entry.file, version: chosen.id })}` : "";
  const nowUrl = entry ? `./__cartographer/backup?${new URLSearchParams({ file: entry.file, version: "current" })}&t=${stamp}` : "";
  // The slider runs oldest (left) to newest (right); versions come newest first.
  const position = entry && chosen ? entry.versions.length - 1 - entry.versions.indexOf(chosen) : 0;

  async function restore() {
    if (!entry || !chosen) return;
    setBusy(true);
    const done = await onRestore(entry.file, chosen.id);
    setBusy(false);
    if (done) { setVersion(null); setStamp((value) => value + 1); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} wide tall title="Backups" sub={`${projectName} · the last 10 versions of every file GB Cartographer replaced`} icon={<History size={18} />}
      headExtra={<Button size="sm" variant="ghost" icon={<FolderOpen />} title="Open this project's backups folder" onClick={() => void fetch("./__cartographer/reveal?backups=1", { method: "POST" })}>Show backups folder</Button>}
      footer={<><span className="k-muted k-small">Restoring backs up the current file first, so you can undo it here.</span><span className="k-spacer" /><Button variant="primary" disabled={busy || !entry || !chosen} onClick={() => void restore()}>Restore this version</Button></>}>
      <div className="bw-two">
        <nav className="bw-list" aria-label="Backed-up files">
          {files === null && <p className="k-muted k-small bw-note">Reading…</p>}
          {files?.length === 0 && <p className="k-muted k-small bw-note">Nothing backed up yet. Every save keeps the file it replaces here (the last 10 versions of each).</p>}
          {older && <button type="button" className="bw-row" title="One copy per file name, from before backups kept history (any project); open the folder to look" onClick={() => void fetch("./__cartographer/reveal?backups=older", { method: "POST" })}><b>Older backups…</b><small>from before history was kept · opens the folder</small></button>}
          {files?.map((item) => {
            const { name, kind } = describe(item.file);
            return (
              <button type="button" key={item.file} className="bw-row" aria-pressed={item.file === picked} title={item.file} onClick={() => { setPicked(item.file); setVersion(null); }}>
                <b>{name}</b>
                <small>{kind} · {plural(item.versions.length, "version")} · {ago(item.versions[0].time)}</small>
              </button>
            );
          })}
        </nav>
        <section className="bw-detail">
          {entry && chosen && about ? (
            <>
              <div className="k-field">
                <span className="k-label">Version {position + 1} of {entry.versions.length}</span>
                {entry.versions.length > 1 && (
                  <div className="bw-slider" title="Scrub through this file's versions, oldest on the left">
                    <span className="k-xs k-muted">oldest</span>
                    <Slider label="Version" value={position} min={0} max={entry.versions.length - 1} onChange={(value) => setVersion(entry.versions[entry.versions.length - 1 - value].id)} />
                    <span className="k-xs k-muted">newest</span>
                  </div>
                )}
                <span className="k-hint">{when(chosen.time)} · {ago(chosen.time)} · {kb(chosen.size)} · <span title={entry.file}>{about.kind}, {entry.file}</span></span>
              </div>
              {about.picture ? <PictureCompare backupUrl={backupUrl} nowUrl={nowUrl} time={chosen.time} /> : <TextCompare backupUrl={backupUrl} nowUrl={nowUrl} time={chosen.time} />}
            </>
          ) : <p className="k-muted k-small bw-note">{files?.length ? "Pick a file." : ""}</p>}
        </section>
      </div>
    </Dialog>
  );
}
