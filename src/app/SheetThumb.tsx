import { useEffect, useRef } from "react";

export interface SheetCell { file: string; x: number; y: number; w: number; h: number }

/** One picture's thumbnail, cut from its folder's preview sheet (one image for a whole folder of cards). */
export function SheetThumb({ sheet, cell }: { sheet: HTMLImageElement; cell: SheetCell }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    Object.assign(target, { width: cell.w, height: cell.h });
    const context = target.getContext("2d")!;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, cell.w, cell.h);
    context.drawImage(sheet, cell.x, cell.y, cell.w, cell.h, 0, 0, cell.w, cell.h);
  }, [sheet, cell.x, cell.y, cell.w, cell.h]);
  return <canvas ref={canvas} className="gbp-asset-thumb" aria-hidden="true" />;
}
