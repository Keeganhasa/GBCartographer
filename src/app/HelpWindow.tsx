import { X } from "lucide-react";
import { TOOLS } from "./tools";

/** The ? window: every tool with its key and the long explanation, the other keys, and what Save writes. */
export function HelpWindow({ onClose, onAbout }: { onClose: () => void; onAbout: () => void }) {
  return (
    <div className="gbp-modal-backdrop" onClick={onClose}>
      <div className="gbp-modal gbp-help" role="dialog" aria-label="Help" onClick={(event) => event.stopPropagation()}>
        <header className="gbp-modal-head"><h2>Tools and keys</h2><span className="gbp-spacer" /><button className="quiet-button" onClick={onAbout}>About · v{__APP_VERSION__}</button><button className="icon-button small" aria-label="Close" onClick={onClose}><X size={14} /></button></header>
        <div className="gbp-help-body">
          <table>
            <tbody>
              {TOOLS.map(([id, label, Icon, keys, , long]) => <tr key={id}><td><Icon size={14} /></td><td><b>{label}</b></td><td><kbd>{keys}</kbd></td><td>{long}</td></tr>)}
              <tr><td /><td><b>Mirror</b></td><td><kbd>Shift+M</kbd></td><td>Paint both halves at once: off, left-right, top-bottom, both.</td></tr>
              <tr><td /><td><b>Shades</b></td><td><kbd>1–4</kbd> <kbd>0</kbd></td><td>Pick a shade; 0 is see-through in a picture that has it.</td></tr>
              <tr><td /><td><b>Brush</b></td><td><kbd>[</kbd> <kbd>]</kbd></td><td>Smaller or bigger: pixels, or tiles with the palette brush.</td></tr>
              <tr><td /><td><b>Flip, turn</b></td><td><kbd>F</kbd> <kbd>Shift+F</kbd> <kbd>T</kbd></td><td>Flip the selection (or the whole picture) left-right or top-bottom; turn the selection clockwise.</td></tr>
              <tr><td /><td><b>Undo</b></td><td><kbd>Ctrl+Z</kbd></td><td>Undo also brings back palette colors changed in the sidebar.</td></tr>
              <tr><td /><td><b>Tabs</b></td><td><kbd>Ctrl+Tab</kbd> <kbd>Ctrl+PgDn</kbd> <kbd>Ctrl+PgUp</kbd> <kbd>Alt+W</kbd></td><td>Next and previous picture (Shift+Ctrl+Tab goes back); Alt+W closes the picture (Ctrl+W too in the desktop app).</td></tr>
              <tr><td /><td><b>Files</b></td><td><kbd>Ctrl+O</kbd> <kbd>Ctrl+S</kbd> <kbd>Ctrl+E</kbd></td><td>Open PNGs, save, export a copy. Ctrl+Z / Ctrl+Shift+Z undo and redo; Ctrl+C / X / V and Ctrl+A work on the selection; Ctrl+= / Ctrl+- zoom; Esc drops the selection.</td></tr>
            </tbody>
          </table>
          <p className="gbp-note">What Save writes into a GB Studio project: the PNG (same size), a background's tile palettes (<code>tileColors</code>), a sprite sheet's slice palettes (<code>paletteIndex</code>), palette files from the palette manager, and when you put a palette in a slot, the scene's palette list or the project's default palettes. Nothing else. The old file is backed up first (Backups… in the project menu).</p>
        </div>
      </div>
    </div>
  );
}
