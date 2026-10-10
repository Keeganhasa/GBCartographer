import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AssetKind } from "./model";

export interface HealthIssue { level: "problem" | "warning" | "note"; kind: AssetKind | "palettes" | "project"; file?: string; title: string; detail: string }

const LEVELS = { problem: "Problems", warning: "Worth a look", note: "Notes" } as const;

/** Project health: what GB Studio will complain about or quietly do differently. Clicking a picture opens it. */
export function HealthWindow({ projectName, onClose, onOpen }: { projectName: string; onClose: () => void; onOpen: (kind: AssetKind, file: string) => void }) {
  const [report, setReport] = useState<{ colorMode: string; issues: HealthIssue[] } | null>(null);
  const [error, setError] = useState("");
  const [stamp, setStamp] = useState(0);
  useEffect(() => {
    let live = true;
    setReport(null);
    fetch("./__cartographer/project-health", { cache: "no-cache" }).then((response) => response.ok ? response.json() as Promise<{ colorMode: string; issues: HealthIssue[] }> : Promise.reject(new Error(response.statusText)))
      .then((result) => { if (live) setReport(result); })
      .catch((reason) => { if (live) setError((reason as Error).message); });
    return () => { live = false; };
  }, [stamp]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const mode = report ? ({ color: "Color only (384 tiles)", mixed: "GB + Color (192 tiles)", mono: "Monochrome (192 tiles)" } as Record<string, string>)[report.colorMode] ?? report.colorMode : "";
  return (
    <div className="gbp-modal-backdrop" onClick={onClose}>
      <div className="gbp-modal gbp-help gbp-health" role="dialog" aria-label="Project health" onClick={(event) => event.stopPropagation()}>
        <header className="gbp-modal-head">
          <h2>Project health · {projectName}</h2>
          <span className="gbp-spacer" />
          <button className="quiet-button" onClick={() => setStamp(stamp + 1)}><RefreshCw size={14} />Check again</button>
          <button className="icon-button small" aria-label="Close" onClick={onClose}><X size={14} /></button>
        </header>
        <div className="gbp-help-body">
          {error && <p className="gbp-note">Could not check: {error}</p>}
          {!report && !error && <p className="gbp-note">Checking every picture and palette…</p>}
          {report && <p className="gbp-note">Color mode: {mode}. {report.issues.length ? `${report.issues.length} thing${report.issues.length === 1 ? "" : "s"} to look at.` : "Nothing to fix."}</p>}
          {report && (["problem", "warning", "note"] as const).map((level) => {
            const list = report.issues.filter((issue) => issue.level === level);
            if (!list.length) return null;
            return (
              <section key={level} className={`gbp-health-group ${level}`}>
                <span className="eyebrow">{LEVELS[level]} · {list.length}</span>
                {list.map((issue, index) => {
                  const openable = issue.file && issue.kind !== "palettes" && issue.kind !== "project";
                  return (
                    <button key={index} className="gbp-health-row" disabled={!openable} title={openable ? "Open this picture" : undefined} onClick={() => { if (openable) { onOpen(issue.kind as AssetKind, issue.file!); onClose(); } }}>
                      <b>{issue.title}</b>
                      {issue.file && <small>{issue.kind === "palettes" ? "palette" : issue.kind} · {issue.file}</small>}
                      <span>{issue.detail}</span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
