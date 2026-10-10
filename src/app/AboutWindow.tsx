import { X } from "lucide-react";
import { LogoMark } from "../ui/LogoMark";

const REPO = "https://github.com/Keeganhasa/GBCartographer";

/** About GB Cartographer: the version, where to report bugs, and every licence that ships with the app. */
export function AboutWindow({ onClose }: { onClose: () => void }) {
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
            </div>
          </div>
          <p><a href={REPO} target="_blank" rel="noreferrer">Source code on GitHub</a> · <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">Report a bug or ask for a feature</a></p>
          <table>
            <tbody>
              <tr><td><b>GB Cartographer</b></td><td>MIT license. The logo and app icon are the author's own pixel art, CC0.</td></tr>
              <tr><td><b>Inter</b></td><td>The Inter Project Authors (Rasmus Andersson), SIL Open Font License 1.1.</td></tr>
              <tr><td><b>JetBrains Mono</b></td><td>JetBrains, SIL Open Font License 1.1.</td></tr>
              <tr><td><b>Public Pixel</b></td><td>GGBotNet, CC0.</td></tr>
              <tr><td><b>OpenDyslexic</b></td><td>Abbie Gonzalez, SIL Open Font License 1.1 (downloaded the first time it is turned on).</td></tr>
              <tr><td><b>Demo project</b></td><td>Art by Raptorspank (CC0) and the GB Studio Community Assets authors (MIT), credited in the demo's CREDITS.md.</td></tr>
              <tr><td><b>Libraries</b></td><td>React and lucide icons (MIT, ISC); the desktop app runs on Electron (MIT).</td></tr>
            </tbody>
          </table>
          <p className="gbp-note">GB Studio is by Chris Maltby and contributors. GB Cartographer is not affiliated with GB Studio or Nintendo.</p>
        </div>
      </div>
    </div>
  );
}
