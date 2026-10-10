import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Dialog } from "../ui/kit";
import { PxHeart } from "../ui/setIcons";
import type { AssetKind } from "./model";
import "./HealthWindow.css";

export interface HealthIssue { level: "problem" | "warning" | "note"; kind: AssetKind | "palettes" | "project"; file?: string; title: string; detail: string }

const LEVELS = { problem: "Problems", warning: "Worth a look", note: "Notes" } as const;
const COUNT = { problem: ["problem", "problems"], warning: ["warning", "warnings"], note: ["note", "notes"] } as const;
/** What the kind line calls each kind of file. */
const KIND_WORD: Record<string, string> = { backgrounds: "background", sprites: "sprite sheet", tilesets: "tileset", fonts: "font", emotes: "emote", avatars: "avatar", ui: "UI picture", palettes: "palette" };

/** Project health: what GB Studio will complain about or quietly do differently. Clicking a picture opens it. */
export function HealthWindow({ projectName, onClose, onOpen }: { projectName: string; onClose: () => void; onOpen: (kind: AssetKind, file: string) => void }) {
  const [report, setReport] = useState<{ colorMode: string; issues: HealthIssue[] } | null>(null);
  const [error, setError] = useState("");
  const [stamp, setStamp] = useState(0);
  useEffect(() => {
    let live = true;
    setReport(null);
    setError("");
    fetch("./__cartographer/project-health", { cache: "no-cache" }).then((response) => response.ok ? response.json() as Promise<{ colorMode: string; issues: HealthIssue[] }> : Promise.reject(new Error(response.statusText)))
      .then((result) => { if (live) setReport(result); })
      .catch((reason) => { if (live) setError((reason as Error).message); });
    return () => { live = false; };
  }, [stamp]);
  const mode = report ? ({ color: "Color only (384 tiles)", mixed: "GB + Color (192 tiles)", mono: "Monochrome (192 tiles)" } as Record<string, string>)[report.colorMode] ?? report.colorMode : "";
  // "2 warnings, 3 notes" for the subtitle.
  const counts = report ? (["problem", "warning", "note"] as const).map((level) => [level, report.issues.filter((issue) => issue.level === level).length] as const).filter(([, count]) => count)
    .map(([level, count]) => `${count} ${COUNT[level][count === 1 ? 0 : 1]}`).join(", ") || "nothing to fix" : error ? "could not check" : "checking…";
  const open = (issue: HealthIssue) => { onOpen(issue.kind as AssetKind, issue.file!); onClose(); };
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }} wide title="Project health" sub={`${projectName} · ${counts}`} icon={<PxHeart size={18} />}
      headExtra={<Button size="sm" variant="ghost" icon={<RefreshCw />} onClick={() => setStamp(stamp + 1)}>Check again</Button>}>
      <div className="k-stack hw-body">
        {error && <p className="k-muted k-small hw-line">Could not check: {error}</p>}
        {!report && !error && <p className="k-muted k-small hw-line">Checking every picture and palette…</p>}
        {report && <p className="k-muted k-small hw-line">Color mode: {mode}. {report.issues.length ? `${report.issues.length} thing${report.issues.length === 1 ? "" : "s"} to look at.` : "Nothing to fix."}</p>}
        {report && (["problem", "warning", "note"] as const).map((level) => {
          const list = report.issues.filter((issue) => issue.level === level);
          if (!list.length) return null;
          return (
            <section key={level} className="k-stack k-stack--tight">
              <span className="k-eyebrow">{LEVELS[level]} · {list.length}</span>
              {list.map((issue, index) => {
                // Pictures open in the painter; palettes and project settings have nowhere to go from here.
                const openable = Boolean(issue.file) && issue.kind !== "palettes" && issue.kind !== "project";
                // A note that names no file (the time-of-day count) is only information: a gray bar.
                const tone = level === "note" && !issue.file ? "info" : level;
                return (
                  <div key={index} className={`k-card hw-issue hw-${tone}${openable ? " hw-openable" : ""}`} title={openable ? "Open this picture" : undefined} onClick={openable ? () => open(issue) : undefined}>
                    <i aria-hidden="true" />
                    <div className="hw-text">
                      <b>{issue.title}</b>
                      {issue.file && <small>{KIND_WORD[issue.kind] ?? issue.kind} · {issue.file}</small>}
                      <span>{issue.detail}</span>
                    </div>
                    {openable && <Button size="sm" onClick={(event) => { event.stopPropagation(); open(issue); }}>Open</Button>}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
