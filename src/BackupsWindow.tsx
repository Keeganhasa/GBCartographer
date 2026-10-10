/**
 * The Backups window: every project file GB Cartographer has backed up before overwriting it, with its last versions
 * (newest first). A version shows next to the file as it is now (pictures as images, project JSON as text) and can
 * be put back; the restore itself is backed up first, so it can be undone from here too.
 */
import { FolderOpen, History, X } from "lucide-react";
import { useEffect, useState } from "react";

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
/** "assets/backgrounds/town.png" → the asset query the painter's endpoints take, for the file as it is now. */
const assetOf = (file: string) => /^assets\/(backgrounds|sprites|tilesets|fonts)\/([^/]+\.png)$/i.exec(file);

function JsonPreview({ url }: { url: string }) {
  const [text, setText] = useState("…");
  useEffect(() => {
    let live = true;
    fetch(url, { cache: "no-cache" }).then((response) => response.ok ? response.text() : Promise.reject(new Error(response.statusText)))
      .then((body) => { if (live) setText(body.length > 6000 ? `${body.slice(0, 6000)}\n…` : body); })
      .catch(() => { if (live) setText("(not available)"); });
    return () => { live = false; };
  }, [url]);
  return <pre className="gbp-backup-json">{text}</pre>;
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const entry = files?.find((item) => item.file === picked) ?? null;
  const chosen = entry?.versions.find((item) => item.id === version) ?? entry?.versions[0] ?? null;
  const asset = entry ? assetOf(entry.file) : null;
  const backupUrl = entry && chosen ? `./__cartographer/backup?${new URLSearchParams({ file: entry.file, version: chosen.id })}` : "";
  const nowUrl = asset ? `./__cartographer/gbstudio-asset?${new URLSearchParams({ kind: asset[1], file: asset[2] })}&t=${stamp}` : "";

  async function restore() {
    if (!entry || !chosen) return;
    setBusy(true);
    const done = await onRestore(entry.file, chosen.id);
    setBusy(false);
    if (done) { setVersion(null); setStamp((value) => value + 1); }
  }

  return (
    <div className="gbp-modal-backdrop" onClick={onClose}>
      <div className="gbp-modal gbp-backups" role="dialog" aria-label="Backups" onClick={(event) => event.stopPropagation()}>
        <header className="gbp-modal-head">
          <History size={16} />
          <h2>Backups · {projectName}</h2>
          <span className="gbp-spacer" />
          <button className="quiet-button" title="Open this project's backups folder" onClick={() => void fetch("./__cartographer/reveal?backups=1", { method: "POST" })}><FolderOpen size={14} />Show backups folder</button>
          <button className="icon-button small" aria-label="Close" onClick={onClose}><X size={14} /></button>
        </header>
        <div className="gbp-modal-body">
          <nav className="gbp-backup-files" aria-label="Backed-up files">
            {files === null && <p className="gbp-note">Reading…</p>}
            {files?.length === 0 && <p className="gbp-note">Nothing backed up yet. Every save keeps the file it replaces here (the last 10 versions of each).</p>}
            {older && <button className="gbp-backup-older" title="One copy per file name, from before backups kept history (any project); open the folder to look" onClick={() => void fetch("./__cartographer/reveal?backups=older", { method: "POST" })}><b>Older backups…</b><small>from before history was kept · opens the folder</small></button>}
            {files?.map((item) => (
              <button key={item.file} className={item.file === picked ? "selected" : ""} title={item.file} onClick={() => { setPicked(item.file); setVersion(null); }}>
                <b>{item.file.split("/").pop()}</b>
                <small>{item.file.split("/").slice(0, -1).join("/")} · {item.versions.length} · {ago(item.versions[0].time)}</small>
              </button>
            ))}
          </nav>
          <section className="gbp-backup-detail">
            {entry && chosen ? (
              <>
                <div className="gbp-backup-versions" role="listbox" aria-label="Versions">
                  {entry.versions.map((item) => (
                    <button key={item.id} role="option" aria-selected={item.id === chosen.id} className={item.id === chosen.id ? "selected" : ""} title={when(item.time)} onClick={() => setVersion(item.id)}>
                      <b>{ago(item.time)}</b><small>{when(item.time)} · {kb(item.size)}</small>
                    </button>
                  ))}
                </div>
                <div className="gbp-backup-compare">
                  <figure><figcaption>Backup · {when(chosen.time)}</figcaption>{asset ? <img src={backupUrl} alt="The backed-up version" /> : <JsonPreview url={backupUrl} />}</figure>
                  <figure><figcaption>Now in the project</figcaption>{asset ? <img src={nowUrl} alt="The file as it is now" /> : <JsonPreview url={`./__cartographer/backup?${new URLSearchParams({ file: entry.file, version: "current" })}&t=${stamp}`} />}</figure>
                </div>
                <div className="gbp-backup-actions">
                  <span className="gbp-note">Restoring backs up the current file first, so you can undo it here.</span>
                  <span className="gbp-spacer" />
                  <button className="quiet-button primary" disabled={busy} onClick={() => void restore()}>Restore this version</button>
                </div>
              </>
            ) : <p className="gbp-note">{files?.length ? "Pick a file." : ""}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
