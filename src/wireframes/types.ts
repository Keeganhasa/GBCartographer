/**
 * The shape of a wireframe library asset. The library itself (tiles, sprites, scenes, the catalog) stays on the
 * author's machines until its art is approved (2026-10-10: only palettes ship to GitHub); the Store shows its
 * Wireframes aisle only when src/wireframes/library.ts is there.
 */
import type { AssetKind } from "../app/model";
import type { Canvas } from "./pen";

export interface WireAsset {
  id: string; name: string; group: string; kind: AssetKind;
  /** What it is for, and how GB Studio reads it. */
  about?: string;
  make: () => Canvas;
}
