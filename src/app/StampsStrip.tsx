/**
 * The saved stamps of the open project (Cartographer/stamps/), above the picture while the Stamp tool is in hand:
 * click one to pick it up, double-click to open it for editing.
 */
import { ASSET_URL, PREVIEW_VERSION, type Asset } from "./model";

interface Props {
  stamps: Asset[];
  /** Bumped when palette slots change, so the thumbnails are drawn again. */
  slotsVersion: number;
  onUse: (stamp: Asset) => void;
  onOpen: (stamp: Asset) => void;
}

export function StampsStrip({ stamps, slotsVersion, onUse, onOpen }: Props) {
  return (
    <div className="k-card app-strip" role="group" aria-label="Saved stamps">
      <span className="app-strip-label">Saved stamps</span>
      <div className="app-frames">
        {stamps.map((stamp) => (
          <button key={stamp.file} className="app-frame named" title={`${stamp.name} · ${stamp.width} × ${stamp.height} · click to use, double-click to edit`} onClick={() => onUse(stamp)} onDoubleClick={() => onOpen(stamp)}>
            <img alt="" src={`${ASSET_URL}-preview?${new URLSearchParams({ kind: stamp.kind, file: stamp.file })}&v=${Math.round(stamp.mtime)}&pv=${PREVIEW_VERSION}&s=${slotsVersion}`} />
            <small>{stamp.name}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
