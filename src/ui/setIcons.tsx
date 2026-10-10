/**
 * Icons from two other MIT sets, picked in the icon reviews (2026-10-10), copied here as plain paths:
 * - Pixelarticons by Gerrit Halfmann (MIT, https://github.com/halfmage/pixelarticons): Px… icons, drawn on a
 *   24-unit pixel grid. They render crisp at 12, 18 (on a 2x screen) or 24 px.
 * - Phosphor Icons by Phosphor Icons (MIT, https://github.com/phosphor-icons/core): Ph… icons, regular weight.
 * Their licence texts ship in public/licenses/. Each takes lucide's `size` prop, so they sit in the same lists.
 */

function Icon({ size = 24, box, pixel, flip, paths }: { size?: number | string; box: number; pixel?: boolean; /** Mirrored left-right. */ flip?: boolean; paths: string[] }) {
  // Pixel icons snap to a multiple of 6 px (17 becomes 18), so their 2-unit pixels land on whole screen pixels.
  if (pixel && typeof size === "number") size = Math.max(12, Math.round(size / 6) * 6);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox={`0 0 ${box} ${box}`} fill="currentColor" shapeRendering={pixel ? "crispEdges" : undefined} aria-hidden="true">
      <g transform={flip ? `translate(${box} 0) scale(-1 1)` : undefined}>{paths.map((d) => <path key={d} d={d} />)}</g>
    </svg>
  );
}


/** Pixelarticons: hand (Pan tool). */
export function PxHand({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M21 7h2v5h-2zm-4-2h2v7h-2zm-4-2h2v8h-2zM9 3h2v8H9zM5 5h2v8H5zm14 0h2v2h-2zm-4-2h2v2h-2zm-4-2h2v2h-2zM7 3h2v2H7zm-4 8h2v2H3zm-2 2h2v2H1zm0 2h2v2H1zm2 2h2v2H3zm2 2h2v2H5zm2 2h12v2H7zm12-2h2v2h-2zm2-7h2v7h-2zM5 13h2v2H5zm2 2h2v2H7z"]} />;
}

/** Pixelarticons: gamepad (Game Boy screens), mirrored left-right. */
export function PxGamepad({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel flip paths={["M4 4h16v2H4zm0 14h16v2H4zM2 6h2v12H2zm18 0h2v12h-2zM8 9h2v6H8z", "M6 11h6v2H6zm8-2h2v2h-2zm2 4h2v2h-2z"]} />;
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

/** Pixelarticons: message (UI (dialogue frame)); no longer used, kept for the review pages. */
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

/** Pixelarticons: message-reply (UI (dialogue frame), mirrored left-right). */
export function PxMessageReply({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel flip paths={["M4 18h2v2H4v2H2V4h2v14Zm6 0H6v-2h4v2Zm6-6h4v2h-4v4h-2v-2h-2v-2h-2v-2h2v-2h2V8h2v4Zm6 4h-2v-2h2v2Zm0-6h-2V4h2v6Zm-2-6H4V2h16v2Z"]} />;
}

/** Pixelarticons: robot-face-happy (Wizards). */
export function PxRobotHappy({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M4 6h16v2H4zm0 14h16v2H4zM2 8h2v12H2zm18 0h2v12h-2z", "M11 4h2v4h-2zm-3 6h2v2H8zm6 0h2v2h-2zm-1-8h4v2h-4zM0 12h2v2H0zm22 0h2v2h-2zM7 14h10v2H7zm2 2h6v2H9z"]} />;
}

/** Pixelarticons: lightbulb (Help). */
export function PxLightbulb({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M9 4h6v2H9zM7 6h2v2H7zm8 0h2v2h-2zm4-2h2v2h-2zm2-2h2v2h-2zM0 10h3v2H0zm21 0h3v2h-3zM3 4h2v2H3zM1 2h2v2H1zm6 12h2v2H7zm8 0h2v2h-2zM5 8h2v6H5zm12 0h2v6h-2zm-8 8h6v2H9zm0 4h6v2H9zm0-2h2v2H9zm4 0h2v2h-2zM11 0h2v3h-2z"]} />;
}

/** Pixelarticons: cloud-moon (the Day / Night / Sunset wizard). */
export function PxCloudMoon({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M14 22H4v-2h10v2ZM4 20H2v-4h2v4Zm12 0h-2v-4h2v4Zm-6-2H8v-2h2v2Zm-2-2H4v-2h4v2Zm6 0h-2v-2h2v2Zm6 0h-2v-2h2v2Zm-8-2H8v-2h4v2Zm10 0h-2v-4h-2V8h2V6h2v8Zm-4-2h-4v-2h4v2ZM8 10H6V6h2v4Zm6 0h-2V6h2v4Zm-4-4H8V4h2v2Zm8-2h-2v2h-2V4h-4V2h8v2Z"]} />;
}

/** Pixelarticons: heart (Project health). */
export function PxHeart({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M13 22h-2v-2h2v2Zm-2-2H9v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H7v-2h2v2Zm8 0h-2v-2h2v2ZM7 16H5v-2h2v2Zm12 0h-2v-2h2v2ZM5 14H3v-2h2v2Zm16 0h-2v-2h2v2ZM3 12H1V6h2v6Zm20 0h-2V6h2v6ZM13 8h-2V6h2v2ZM5 6H3V4h2v2Zm6 0H9V4h2v2Zm4 0h-2V4h2v2Zm6 0h-2V4h2v2ZM9 4H5V2h4v2Zm10 0h-4V2h4v2Z"]} />;
}

/** Pixelarticons: snake (the mascot on empty screens). */
export function PxSnake({ size }: { size?: number | string }) {
  return <Icon size={size} box={24} pixel paths={["M4 20H20V22H2V18H4V20ZM8 8H12V12H14V4H16V12H18V16H20V8H22V20H20V18H4V14H6V16H16V14H6V12H10V10H6V8H4V6H6V4H8V8ZM4 10H2V8H4V10ZM4 6H2V4H4V6ZM12 6H10V4H8V2H14V4H12V6Z"]} />;
}

/** Phosphor: sticker (Stamp tool and saved stamps). */
export function PhSticker({ size }: { size?: number | string }) {
  return <Icon size={size} box={256} paths={["M168,32H88A56.06,56.06,0,0,0,32,88v80a56.06,56.06,0,0,0,56,56h48a8.07,8.07,0,0,0,2.53-.41c26.23-8.75,76.31-58.83,85.06-85.06A8.07,8.07,0,0,0,224,136V88A56.06,56.06,0,0,0,168,32ZM48,168V88A40,40,0,0,1,88,48h80a40,40,0,0,1,40,40v40H184a56.06,56.06,0,0,0-56,56v24H88A40,40,0,0,1,48,168Zm96,35.14V184a40,40,0,0,1,40-40h19.14C191,163.5,163.5,191,144,203.14Z"]} />;
}

/** Phosphor: piggy-bank (tile budget view). */
export function PhPiggyBank({ size }: { size?: number | string }) {
  return <Icon size={size} box={256} paths={["M192,116a12,12,0,1,1-12-12A12,12,0,0,1,192,116ZM152,64H112a8,8,0,0,0,0,16h40a8,8,0,0,0,0-16Zm96,48v32a24,24,0,0,1-24,24h-2.36l-16.21,45.38A16,16,0,0,1,190.36,224H177.64a16,16,0,0,1-15.07-10.62L160.65,208h-57.3l-1.92,5.38A16,16,0,0,1,86.36,224H73.64a16,16,0,0,1-15.07-10.62L46,178.22a87.69,87.69,0,0,1-21.44-48.38A16,16,0,0,0,16,144a8,8,0,0,1-16,0,32,32,0,0,1,24.28-31A88.12,88.12,0,0,1,112,32H216a8,8,0,0,1,0,16H194.61a87.93,87.93,0,0,1,30.17,37c.43,1,.85,2,1.25,3A24,24,0,0,1,248,112Zm-16,0a8,8,0,0,0-8-8h-3.66a8,8,0,0,1-7.64-5.6A71.9,71.9,0,0,0,144,48H112A72,72,0,0,0,58.91,168.64a8,8,0,0,1,1.64,2.71L73.64,208H86.36l3.82-10.69A8,8,0,0,1,97.71,192h68.58a8,8,0,0,1,7.53,5.31L177.64,208h12.72l18.11-50.69A8,8,0,0,1,216,152h8a8,8,0,0,0,8-8Z"]} />;
}

/** Phosphor: puzzle-piece (tilesets). */
export function PhPuzzlePiece({ size }: { size?: number | string }) {
  return <Icon size={size} box={256} paths={["M220.27,158.54a8,8,0,0,0-7.7-.46,20,20,0,1,1,0-36.16A8,8,0,0,0,224,114.69V72a16,16,0,0,0-16-16H171.78a35.36,35.36,0,0,0,.22-4,36.11,36.11,0,0,0-11.36-26.24,36,36,0,0,0-60.55,23.62,36.56,36.56,0,0,0,.14,6.62H64A16,16,0,0,0,48,72v32.22a35.36,35.36,0,0,0-4-.22,36.12,36.12,0,0,0-26.24,11.36,35.7,35.7,0,0,0-9.69,27,36.08,36.08,0,0,0,33.31,33.6,35.68,35.68,0,0,0,6.62-.14V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V165.31A8,8,0,0,0,220.27,158.54ZM208,208H64V165.31a8,8,0,0,0-11.43-7.23,20,20,0,1,1,0-36.16A8,8,0,0,0,64,114.69V72h46.69a8,8,0,0,0,7.23-11.43,20,20,0,1,1,36.16,0A8,8,0,0,0,161.31,72H208v32.23a35.68,35.68,0,0,0-6.62-.14A36,36,0,0,0,204,176a35.36,35.36,0,0,0,4-.22Z"]} />;
}
