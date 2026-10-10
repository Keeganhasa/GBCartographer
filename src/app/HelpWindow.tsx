import { Info, Keyboard } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Dialog, Kbd } from "../ui/kit";
import { TOOLS } from "./tools";
import "./HelpWindow.css";

/** One line of help: an optional icon, the name, its keys, and what it does. */
function Row({ icon, name, keys = [], children }: { icon?: ReactNode; name: string; keys?: string[]; children: ReactNode }) {
  return (
    <div className="hp-row">
      <span className="hp-icon">{icon}</span>
      <b>{name}</b>
      <span className="hp-keys">{keys.map((key) => <Kbd key={key}>{key}</Kbd>)}</span>
      <p>{children}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="hp-section"><h3 className="k-eyebrow">{title}</h3><div className="hp-rows">{children}</div></section>;
}

/** The ? window: every tool with its key and the long explanation, the other keys, and what Save writes. */
export function HelpWindow({ onClose, onAbout }: { onClose: () => void; onAbout: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} wide tall title="Tools and keys" icon={<Keyboard size={18} />}
      headExtra={<Button variant="ghost" size="sm" icon={<Info />} onClick={onAbout}>About · v{__APP_VERSION__}</Button>}>
      <div className="k-stack k-stack--loose">
        <Section title="Tools">
          {TOOLS.map(([id, label, Icon, keys, , long]) => <Row key={id} icon={<Icon size={16} />} name={label} keys={[keys]}>{long}</Row>)}
        </Section>
        <Section title="While painting">
          <Row name="Shades" keys={["1–4", "0"]}>Pick a shade. 0 is see-through, in a picture that has see-through pixels.</Row>
          <Row name="Brush size" keys={["[", "]"]}>Smaller or bigger: pixels, or tiles with the palette brush.</Row>
          <Row name="Mirror" keys={["Shift+M"]}>Paint both halves at once: off, left-right, top-bottom, both.</Row>
          <Row name="Linked tiles" keys={["K"]}>Painting a tile paints every identical copy of it too (one-color tiles aren't linked). One undo step per stroke.</Row>
          <Row name="Seamless view">The tile under the pointer (or the selection) repeated 3 × 3 above the picture, to check that it tiles cleanly.</Row>
        </Section>
        <Section title="Selection">
          <Row name="Copy, cut, paste" keys={["Ctrl+C", "Ctrl+X", "Ctrl+V"]}>Work on the selection.</Row>
          <Row name="Select all" keys={["Ctrl+A"]}>Selects the whole picture.</Row>
          <Row name="Drop it" keys={["Esc"]}>Drops the selection.</Row>
          <Row name="Flip, turn" keys={["F", "Shift+F", "T"]}>Flip the selection (or the whole picture) left-right or top-bottom; turn the selection clockwise.</Row>
          <Row name="Saved stamps" keys={["Right-click"]}>Right-click inside a selection to use it as the stamp, or to save it as a stamp in the project's Cartographer/stamps folder (with its tile palettes, on whole tiles). The Stamp tool shows the saved ones above the picture; the Stamps folder in the project panel opens one to edit.</Row>
        </Section>
        <Section title="Files and undo">
          <Row name="Open, save, export" keys={["Ctrl+O", "Ctrl+S", "Ctrl+E"]}>Open PNGs, save, export a copy.</Row>
          <Row name="Undo, redo" keys={["Ctrl+Z", "Ctrl+Shift+Z"]}>Undo also brings back palette colors changed in the sidebar.</Row>
          <Row name="Zoom" keys={["Ctrl+=", "Ctrl+-"]}>Zoom in and out.</Row>
        </Section>
        <Section title="Tabs">
          <Row name="Next, previous" keys={["Ctrl+Tab", "Ctrl+PgDn", "Ctrl+PgUp"]}>The next and previous picture (Shift+Ctrl+Tab goes back).</Row>
          <Row name="Close" keys={["Alt+W"]}>Closes the picture (Ctrl+W too, in the desktop app).</Row>
        </Section>
        <section className="hp-section">
          <h3 className="k-eyebrow">What Save writes</h3>
          <div className="k-well hp-save">
            <p>Into a GB Studio project, Save writes only:</p>
            <ul>
              <li>the PNG (same size, or the new size after Resize), and a new PNG from New</li>
              <li>a background's tile palettes (<code>tileColors</code>) and a sprite sheet's slice palettes (<code>paletteIndex</code>)</li>
              <li>palette files from the palette manager</li>
              <li>when you put a palette in a slot: the scene's palette list or the project's default palettes</li>
            </ul>
            <p className="k-muted">Nothing else. The old file is backed up first (Backups… in the project menu).</p>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
