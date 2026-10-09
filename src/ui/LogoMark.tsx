import { APP_LOGO, APP_LOGO_COLORS } from "./logo";

/** One rect per run of same-shade pixels in a row of a sprite grid ("." is transparent). */
export function spriteRects(rows: readonly string[], colors: readonly string[]) {
  return rows.flatMap((row, y) => {
    const rects: { x: number; y: number; width: number; fill: string }[] = [];
    for (let x = 0; x < row.length;) {
      const shade = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === shade) end += 1;
      if (shade !== ".") rects.push({ x, y, width: end - x, fill: colors[Number(shade)] });
      x = end;
    }
    return rects;
  });
}

const LOGO_RECTS = spriteRects(APP_LOGO, APP_LOGO_COLORS);
const [LOGO_W, LOGO_H] = [APP_LOGO[0].length, APP_LOGO.length];

/** The app mark: the logo drawn pixel for pixel, so it scales with hard edges. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size * LOGO_W / LOGO_H} height={size} viewBox={`0 0 ${LOGO_W} ${LOGO_H}`} shapeRendering="crispEdges" aria-hidden="true" className="logo-mark">
      {LOGO_RECTS.map((rect) => <rect key={`${rect.x},${rect.y}`} x={rect.x} y={rect.y} width={rect.width} height={1} fill={rect.fill} />)}
    </svg>
  );
}
