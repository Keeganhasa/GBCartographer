/**
 * The saved stamps of the open project (Cartographer/stamps/), above the picture while the Stamp tool is in hand:
 * click one to pick it up; the pencil in its corner (on hover) opens it for editing (the author, 2026-10-10: using
 * is the main thing, editing the exception).
 */
import { Pencil } from "lucide-react";
import { useState } from "react";
import { ASSET_URL, PREVIEW_VERSION, type Asset } from "./model";

interface Props {
  stamps: Asset[];
  /** Bumped when palette slots change, so the thumbnails are drawn again. */
  slotsVersion: number;
  onUse: (stamp: Asset) => void;
  onOpen: (stamp: Asset) => void;
}

export function StampsStrip({ stamps, slotsVersion, onUse, onOpen }: Props) {
  const [tag, setTag] = useState<string | null>(null);
  const tags = [...new Set(stamps.flatMap((stamp) => stamp.tags ?? []))];
  const shown = tag ? stamps.filter((stamp) => stamp.tags?.includes(tag)) : stamps;
  return (
    <div className="k-card app-strip" role="group" aria-label="Saved stamps">
      <span className="app-strip-label">Saved stamps</span>
      {tags.length > 0 && <div className="app-strip-tags" role="group" aria-label="Filter by tag">
        <button type="button" className="k-btn k-btn--sm" aria-pressed={tag === null} onClick={() => setTag(null)}>All</button>
        {tags.map((item) => <button key={item} type="button" className="k-btn k-btn--sm" aria-pressed={tag === item} onClick={() => setTag(tag === item ? null : item)}>{item}</button>)}
      </div>}
      <div className="app-frames">
        {shown.map((stamp) => (
          <span key={stamp.file} className="app-stamp">
            <button className="app-frame named" title={`${stamp.name} · ${stamp.width} × ${stamp.height}${stamp.tags?.length ? ` · ${stamp.tags.join(", ")}` : ""} · click to use`} onClick={() => onUse(stamp)}>
              <img alt="" src={`${ASSET_URL}-preview?${new URLSearchParams({ kind: stamp.kind, file: stamp.file })}&v=${Math.round(stamp.mtime)}&pv=${PREVIEW_VERSION}&s=${slotsVersion}`} />
              <small>{stamp.name}</small>
            </button>
            <button type="button" className="app-stamp-edit" title={`Edit ${stamp.name}`} aria-label={`Edit ${stamp.name}`} onClick={(event) => { event.stopPropagation(); onOpen(stamp); }}><Pencil size={11} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}
