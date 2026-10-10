/**
 * The Wizards gallery (2026-10-10): every wizard as a card with a thumbnail of what it makes, its name and a line on
 * what it does. A wizard that needs something first (a project, an open picture) says what, and waits.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toRgba } from "../paint";
import { Dialog } from "../ui/kit";
import { PxRobotHappy } from "../ui/setIcons";
import { wizardThumb, type WizardThumb } from "./wizardThumbs";
import "./WizardGallery.css";

export interface WizardCard {
  thumb: WizardThumb; name: string; icon: ReactNode;
  /** What it does. */
  about: string;
  /** Why it can't start yet (null: it can). */
  blocked: string | null;
  onStart: () => void;
}

function Thumb({ id }: { id: WizardThumb }) {
  const picture = useMemo(() => wizardThumb(id), [id]);
  const [target, setTarget] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!target) return;
    Object.assign(target, { width: picture.width, height: picture.height });
    const cells = picture.cells ?? new Uint8Array(Math.ceil(picture.width / 8) * Math.ceil(picture.height / 8));
    const palettes = (picture.palettes ?? []).map(({ name, colors }) => ({ name, colors }));
    target.getContext("2d")!.putImageData(new ImageData(toRgba(picture.pixels, cells, picture.width, palettes), picture.width, picture.height), 0, 0);
  }, [picture, target]);
  return <canvas ref={setTarget} className="wg-thumb" aria-hidden />;
}

export function WizardGallery({ cards, onClose }: { cards: WizardCard[]; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} wide tall title="Wizards" sub="Step-by-step helpers: pick one to start" icon={<PxRobotHappy size={18} />}>
      <div className="wg">
        {cards.map((card) => (
          <button key={card.thumb} type="button" className="k-card wg-card" disabled={Boolean(card.blocked)} title={card.blocked ?? card.about}
            onClick={() => { onClose(); card.onStart(); }}>
            <Thumb id={card.thumb} />
            <span className="wg-name">{card.icon}{card.name}</span>
            <span className="k-muted k-xs wg-about">{card.blocked ?? card.about}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
