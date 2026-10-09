/**
 * Minimal PNG codec for build scripts and tests (the browser uses canvas instead).
 * Decodes non-interlaced 8-bit gray/RGB/RGBA/gray-alpha and 1-8 bit indexed images; encodes 8-bit RGBA.
 * Compression is injected so this module stays free of Node imports.
 */
export interface DecodedPng {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

type Codec = (data: Uint8Array) => Uint8Array;

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

export function decodePng(bytes: Uint8Array, inflate: Codec): DecodedPng {
  if (SIGNATURE.some((value, index) => bytes[index] !== value)) throw new Error("Not a PNG file.");
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const data: Uint8Array[] = [];
  while (offset < bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readUint32(chunk, 0); height = readUint32(chunk, 4);
      bitDepth = chunk[8]; colorType = chunk[9]; interlace = chunk[12];
    } else if (type === "PLTE") palette = chunk;
    else if (type === "tRNS") transparency = chunk;
    else if (type === "IDAT") data.push(chunk);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (interlace) throw new Error("Interlaced PNGs are not supported.");
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (!channels || (colorType !== 3 && bitDepth !== 8)) throw new Error(`Unsupported PNG format (type ${colorType}, depth ${bitDepth}).`);
  const bitsPerPixel = channels * bitDepth;
  const stride = Math.ceil(width * bitsPerPixel / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const joined = new Uint8Array(data.reduce((sum, chunk) => sum + chunk.length, 0));
  data.reduce((position, chunk) => { joined.set(chunk, position); return position + chunk.length; }, 0);
  const raw = inflate(joined);
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= bpp ? rows[y * stride + x - bpp] : 0;
      const up = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const upLeft = x >= bpp && y > 0 ? rows[(y - 1) * stride + x - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      rows[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4;
      const row = y * stride;
      if (colorType === 3) {
        const bit = x * bitDepth;
        const index = (rows[row + (bit >> 3)] >> (8 - bitDepth - (bit & 7))) & ((1 << bitDepth) - 1);
        pixels.set([palette![index * 3], palette![index * 3 + 1], palette![index * 3 + 2], transparency?.[index] ?? 255], out);
      } else {
        const p = row + x * channels;
        if (colorType === 0) pixels.set([rows[p], rows[p], rows[p], 255], out);
        else if (colorType === 4) pixels.set([rows[p], rows[p], rows[p], rows[p + 1]], out);
        else if (colorType === 2) pixels.set([rows[p], rows[p + 1], rows[p + 2], 255], out);
        else pixels.set([rows[p], rows[p + 1], rows[p + 2], rows[p + 3]], out);
      }
    }
  }
  return { width, height, pixels };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set([...type].map((char) => char.charCodeAt(0)), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(pixels: Uint8ClampedArray, width: number, height: number, deflate: Codec): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const parts = [new Uint8Array(SIGNATURE), chunk("IHDR", header), chunk("IDAT", deflate(raw)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((position, part) => { out.set(part, position); return position + part.length; }, 0);
  return out;
}
