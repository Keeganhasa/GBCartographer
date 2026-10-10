/**
 * Project check-up (W8): the health report one issue at a time, worst first, each with its one-click fix. Every fix
 * button shows what it would do (old → new) before it is pressed. Palette fixes go through the parent (it writes
 * with a backup); pictures open in the painter. Notes with nothing to do stay hidden unless asked for.
 */
import { Archive, ArrowLeft, ArrowRight, Check, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type JSX, type ReactNode } from "react";
import { colorDistance } from "../paint";
import { Button, Chip, Dialog, Meter, Switch } from "../ui/kit";
import { checkupOrder, checkupSummary, contrastPairs, fixKind, isPicture, issueKey, separatePairs, tileCount, twinNames, whatToDo, type CheckupIssue } from "./checkupFixes";
import { PROJECT_URL } from "./model";
import "./CheckupWizard.css";

export interface CheckupWizardProps {
  projectName: string;
  onClose: () => void;
  /** Rewrites a project palette's colors (the parent writes it with a backup); resolves true when written. */
  onFixPalette: (palette: { id: string; name: string; colors: string[] }) => Promise<boolean>;
  /** Takes an unused palette out of the project (to the backups); resolves true when done. */
  onRemovePalette: (id: string, name: string) => Promise<boolean>;
  /** Opens a picture (kind + file) in the painter. */
  onOpen: (kind: string, file: string) => void;
  /** Opens the tile budget fixer on that picture (after opening it). */
  onFixTiles: (kind: string, file: string) => void;
}

type ProjectPalette = { id: string; name: string; colors: string[] };
/** fixed: by a fix here; skipped: had a fix, passed over; seen: nothing to fix here; gone: its palette was taken out. */
type Status = "fixed" | "skipped" | "seen" | "gone";

const HEALTH_URL = "./__cartographer/project-health";
const KIND_WORD: Record<string, string> = { backgrounds: "background", sprites: "sprite sheet", tilesets: "tileset", fonts: "font", emotes: "emote", avatars: "avatar", ui: "UI picture" };
const LEVEL_WORD = { problem: "Problem", warning: "Worth a look", note: "Note" } as const;

/** Four swatches in a row; `changed` positions get a ring. */
function Swatches({ colors, changed }: { colors: string[]; changed?: number[] }) {
  return <span className="cw-swatches" title={colors.join(" ")}>{colors.map((color, at) => <i key={at} className={changed?.includes(at) ? "is-changed" : undefined} style={{ background: color }} />)}</span>;
}

/** A palette by name, with its swatches. */
function PaletteLine({ palette, note }: { palette: ProjectPalette; note?: ReactNode }) {
  return <div className="cw-palette"><b>{palette.name}</b><Swatches colors={palette.colors} />{note && <span className="k-muted k-xs">{note}</span>}</div>;
}

/** One fix: the button (its old → new preview on it) and a line saying exactly what changes. */
function Fix({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return <div className="cw-fix">{children}{hint && <span className="cw-fix-hint">{hint}</span>}</div>;
}

export function CheckupWizard({ projectName, onClose, onFixPalette, onRemovePalette, onOpen, onFixTiles }: CheckupWizardProps): JSX.Element {
  const [report, setReport] = useState<{ colorMode: string; issues: CheckupIssue[] } | null>(null);
  const [palettes, setPalettes] = useState<ProjectPalette[]>([]);
  const [error, setError] = useState("");
  const [stamp, setStamp] = useState(0);
  const [notes, setNotes] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [at, setAt] = useState(0);
  const [arming, setArming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");

  // The report and the project's palettes, fetched together (again on Check again).
  useEffect(() => {
    let live = true;
    setReport(null);
    setError("");
    const json = <T,>(url: string) => fetch(url, { cache: "no-cache" }).then((response) => response.ok ? response.json() as Promise<T> : Promise.reject(new Error(response.statusText)));
    Promise.all([json<{ colorMode: string; issues: CheckupIssue[] }>(HEALTH_URL), json<{ palettes?: ProjectPalette[] }>(PROJECT_URL)])
      .then(([health, assets]) => { if (!live) return; setPalettes(assets.palettes ?? []); setReport(health); setStatuses({}); setAt(0); })
      .catch((reason) => { if (live) setError((reason as Error).message); });
    return () => { live = false; };
  }, [stamp]);

  const list = useMemo(() => report ? checkupOrder(report.issues, notes) : [], [report, notes]);
  const issue = list[at] as CheckupIssue | undefined;
  const key = issue ? issueKey(issue) : "";
  const status = statuses[key] as Status | undefined;
  const byName = (name: string | undefined) => palettes.find((palette) => palette.name === name);
  const unusedNames = useMemo(() => new Set(report?.issues.filter((entry) => entry.title === "Unused palette" && entry.file).map((entry) => entry.file!) ?? []), [report]);
  const hiddenNotes = report ? report.issues.length - checkupOrder(report.issues, false).length : 0;

  // A new issue on screen: no armed button, no old failure.
  useEffect(() => { setArming(null); setFailed(""); }, [key]);

  /** Showing notes or not keeps the same issue on screen when it is still in the list. */
  const toggleNotes = (next: boolean) => {
    if (!report) return setNotes(next);
    const nextList = checkupOrder(report.issues, next);
    const keep = issue ? nextList.findIndex((entry) => issueKey(entry) === key) : -1;
    setNotes(next);
    setAt(keep >= 0 ? keep : issue ? Math.min(at, nextList.length) : nextList.length);
  };

  /** The next issue not dealt with yet, after `from` (the end page if none). */
  const nextOpen = (from: number, marks: Record<string, Status>) => {
    for (let index = from + 1; index < list.length; index += 1) if (!marks[issueKey(list[index])]) return index;
    return list.length;
  };

  // The fix for the issue on screen, worked out before it is pressed.
  const kind = issue ? fixKind(issue) : "explain";
  const palette = issue?.kind === "palettes" ? byName(issue.file) : undefined;
  const pairs = kind === "contrast" ? contrastPairs(issue!.detail) : [];
  const separated = palette && kind === "contrast" ? separatePairs(palette.colors, pairs) : null;
  const changed = separated && palette ? separated.flatMap((color, index) => color !== palette.colors[index] ? [index] : []) : [];
  const twins = kind === "twin" && issue ? twinNames(issue.detail, palettes.map((entry) => entry.name)).map(byName).filter((entry): entry is ProjectPalette => Boolean(entry)) : [];
  // Of two palettes with the same colors, one can go only if no scene uses it.
  const spare = kind === "twin" ? [palette, ...twins].find((entry) => entry && unusedNames.has(entry.name)) : kind === "unused" ? palette : undefined;
  const fixable = !status && (kind === "tiles" || (kind === "contrast" && changed.length > 0) || ((kind === "unused" || kind === "twin") && Boolean(spare)));

  /** Leaves the issue on screen: passed over if it had a fix, seen if not. */
  const leave = () => {
    if (!issue) return;
    const marks = status ? statuses : { ...statuses, [key]: fixable ? "skipped" as const : "seen" as const };
    setStatuses(marks);
    setAt(nextOpen(at, marks));
  };

  const run = async (what: () => Promise<boolean>, after?: (marks: Record<string, Status>) => Record<string, Status>) => {
    setBusy(true);
    setFailed("");
    try {
      if (!(await what())) { setFailed("Not written: the project is as it was."); return; }
      const marks = after ? after({ ...statuses, [key]: "fixed" }) : { ...statuses, [key]: "fixed" as const };
      setStatuses(marks);
      setArming(null);
      setAt(nextOpen(at, marks));
    } catch (reason) {
      setFailed(`Not written: ${(reason as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const fixColors = () => palette && separated && void run(async () => {
    const done = await onFixPalette({ id: palette.id, name: palette.name, colors: separated });
    if (done) setPalettes((list) => list.map((entry) => entry.id === palette.id ? { ...entry, colors: separated } : entry));
    return done;
  });

  /** Two presses: the first arms the button, the second takes the palette out. */
  const remove = (target: ProjectPalette) => {
    const armKey = `${key}|${target.id}`;
    if (arming !== armKey) return setArming(armKey);
    void run(async () => {
      const done = await onRemovePalette(target.id, target.name);
      if (done) setPalettes((list) => list.filter((entry) => entry.id !== target.id));
      return done;
    }, (marks) => {
      // Every other issue about that palette (or naming it as a twin) is taken care of too.
      const next = { ...marks };
      for (const entry of report?.issues ?? []) {
        const about = entry.kind === "palettes" && (entry.file === target.name || (entry.title === "Same colors as another" && twinNames(entry.detail, [target.name]).includes(target.name)));
        if (about && !next[issueKey(entry)]) next[issueKey(entry)] = "gone";
      }
      return next;
    });
  };

  const openPicture = (fix: boolean) => {
    if (!issue?.file) return;
    if (fix) onFixTiles(issue.kind, issue.file); else onOpen(issue.kind, issue.file);
    onClose();
  };

  const removeButton = (target: ProjectPalette, label: string) => {
    const armed = arming === `${key}|${target.id}`;
    return (
      <Fix hint={armed ? "It moves to the backups (Backups window) and can be put back from there." : "No scene or default uses it; it moves to the backups, nothing is deleted."}>
        <Button variant={armed ? "danger" : "primary"} disabled={busy} onClick={() => remove(target)}>
          {armed ? "Press again to confirm" : label}
          <span className="cw-ba"><Swatches colors={target.colors} /><ArrowRight /><Archive /><span>Backups</span></span>
        </Button>
      </Fix>
    );
  };

  /** The fixes (or what to do) for the issue on screen. */
  const fixes = (): ReactNode => {
    if (!issue) return null;
    if (status === "gone") return <p className="cw-say">Taken care of: its palette was taken out of the project.</p>;
    if (kind === "contrast") {
      if (!palette) return <p className="cw-say">This palette isn't in the project's palette list any more. Check again to see where things stand.</p>;
      const label = `Separate colors ${pairs.map(([a, b]) => `${a + 1} and ${b + 1}`).join(", ")}`;
      const deltas = pairs.map(([a, b]) => `colors ${a + 1}–${b + 1}: ${colorDistance(palette.colors[a], palette.colors[b]).toFixed(1)} → ${colorDistance(separated![a], separated![b]).toFixed(1)}`).join(" · ");
      return (<>
        <PaletteLine palette={palette} />
        {changed.length ? (
          <Fix hint={<>{changed.map((index) => <span key={index} className="k-mono">color {index + 1}: {palette.colors[index]} → {separated![index]} </span>)}<br />Difference {deltas} (12 or more reads well). Same hues, still lightest first.</>}>
            <Button variant="primary" disabled={busy || Boolean(status)} onClick={fixColors}>
              {label}
              <span className="cw-ba"><Swatches colors={palette.colors} changed={changed} /><ArrowRight /><Swatches colors={separated!} changed={changed} /></span>
            </Button>
          </Fix>
        ) : <p className="cw-say">These colors have no room to move without changing the palette's order. Change them by hand in the palette manager.</p>}
      </>);
    }
    if (kind === "unused") {
      if (!palette) return <p className="cw-say">This palette isn't in the project's palette list any more.</p>;
      return removeButton(palette, "Take it out of the project");
    }
    if (kind === "twin") {
      return (<>
        <div className="cw-palettes">{[palette, ...twins].map((entry) => entry && <PaletteLine key={entry.id} palette={entry} note={unusedNames.has(entry.name) ? "unused" : "used"} />)}</div>
        {spare ? removeButton(spare, `Take out ${spare.name}`)
          : <p className="cw-say">Both are used, so neither can simply go. If they are meant to differ, change one in the palette manager; if not, point the scenes at one of them in GB Studio, and the other then shows up here as unused.</p>}
      </>);
    }
    if (kind === "tiles") {
      const count = tileCount(issue)!;
      return (<>
        <Meter label="Tiles" value={count.tiles} of={count.limit} tone={count.tiles > count.limit ? "bad" : "warn"} />
        <Fix hint="Merges tiles that differ by a few pixels, one step at a time; you choose how far, and undo brings them back.">
          <div className="k-row">
            <Button variant="primary" disabled={busy} onClick={() => openPicture(true)}>
              Open the tile budget fixer
              <span className="cw-ba"><span>{count.tiles}</span><ArrowRight /><span>{count.limit} or fewer</span></span>
            </Button>
            <Button icon={<ExternalLink />} onClick={() => openPicture(false)}>Open</Button>
          </div>
        </Fix>
      </>);
    }
    return (<>
      <p className="cw-say">{whatToDo(issue)}</p>
      {isPicture(issue) && <div className="k-row"><Button icon={<ExternalLink />} onClick={() => openPicture(false)}>Open</Button></div>}
    </>);
  };

  // Counts for the end page.
  const counts = list.reduce((sum, entry) => { const mark = statuses[issueKey(entry)]; if (mark) sum[mark] += 1; return sum; }, { fixed: 0, skipped: 0, seen: 0, gone: 0 });
  const done = Boolean(report) && at >= list.length;
  const title = issue ? (issue.kind === "palettes" && issue.file ? `${issue.file}: ${issue.title}` : issue.title) : "";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} wide title="Project check-up" sub={`${projectName} · health issues one at a time, each with its fix`} icon={<Sparkles size={18} />}
      headExtra={<Switch checked={notes} onChange={toggleNotes}>Show notes too</Switch>}
      footer={<>
        <span className="k-muted k-small">{!report ? "" : done ? (list.length ? "Done" : "") : `Issue ${at + 1} of ${list.length}`}</span>
        <span className="k-spacer" />
        {done ? (<>
          <Button icon={<RefreshCw />} onClick={() => setStamp(stamp + 1)}>Check again</Button>
          <Button variant="primary" onClick={onClose}>Close</Button>
        </>) : (<>
          <Button icon={<ArrowLeft />} disabled={!report || at === 0 || busy} onClick={() => setAt(at - 1)}>Back</Button>
          {fixable && <Button variant="ghost" disabled={busy} onClick={leave}>Skip</Button>}
          <Button variant="primary" disabled={!report || busy} onClick={leave}>{nextOpen(at, { ...statuses, [key]: "seen" }) >= list.length ? "Finish" : "Next"}<ArrowRight /></Button>
        </>)}
      </>}>
      {error && <p className="k-muted k-small">Could not check: {error}</p>}
      {!report && !error && <p className="k-muted k-small">Checking every picture and palette…</p>}
      {report && list.length > 0 && (
        <div className="cw-steps" role="list" aria-label="Issues">
          {list.map((entry, index) => {
            const mark = statuses[issueKey(entry)];
            const cls = index === at ? "is-now" : mark === "fixed" || mark === "gone" ? "is-done" : mark ? "is-passed" : "";
            return (
              <button key={issueKey(entry)} type="button" role="listitem" className={`cw-step cw-step--${entry.level} ${cls}`} title={`${entry.file ? `${entry.file}: ` : ""}${entry.title}${mark ? ` (${mark})` : ""}`} onClick={() => setAt(index)}>
                <b>{mark === "fixed" || mark === "gone" ? <Check size={10} strokeWidth={3} /> : index + 1}</b>
              </button>
            );
          })}
          <button type="button" role="listitem" className={`cw-step cw-step--end ${done ? "is-now" : ""}`} onClick={() => setAt(list.length)}><b><Check size={10} strokeWidth={3} /></b>Done</button>
        </div>
      )}
      {report && issue && (
        <div className={`k-card cw-issue cw-issue--${issue.level}`}>
          <div className="k-row cw-issue-head">
            <span className="cw-level">{LEVEL_WORD[issue.level]}</span>
            {status === "fixed" && <Chip tone="acc"><Check size={11} strokeWidth={3} /> Fixed</Chip>}
            {status === "skipped" && <Chip>Skipped</Chip>}
          </div>
          <b className="cw-title">{title}</b>
          {isPicture(issue) && <small className="k-muted k-xs">{KIND_WORD[issue.kind] ?? issue.kind} · {issue.file}</small>}
          <p className="cw-detail">{issue.detail.charAt(0).toUpperCase() + issue.detail.slice(1)}</p>
          <div className="k-stack k-stack--tight">{fixes()}</div>
          {failed && <p className="cw-failed">{failed}</p>}
        </div>
      )}
      {report && done && (
        <div className="k-card cw-end">
          <span className="cw-end-mark"><Check size={20} strokeWidth={3} /></span>
          {list.length ? (<>
            <b className="cw-title">{checkupSummary(counts.fixed, counts.skipped, counts.seen)}</b>
            <p className="cw-detail">{counts.gone ? `${counts.gone} more went with the palettes taken out. ` : ""}Check again to see the project as it is now.</p>
          </>) : (<>
            <b className="cw-title">Nothing to fix</b>
            <p className="cw-detail">{hiddenNotes ? `${hiddenNotes} note${hiddenNotes === 1 ? "" : "s"} with nothing to do (turn on Show notes too to see them).` : "GB Studio should be happy with this project."}</p>
          </>)}
        </div>
      )}
    </Dialog>
  );
}
