import { FolderOpen, FolderTree, Gamepad2 } from "lucide-react";
import { Button, Chip, Kbd } from "../ui/kit";
import "./StartScreen.css";

/** The splash without a project (dev server or desktop app): open a project, the demo, PNG files, or a recent project. It fills the window. */
export function StartScreen({ recent, onChooseProject, onDemo, onOpenFiles, onOpenRecent, onAbout }: { recent: { name: string; path: string }[]; onChooseProject: () => void; onDemo: () => void; onOpenFiles: () => void; onOpenRecent: (path: string) => void; onAbout: () => void }) {
  return (
    <div className="ss-splash k">
      <img className="ss-icon" src={`${import.meta.env.BASE_URL}app-icon.png`} alt="" width={88} height={88} />
      <div className="ss-title">
        <h1>GB Cartographer <Chip tone="acc">ALPHA</Chip></h1>
        <p className="k-muted">A pixel painter for GB Studio projects</p>
        <p className="k-muted k-small ss-alpha">An alpha release: expect bugs. Save writes into your GB Studio project, so keep it backed up and close GB Studio while you work.</p>
      </div>
      <div className="ss-cards">
        {/* The first card is the main way in, so it's lit like a picked card. */}
        <button type="button" className="k-card k-card--button ss-card ss-card--main" onClick={onChooseProject}><span className="ss-ic"><FolderTree size={18} /></span><b>Open a project</b><span>The folder with the .gbsproj file. Backgrounds, sprites, tilesets and fonts open here and save back.</span></button>
        <button type="button" className="k-card k-card--button ss-card" onClick={onDemo}><span className="ss-ic"><Gamepad2 size={18} /></span><b>Try the demo</b><span>A small project with CC0 and MIT art, credited inside. Opens a copy you can paint in.</span></button>
        <button type="button" className="k-card k-card--button ss-card" onClick={onOpenFiles}><span className="ss-ic"><FolderOpen size={18} /></span><b>Open PNG files</b><span>Any Game Boy picture on its own. Drop files anywhere, or paste from the clipboard.</span><span className="ss-keys"><Kbd>Ctrl+O</Kbd></span></button>
      </div>
      {recent.length > 0 && (
        <div className="ss-recent">
          <span className="k-eyebrow ss-recent-head">Recent</span>
          {recent.map((item) => <button type="button" key={item.path} className="ss-row" title={item.path} onClick={() => onOpenRecent(item.path)}><b>{item.name}</b><span className="k-muted k-xs">{item.path}</span></button>)}
        </div>
      )}
      <p className="k-muted k-xs ss-foot">Save writes only the PNG, tile and slice palettes, palette files and palette slots into your project. The old file is kept in Backups.</p>
      <Button variant="ghost" size="sm" onClick={onAbout}>About GB Cartographer · {__APP_VERSION__}</Button>
    </div>
  );
}
