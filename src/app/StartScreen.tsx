import { FolderOpen, FolderTree, Star } from "lucide-react";

/** The splash without a project (dev server or desktop app): open a project, the demo, PNG files, or a recent project. It fills the window. */
export function StartScreen({ recent, onChooseProject, onDemo, onOpenFiles, onOpenRecent, onAbout }: { recent: { name: string; path: string }[]; onChooseProject: () => void; onDemo: () => void; onOpenFiles: () => void; onOpenRecent: (path: string) => void; onAbout: () => void }) {
  return (
    <div className="gbp-start">
      <img className="gbp-start-icon" src={`${import.meta.env.BASE_URL}app-icon.png`} alt="" width={96} height={96} />
      <h1>GB Cartographer</h1>
      <p className="gbp-start-sub">A pixel painter for GB Studio projects <span className="gbp-alpha">Alpha</span></p>
      <p className="gbp-start-alpha">This is an alpha release: expect bugs. Save writes into your GB Studio project, so keep it backed up and close GB Studio while you work.</p>
      <div className="gbp-start-cards">
        <button className="gbp-start-card primary" onClick={onChooseProject}><span className="gbp-start-ic"><FolderTree size={18} /></span><b>Open a GB Studio project</b><span>The folder with the .gbsproj file. Backgrounds, sprites, tilesets and fonts open here and save back.</span></button>
        <button className="gbp-start-card" onClick={onDemo}><span className="gbp-start-ic"><Star size={18} /></span><b>Try the demo</b><span>A small project with CC0 and MIT art, credited inside. Opens a copy you can paint in.</span></button>
        <button className="gbp-start-card" onClick={onOpenFiles}><span className="gbp-start-ic"><FolderOpen size={18} /></span><b>Open PNG files</b><span>Any Game Boy picture on its own. Drop files anywhere, or paste from the clipboard.</span><kbd>Ctrl+O</kbd></button>
      </div>
      {recent.length > 0 && (
        <div className="gbp-start-recent">
          <span className="eyebrow">Recent</span>
          {recent.map((item) => <button key={item.path} className="gbp-start-row" title={item.path} onClick={() => onOpenRecent(item.path)}><b>{item.name}</b><small>{item.path}</small></button>)}
        </div>
      )}
      <p className="gbp-start-foot">Save writes only the PNG, tile and slice palettes, palette files and palette slots into your project. The old file is kept in Backups.</p>
      <button className="gbp-start-about" onClick={onAbout}>About GB Cartographer · version {__APP_VERSION__}</button>
    </div>
  );
}
