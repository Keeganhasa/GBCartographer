import { Bug, CodeXml, ExternalLink, Info, RefreshCw } from "lucide-react";
import { useState } from "react";
import { GB_STUDIO } from "../gb/compat";
import { Button, Chip, Dialog } from "../ui/kit";
import { LogoMark } from "../ui/LogoMark";
import "./AboutWindow.css";

const REPO = "https://github.com/Keeganhasa/GBCartographer";

/** Every licence that ships with the app: what, and whose and under which licence. */
const LICENCES: [string, string][] = [
  ["GB Cartographer", "MIT license. The logo and app icon are the author's own pixel art, CC0."],
  ["Inter", "The Inter Project Authors (Rasmus Andersson), SIL Open Font License 1.1."],
  ["JetBrains Mono", "JetBrains, SIL Open Font License 1.1."],
  ["Public Pixel", "GGBotNet, CC0."],
  ["OpenDyslexic", "Abbie Gonzalez, SIL Open Font License 1.1. Downloaded the first time you turn it on."],
  ["Demo project", "Art by Raptorspank (CC0) and the GB Studio Community Assets authors (MIT), credited in the demo's CREDITS.md."],
  ["Libraries", "React (MIT) and lucide icons (ISC). The desktop app runs on Electron (MIT)."],
  ["More icons", "A few from Pixelarticons by Gerrit Halfmann and from Phosphor Icons, both MIT. Their licences are in the app's licenses folder."],
];

/** "0.1.0-alpha.1" → comparable parts; a release without a pre-release suffix sorts after its pre-releases. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => { const [core, pre] = value.replace(/^v/, "").split("-", 2); return { core: core.split(".").map(Number), pre: pre ?? null }; };
  const x = parse(a), y = parse(b);
  for (let at = 0; at < 3; at += 1) if ((x.core[at] ?? 0) !== (y.core[at] ?? 0)) return (x.core[at] ?? 0) - (y.core[at] ?? 0);
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre.localeCompare(y.pre, undefined, { numeric: true });
}

const open = (url: string) => window.open(url, "_blank", "noreferrer");

/** About GB Cartographer: the version, where to report bugs, and every licence that ships with the app. */
export function AboutWindow({ onClose }: { onClose: () => void }) {
  const [update, setUpdate] = useState<{ state: "idle" | "checking" | "done"; text?: string; url?: string }>({ state: "idle" });
  /** Asks GitHub for the latest release, only when the user clicks (no automatic calls). */
  async function check() {
    setUpdate({ state: "checking" });
    try {
      const response = await fetch("https://api.github.com/repos/Keeganhasa/GBCartographer/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
      if (response.status === 404) return setUpdate({ state: "done", text: "No releases yet: this is the newest there is." });
      if (!response.ok) throw new Error(response.statusText);
      const release = await response.json() as { tag_name?: string; html_url?: string };
      const tag = release.tag_name ?? "";
      if (tag && compareVersions(tag, __APP_VERSION__) > 0) setUpdate({ state: "done", text: `Version ${tag.replace(/^v/, "")} is out.`, url: release.html_url });
      else setUpdate({ state: "done", text: `You have the newest version (${__APP_VERSION__}).` });
    } catch (error) {
      setUpdate({ state: "done", text: `Could not check: ${(error as Error).message || "no connection"}.` });
    }
  }
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }} title="About" icon={<Info size={18} />}>
      <div className="k-stack k-stack--loose">
        <div className="ab-hero">
          <LogoMark size={48} />
          <div className="ab-hero-text">
            <h1>GB Cartographer <Chip tone="acc">ALPHA</Chip></h1>
            <span className="k-small">Version {__APP_VERSION__} · a pixel painter and palette companion for GB Studio projects</span>
            <span className="k-muted k-small">Follows GB Studio {GB_STUDIO.latest}. Reads projects from GB Studio {GB_STUDIO.oldest} to {GB_STUDIO.latest} (file format {GB_STUDIO.format.version}, release {GB_STUDIO.format.release}).</span>
          </div>
        </div>
        <div className="k-row ab-links">
          <Button icon={<CodeXml />} onClick={() => open(REPO)}>Source code</Button>
          <Button icon={<Bug />} onClick={() => open(`${REPO}/issues`)}>Report a bug or ask for a feature</Button>
        </div>
        <div className="k-row ab-update">
          <Button size="sm" icon={<RefreshCw />} disabled={update.state === "checking"} title="Asks GitHub for the latest release (only when you click)" onClick={() => void check()}>{update.state === "checking" ? "Checking…" : "Check for updates"}</Button>
          {update.text && <span className="k-small">{update.text}</span>}
          {update.url && <Button size="sm" variant="primary" icon={<ExternalLink />} onClick={() => open(update.url!)}>Get it</Button>}
        </div>
        <div className="k-stack k-stack--tight">
          <span className="k-eyebrow">Licences</span>
          <dl className="k-well ab-licences">
            {LICENCES.map(([what, licence]) => <div key={what}><dt>{what}</dt><dd>{licence}</dd></div>)}
          </dl>
        </div>
        <p className="k-muted k-small ab-note">GB Studio is by Chris Maltby and contributors. GB Cartographer is not affiliated with GB Studio or Nintendo.</p>
      </div>
    </Dialog>
  );
}
