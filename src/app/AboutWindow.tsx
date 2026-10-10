import { X } from "lucide-react";
import { GB_STUDIO } from "../gb/compat";
import { useState } from "react";
import { LogoMark } from "../ui/LogoMark";

const REPO = "https://github.com/Keeganhasa/GBCartographer";

/** About GB Cartographer: the version, where to report bugs, and every licence that ships with the app. */
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
    <div className="gbp-modal-backdrop" onClick={onClose}>
      <div className="gbp-modal gbp-help gbp-about" role="dialog" aria-label="About GB Cartographer" onClick={(event) => event.stopPropagation()}>
        <header className="gbp-modal-head"><h2>About</h2><span className="gbp-spacer" /><button className="icon-button small" aria-label="Close" onClick={onClose}><X size={14} /></button></header>
        <div className="gbp-help-body">
          <div className="gbp-about-title">
            <LogoMark size={48} />
            <div>
              <h1>GB Cartographer <span className="gbp-alpha">Alpha</span></h1>
              <p className="gbp-note">Version {__APP_VERSION__} · a pixel painting and color palette companion app for GB Studio projects</p>
              <p className="gbp-note">Follows GB Studio {GB_STUDIO.latest}: reads projects from GB Studio {GB_STUDIO.oldest} – {GB_STUDIO.latest} (file format {GB_STUDIO.format.version}, release {GB_STUDIO.format.release}).</p>
            </div>
          </div>
          <p><a href={REPO} target="_blank" rel="noreferrer">Source code on GitHub</a> · <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">Report a bug or ask for a feature</a></p>
          <p className="gbp-about-update">
            <button className="quiet-button" disabled={update.state === "checking"} title="Asks GitHub for the latest release (only when you click)" onClick={() => void check()}>{update.state === "checking" ? "Checking…" : "Check for updates"}</button>
            {update.text && <span>{update.text} {update.url && <a href={update.url} target="_blank" rel="noreferrer">Get it</a>}</span>}
          </p>
          <table>
            <tbody>
              <tr><td><b>GB Cartographer</b></td><td>MIT license. The logo and app icon are the author's own pixel art, CC0.</td></tr>
              <tr><td><b>Inter</b></td><td>The Inter Project Authors (Rasmus Andersson), SIL Open Font License 1.1.</td></tr>
              <tr><td><b>JetBrains Mono</b></td><td>JetBrains, SIL Open Font License 1.1.</td></tr>
              <tr><td><b>Public Pixel</b></td><td>GGBotNet, CC0.</td></tr>
              <tr><td><b>OpenDyslexic</b></td><td>Abbie Gonzalez, SIL Open Font License 1.1 (downloaded the first time it is turned on).</td></tr>
              <tr><td><b>Demo project</b></td><td>Art by Raptorspank (CC0) and the GB Studio Community Assets authors (MIT), credited in the demo's CREDITS.md.</td></tr>
              <tr><td><b>Libraries</b></td><td>React and lucide icons (MIT, ISC); the desktop app runs on Electron (MIT).</td></tr>
              <tr><td><b>More icons</b></td><td>A few icons from Pixelarticons by Gerrit Halfmann and from Phosphor Icons, both MIT (licences in the app's licenses folder).</td></tr>
            </tbody>
          </table>
          <p className="gbp-note">GB Studio is by Chris Maltby and contributors. GB Cartographer is not affiliated with GB Studio or Nintendo.</p>
        </div>
      </div>
    </div>
  );
}
