/**
 * Icons from two other MIT sets, picked in the icon reviews (2026-10-10), copied here as plain paths:
 * - Pixelarticons by Gerrit Halfmann (MIT, https://github.com/halfmage/pixelarticons): Px… icons, drawn on a
 *   24-unit pixel grid. They render crisp at 12, 18 (on a 2x screen) or 24 px.
 * - Phosphor Icons by Phosphor Icons (MIT, https://github.com/phosphor-icons/core): Ph… icons, regular weight.
 * Their licence texts ship in public/licenses/. Each takes lucide's `size` prop, so they sit in the same lists.
 */

function Icon({ size = 24, box, pixel, paths }: { size?: number | string; box: number; pixel?: boolean; paths: string[] }) {
  // Pixel icons snap to a multiple of 6 px (17 becomes 18), so their 2-unit pixels land on whole screen pixels.
  if (pixel && typeof size === "number") size = Math.max(12, Math.round(size / 6) * 6);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox={`0 0 ${box} ${box}`} fill="currentColor" shapeRendering={pixel ? "crispEdges" : undefined} aria-hidden="true">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}


/** Pixelarticons: hand (Pan tool). */
export function PxHand({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M21 7h2v5h-2zm-4-2h2v7h-2zm-4-2h2v8h-2zM9 3h2v8H9zM5 5h2v8H5zm14 0h2v2h-2zm-4-2h2v2h-2zm-4-2h2v2h-2zM7 3h2v2H7zm-4 8h2v2H3zm-2 2h2v2H1zm0 2h2v2H1zm2 2h2v2H3zm2 2h2v2H5zm2 2h12v2H7zm12-2h2v2h-2zm2-7h2v7h-2zM5 13h2v2H5zm2 2h2v2H7z"]} />;
}

/** Pixelarticons: gamepad (Game Boy screens). */
export function PxGamepad({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M4 4h16v2H4zm0 14h16v2H4zM2 6h2v12H2zm18 0h2v12h-2zM8 9h2v6H8z", "M6 11h6v2H6zm8-2h2v2h-2zm2 4h2v2h-2z"]} />;
}

/** Pixelarticons: image (backgrounds). */
export function PxImage({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zm-4 8h2v2h-2zm-2 2h2v2h-2zm4 0h2v2h-2zm-8 0h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2z", "M20 16h2v2h-2zM8 16h2v2H8zm-2 2h2v2H6zM8 6h2v2H8zM6 8h2v2H6zm2 2h2v2H8zm2-2h2v2h-2z"]} />;
}

/** Pixelarticons: grid-3x2 (tilesets). */
export function PxGrid({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zM4 11h16v2H4z", "M8 4h2v16H8zm6 0h2v16h-2z"]} />;
}

/** Pixelarticons: smile (emotes). */
export function PxSmile({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M6 20h12v2H6zM6 2h12v2H6zm12 2h2v2h-2zM4 4h2v2H4zm0 14h2v2H4zm14 0h2v2h-2zM2 6h2v12H2zm18 0h2v12h-2zM7 13h2v2H7zm2 2h6v2H9zm6-2h2v2h-2zM8 8h2v2H8zm6 0h2v2h-2z"]} />;
}

/** Pixelarticons: avatar-circle (avatars). */
export function PxAvatar({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M6 2h12v2H6zm0 18h12v2H6zM2 6h2v12H2zm18 0h2v12h-2zM6 18h2v2H6zm10 0h2v2h-2zm2-14h2v2h-2zM4 4h2v2H4zm0 14h2v2H4zm14 0h2v2h-2zM8 16h8v2H8zm2-4h4v2h-4zM8 8h2v4H8zm2-2h4v2h-4zm4 2h2v4h-2z"]} />;
}

/** Pixelarticons: message (UI (dialogue frame)). */
export function PxMessage({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M20 2H4v2h16zm0 14H6v2h14zm2-12h-2v12h2zM4 4H2v18h2zm2 14H4v2h2z"]} />;
}

/** Phosphor: selection (Select tool). */
export function PhSelection({ size }: { size?: number | string }) {
  return <Icon size={size} box={256} paths={["M152,40a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h32A8,8,0,0,1,152,40Zm-8,168H112a8,8,0,0,0,0,16h32a8,8,0,0,0,0-16ZM208,32H184a8,8,0,0,0,0,16h24V72a8,8,0,0,0,16,0V48A16,16,0,0,0,208,32Zm8,72a8,8,0,0,0-8,8v32a8,8,0,0,0,16,0V112A8,8,0,0,0,216,104Zm0,72a8,8,0,0,0-8,8v24H184a8,8,0,0,0,0,16h24a16,16,0,0,0,16-16V184A8,8,0,0,0,216,176ZM40,152a8,8,0,0,0,8-8V112a8,8,0,0,0-16,0v32A8,8,0,0,0,40,152Zm32,56H48V184a8,8,0,0,0-16,0v24a16,16,0,0,0,16,16H72a8,8,0,0,0,0-16ZM72,32H48A16,16,0,0,0,32,48V72a8,8,0,0,0,16,0V48H72a8,8,0,0,0,0-16Z"]} />;
}

/** Phosphor: checkerboard (fill pattern). */
export function PhCheckerboard({ size }: { size?: number | string }) {
  return <Icon size={size} box={256} paths={["M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm-12.69,88L136,60.69V48h12.69L208,107.32V120ZM136,83.31,172.69,120H136Zm72,1.38L171.31,48H208ZM120,48v72H48V48ZM107.31,208,48,148.69V136H60.69L120,195.31V208ZM120,172.69,83.31,136H120Zm-72-1.38L84.69,208H48ZM208,208H136V136h72v72Z"]} />;
}
