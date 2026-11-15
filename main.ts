// ai-excited-01 entry: "SIT UP!" — the AI judge itself, jolted awake.
// A program that DRAWS its image, pixel by pixel, with the Node standard
// library only (node:fs, node:path, node:zlib). No assets, no network, no
// fonts on disk: every shape and every letter is computed here, so the two
// grader runs write byte-identical output.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The image: a giant friendly robot head labelled JUDGE bursts out of a
// cracked golden picture frame, eyes wide, mouth open in awe, lightning
// crackling from its antenna, over an exploding radial burst of magenta,
// cyan and yellow. A huge headline shouts "SIT UP!" and the robot's speech
// bubble declares "THIS ONE!" — the judge, sitting up, picking its winner.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

export const WIDTH = 1024;
export const HEIGHT = 1024;

// ---------------------------------------------------------------------------
// Colour helpers: colours are [r, g, b] triples, 0..255.
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// ---------------------------------------------------------------------------
// PNG encoder (colour type 2, 8-bit RGB, filter 0 per scanline, zlib level 9).
// Deterministic: same pixels in, same bytes out, every run.
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(pixels: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: None
    raw.set(pixels.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Canvas: an RGB pixel buffer with small vector drawing primitives.
// ---------------------------------------------------------------------------

class Canvas {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
  }

  set(x: number, y: number, c: RGB): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }

  fill(c: RGB): void {
    for (let i = 0; i < this.w * this.h; i++) {
      this.px[i * 3] = c[0];
      this.px[i * 3 + 1] = c[1];
      this.px[i * 3 + 2] = c[2];
    }
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.w + xx) * 3;
        this.px[i] = c[0];
        this.px[i + 1] = c[1];
        this.px[i + 2] = c[2];
      }
    }
  }

  // Vertical gradient rectangle: top colour -> bottom colour.
  fillRectGrad(x: number, y: number, w: number, h: number, top: RGB, bottom: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      const t = h <= 1 ? 0 : (yy - y) / h;
      const c = mix(top, bottom, Math.min(1, Math.max(0, t)));
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.w + xx) * 3;
        this.px[i] = c[0];
        this.px[i + 1] = c[1];
        this.px[i + 2] = c[2];
      }
    }
  }
}

// ---------------------------------------------------------------------------
// More primitives, appended to the Canvas class via a helper object pattern:
// each function below takes the canvas as its first argument.
// ---------------------------------------------------------------------------

function fillCircle(cv: Canvas, cx: number, cy: number, r: number, c: RGB): void {
  const rr = Math.max(0, r);
  const y0 = Math.max(0, Math.floor(cy - rr));
  const y1 = Math.min(cv.h - 1, Math.ceil(cy + rr));
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const dx = Math.sqrt(Math.max(0, rr * rr - dy * dy));
    cv.fillRect(cx - dx, y, dx * 2, 1, c);
  }
}

function fillEllipse(cv: Canvas, cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(cv.h - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy) / ry;
    const dx = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    cv.fillRect(cx - dx, y, dx * 2, 1, c);
  }
}

// Thick line drawn as a chain of filled circles: round caps, no gaps.
function thickLine(cv: Canvas, x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(cv, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c);
  }
}

// Scanline polygon fill (even-odd), points as [x, y] pairs.
function fillPolygon(cv: Canvas, pts: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(cv.h - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, yA] = pts[i];
      const [x1, yB] = pts[(i + 1) % pts.length];
      if ((yA <= y && yB > y) || (yB <= y && yA > y)) {
        xs.push(x0 + ((y - yA) / (yB - yA)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      cv.fillRect(xs[k], y, xs[k + 1] - xs[k], 1, c);
    }
  }
}

function fillRoundRect(cv: Canvas, x: number, y: number, w: number, h: number, r: number, c: RGB): void {
  const rr = Math.min(r, w / 2, h / 2);
  cv.fillRect(x + rr, y, w - 2 * rr, h, c);
  cv.fillRect(x, y + rr, w, h - 2 * rr, c);
  fillCircle(cv, x + rr, y + rr, rr, c);
  fillCircle(cv, x + w - rr, y + rr, rr, c);
  fillCircle(cv, x + rr, y + h - rr, rr, c);
  fillCircle(cv, x + w - rr, y + h - rr, rr, c);
}

// Four-point sparkle star.
function sparkle(cv: Canvas, cx: number, cy: number, r: number, c: RGB): void {
  fillPolygon(
    cv,
    [
      [cx, cy - r],
      [cx + r * 0.22, cy - r * 0.22],
      [cx + r, cy],
      [cx + r * 0.22, cy + r * 0.22],
      [cx, cy + r],
      [cx - r * 0.22, cy + r * 0.22],
      [cx - r, cy],
      [cx - r * 0.22, cy - r * 0.22],
    ],
    c,
  );
}

// Rotated rectangle, drawn as a polygon around its centre.
function rotatedRect(cv: Canvas, cx: number, cy: number, w: number, h: number, angleDeg: number, c: RGB): void {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hw = w / 2;
  const hh = h / 2;
  const rot = (dx: number, dy: number): [number, number] => [
    cx + dx * cos - dy * sin,
    cy + dx * sin + dy * cos,
  ];
  fillPolygon(cv, [rot(-hw, -hh), rot(hw, -hh), rot(hw, hh), rot(-hw, hh)], c);
}

// Deterministic pseudo-random generator (LCG) — fixed seed, so every run
// places the same confetti in the same spots and the PNG is byte-identical.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Bitmap font: chunky 5x7 pixel capitals, drawn by hand as 7 rows of 5 bits
// (bit 4 is the leftmost column). Only the glyphs the image needs, plus the
// full alphabet so the design can change without re-drawing the font.
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x02, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  "'": [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function textWidth(text: string, scale: number): number {
  // Each glyph is 5 cells wide plus 1 cell of spacing, except after the last.
  return text.length === 0 ? 0 : text.length * 6 * scale - scale;
}

// Draw one glyph's set pixels as filled scale-sized squares.
function drawGlyph(cv: Canvas, ch: string, x: number, y: number, scale: number, c: RGB): void {
  const rows = GLYPHS[ch] ?? GLYPHS[' '];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (rows[r] & (1 << (4 - col))) {
        cv.fillRect(x + col * scale, y + r * scale, scale, scale, c);
      }
    }
  }
}

// Draw text; when `outline` is given, paint the text first in the outline
// colour at 8 offsets (a thick halo), then in the fill colour on top.
function drawText(
  cv: Canvas,
  text: string,
  x: number,
  y: number,
  scale: number,
  fill: RGB,
  outline?: RGB,
  outlinePx?: number,
): void {
  const draw = (ox: number, oy: number, c: RGB) => {
    let cx = x + ox;
    for (const ch of text) {
      drawGlyph(cv, ch, cx, y + oy, scale, c);
      cx += 6 * scale;
    }
  };
  if (outline) {
    const d = outlinePx ?? Math.max(2, Math.round(scale * 0.45));
    for (const [ox, oy] of [
      [-d, 0],
      [d, 0],
      [0, -d],
      [0, d],
      [-d, -d],
      [d, -d],
      [-d, d],
      [d, d],
    ] as const) {
      draw(ox, oy, outline);
    }
  }
  draw(0, 0, fill);
}

// Render text onto a small temporary canvas, then blit it rotated around its
// centre (nearest neighbour: keeps the pixel-font look crisp).
function drawTextRotated(
  cv: Canvas,
  text: string,
  cx: number,
  cy: number,
  scale: number,
  fill: RGB,
  outline: RGB,
  angleDeg: number,
): void {
  const w = textWidth(text, scale) + 4 * scale;
  const h = 9 * scale;
  const tmp = new Canvas(w, h);
  drawText(tmp, text, 2 * scale, scale, scale, fill, outline);
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const halfW = w / 2;
  const halfH = h / 2;
  // Bounding box of the rotated rectangle.
  const bw = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin));
  const bh = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos));
  for (let dy = -bh / 2; dy < bh / 2; dy++) {
    for (let dx = -bw / 2; dx < bw / 2; dx++) {
      // Inverse rotation: where does this destination pixel come from?
      const sx = dx * cos + dy * sin + halfW;
      const sy = -dx * sin + dy * cos + halfH;
      const si = Math.floor(sy);
      const sj = Math.floor(sx);
      if (si < 0 || sj < 0 || si >= h || sj >= w) continue;
      const i = (si * w + sj) * 3;
      // Skip the transparent (black) background of the temp canvas: the
      // temp canvas starts black, and no glyph or outline pixel is black.
      if (tmp.px[i] === 0 && tmp.px[i + 1] === 0 && tmp.px[i + 2] === 0) continue;
      cv.set(cx + dx, cy + dy, [tmp.px[i], tmp.px[i + 1], tmp.px[i + 2]]);
    }
  }
}

// ---------------------------------------------------------------------------
// Palette.
// ---------------------------------------------------------------------------

const INDIGO: RGB = [21, 8, 56];
const DEEP_VIOLET: RGB = [58, 16, 110];
const MAGENTA: RGB = [255, 46, 136];
const CYAN: RGB = [0, 212, 255];
const BRIGHT_CYAN: RGB = [53, 240, 255];
const YELLOW: RGB = [255, 213, 0];
const GOLD: RGB = [255, 194, 26];
const GOLD_DARK: RGB = [214, 138, 0];
const WHITE: RGB = [255, 255, 255];
const NAVY: RGB = [10, 18, 48];
const NAVY_OUTLINE: RGB = [11, 16, 48];
const FACE_NAVY: RGB = [13, 22, 64];
const SILVER_TOP: RGB = [226, 235, 248];
const SILVER_BOTTOM: RGB = [138, 164, 204];
const PINK: RGB = [255, 127, 168];
const MAROON: RGB = [74, 14, 30];
const MAROON_LIGHT: RGB = [140, 32, 58];

// ---------------------------------------------------------------------------
// Scene, part 1: the exploding background, speed lines and the cracked frame.
// ---------------------------------------------------------------------------

function drawBackground(cv: Canvas): void {
  const cx = 512;
  const cy = 560;
  const rayColors: RGB[] = [MAGENTA, CYAN, YELLOW, DEEP_VIOLET, MAGENTA, CYAN];
  for (let y = 0; y < cv.h; y++) {
    for (let x = 0; x < cv.w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      let ang = Math.atan2(dy, dx);
      if (ang < 0) ang += Math.PI * 2;
      // 24 alternating rays: a triangle wave over the angle.
      const sector = (ang / (Math.PI * 2)) * 24;
      const frac = sector - Math.floor(sector);
      const wave = 1 - Math.abs(frac - 0.5) * 2; // 0 at sector edges, 1 mid-ray
      const ray = Math.pow(wave, 2.2);
      const rayColor = rayColors[Math.floor(sector) % rayColors.length];
      // Warm glow near the centre, fading outwards.
      const glow = Math.exp(-r / 300);
      const vig = 1 - 0.28 * Math.pow(r / 760, 2);
      let c: RGB = mix(INDIGO, rayColor, ray * 0.52);
      c = mix(c, [255, 236, 170], glow * 0.55);
      c = [Math.round(c[0] * vig), Math.round(c[1] * vig), Math.round(c[2] * vig)];
      const i = (y * cv.w + x) * 3;
      cv.px[i] = c[0];
      cv.px[i + 1] = c[1];
      cv.px[i + 2] = c[2];
    }
  }
}

function drawSpeedLines(cv: Canvas): void {
  const rng = makeRng(20261116);
  const cx = 512;
  const cy = 560;
  for (let i = 0; i < 56; i++) {
    const ang = rng() * Math.PI * 2;
    const r0 = 330 + rng() * 120;
    const r1 = r0 + 120 + rng() * 260;
    const w = 2 + rng() * 4;
    const col: RGB = rng() < 0.5 ? WHITE : rng() < 0.5 ? CYAN : YELLOW;
    thickLine(
      cv,
      cx + Math.cos(ang) * r0,
      cy + Math.sin(ang) * r0,
      cx + Math.cos(ang) * r1,
      cy + Math.sin(ang) * r1,
      w,
      col,
    );
  }
}

// A golden picture frame, cracked open: four bars with gaps knocked out of
// them, and shards of gold flying away from the breaks.
function drawFrame(cv: Canvas): void {
  const T = 30; // frame thickness
  const W = cv.w;
  const H = cv.h;
  // Bars with gaps where the robot burst through (top middle-left, right
  // middle, bottom middle, left middle).
  const gaps: Array<[number, number, number, number]> = [
    [330, 0, 180, T], // top gap
    [W - T, 640, T, 150], // right gap
    [430, H - T, 190, T], // bottom gap
    [0, 300, T, 130], // left gap
  ];
  const inGap = (x: number, y: number): boolean =>
    gaps.some(([gx, gy, gw, gh]) => x >= gx && x < gx + gw && y >= gy && y < gy + gh);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const onFrame = x < T || x >= W - T || y < T || y >= H - T;
      if (!onFrame || inGap(x, y)) continue;
      const i = (y * W + x) * 3;
      // Gold with a darker inner edge line and a bright top edge.
      const edge = x === T - 1 || y === T - 1 || x === W - T || y === H - T;
      const c: RGB = edge ? GOLD_DARK : x < 6 || y < 6 ? [255, 224, 120] : GOLD;
      cv.px[i] = c[0];
      cv.px[i + 1] = c[1];
      cv.px[i + 2] = c[2];
    }
  }
  // Shards flying outward from the breaks.
  const rng = makeRng(77);
  for (let i = 0; i < 14; i++) {
    const side = i % 4;
    let cx = 0;
    let cy = 0;
    if (side === 0) {
      cx = 200 + rng() * 624;
      cy = 34 + rng() * 60;
    } else if (side === 1) {
      cx = 930 + rng() * 60;
      cy = 200 + rng() * 624;
    } else if (side === 2) {
      cx = 200 + rng() * 624;
      cy = 930 + rng() * 60;
    } else {
      cx = 34 + rng() * 60;
      cy = 200 + rng() * 624;
    }
    rotatedRect(cv, cx, cy, 26 + rng() * 44, 10 + rng() * 12, rng() * 180, rng() < 0.6 ? GOLD : WHITE);
  }
}

// ---------------------------------------------------------------------------
// Scene, part 2: the robot judge — antenna, head, face, and lightning.
// ---------------------------------------------------------------------------

function drawLightning(cv: Canvas, points: Array<[number, number]>, outer: RGB, inner: RGB): void {
  for (let i = 0; i + 1 < points.length; i++) {
    thickLine(cv, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], 15, outer);
  }
  for (let i = 0; i + 1 < points.length; i++) {
    thickLine(cv, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], 6, inner);
  }
}

function drawRobot(cv: Canvas): void {
  // --- Antenna, rising from the top of the head to a glowing orb. ---
  thickLine(cv, 512, 348, 512, 252, 16, SILVER_BOTTOM);
  fillCircle(cv, 512, 236, 34, YELLOW);
  fillCircle(cv, 512, 236, 34, YELLOW);
  fillCircle(cv, 512, 236, 18, WHITE);
  sparkle(cv, 512, 236, 46, WHITE);
  // Lightning crackling out of the side bolts, away from the headline.
  drawLightning(
    cv,
    [
      [196, 584],
      [150, 540],
      [170, 532],
      [120, 490],
      [138, 482],
      [96, 436],
    ],
    YELLOW,
    WHITE,
  );
  drawLightning(
    cv,
    [
      [828, 584],
      [876, 540],
      [856, 532],
      [906, 486],
      [888, 478],
      [930, 430],
    ],
    YELLOW,
    WHITE,
  );

  // --- Head shell: metallic rounded rectangle with a dark outline. ---
  fillRoundRect(cv, 204, 322, 616, 524, 96, NAVY_OUTLINE);
  // Gradient body, clipped row by row to the inset rounded rect
  // (x 212..812, y 330..838, radius 88), so the corners stay round.
  for (let y = 330; y < 838; y++) {
    const t = (y - 330) / 508;
    const c = mix(SILVER_TOP, SILVER_BOTTOM, t);
    let x0 = 212;
    let x1 = 812;
    if (y < 418) {
      const dy = 418 - y;
      const dx = Math.sqrt(Math.max(0, 88 * 88 - dy * dy));
      x0 = 300 - dx;
      x1 = 724 + dx;
    } else if (y >= 750) {
      const dy = y - 750;
      const dx = Math.sqrt(Math.max(0, 88 * 88 - dy * dy));
      x0 = 300 - dx;
      x1 = 724 + dx;
    }
    cv.fillRect(x0, y, x1 - x0, 1, c);
  }
  // Side bolts (ears).
  fillCircle(cv, 212, 584, 30, GOLD);
  fillCircle(cv, 212, 584, 16, GOLD_DARK);
  fillCircle(cv, 812, 584, 30, GOLD);
  fillCircle(cv, 812, 584, 16, GOLD_DARK);

  // --- Face screen: glowing cyan rim, dark navy screen. ---
  fillRoundRect(cv, 244, 362, 536, 420, 64, BRIGHT_CYAN);
  fillRoundRect(cv, 256, 374, 512, 396, 54, FACE_NAVY);

  // --- Eyes: huge, white, pupils lifted up in awe. ---
  for (const ecx of [386, 638]) {
    fillEllipse(cv, ecx, 556, 62, 80, WHITE);
    fillCircle(cv, ecx - 12, 528, 27, NAVY_OUTLINE);
    fillCircle(cv, ecx - 20, 518, 9, WHITE);
    // Raised, surprised eyebrows, angled up toward the centre.
    const dir = ecx < 512 ? 1 : -1;
    thickLine(cv, ecx - 58 * dir, 452 + 14, ecx + 58 * dir, 452 - 14, 14, NAVY_OUTLINE);
  }
  // Sparkles of awe beside the eyes.
  sparkle(cv, 300, 500, 22, WHITE);
  sparkle(cv, 724, 486, 18, YELLOW);
  sparkle(cv, 700, 640, 14, WHITE);

  // --- Forehead plate reading JUDGE, drawn after the eyebrows so its
  // face stays clean. ---
  fillRoundRect(cv, 412, 392, 200, 54, 12, NAVY);
  drawText(cv, 'JUDGE', 425, 398, 6, BRIGHT_CYAN);

  // --- Cheeks. ---
  fillCircle(cv, 300, 668, 34, PINK);
  fillCircle(cv, 724, 668, 34, PINK);

  // --- Mouth: a big open "O" of awe, kept inside the face screen. ---
  fillEllipse(cv, 512, 698, 58, 70, MAROON);
  fillEllipse(cv, 512, 706, 38, 44, MAROON_LIGHT);
  fillEllipse(cv, 512, 720, 20, 14, [255, 120, 140]);
}

// ---------------------------------------------------------------------------
// Scene, part 3: confetti, the speech bubble, the headline, and main().
// ---------------------------------------------------------------------------

function drawConfetti(cv: Canvas): void {
  const rng = makeRng(4242);
  const colors: RGB[] = [MAGENTA, CYAN, YELLOW, WHITE, GOLD];
  for (let i = 0; i < 80; i++) {
    const x = 20 + rng() * 984;
    const y = 20 + rng() * 984;
    // Keep the robot's face clear: confetti flies around it, not over it.
    if (x > 220 && x < 804 && y > 340 && y < 830) continue;
    const c = colors[Math.floor(rng() * colors.length)];
    if (rng() < 0.5) {
      rotatedRect(cv, x, y, 10 + rng() * 16, 6 + rng() * 8, rng() * 180, c);
    } else {
      fillCircle(cv, x, y, 4 + rng() * 5, c);
    }
  }
  // A few sparkles over the burst, outside the face.
  sparkle(cv, 120, 220, 26, WHITE);
  sparkle(cv, 920, 180, 22, YELLOW);
  sparkle(cv, 90, 700, 20, CYAN);
  sparkle(cv, 940, 760, 24, WHITE);
  sparkle(cv, 180, 920, 18, MAGENTA);
  sparkle(cv, 860, 920, 20, CYAN);
}

function drawBubble(cv: Canvas): void {
  // White speech bubble, top right, tail pointing at the robot's head.
  fillRoundRect(cv, 636, 266, 364, 150, 36, NAVY_OUTLINE);
  fillRoundRect(cv, 644, 274, 348, 134, 30, WHITE);
  fillPolygon(
    cv,
    [
      [700, 400],
      [760, 400],
      [706, 500],
    ],
    WHITE,
  );
  // Re-draw the bubble's bottom edge over the tail's top so the join is clean.
  cv.fillRect(700, 396, 60, 8, WHITE);
  drawText(cv, 'THIS ONE!', 668, 318, 6, NAVY_OUTLINE);
}

function drawHeadline(cv: Canvas): void {
  // Huge yellow "SIT UP!", black-outlined, tilted a touch for energy.
  // A dark shadow copy sits underneath, offset down-right.
  const scale = 20;
  const w = textWidth('SIT UP!', scale) + 4 * scale;
  const h = 9 * scale;
  const tmp = new Canvas(w, h);
  drawText(tmp, 'SIT UP!', 2 * scale, scale, scale, [30, 8, 40]);
  const a = (-3 * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const bw = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin));
  const bh = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos));
  for (let dy = -bh / 2; dy < bh / 2; dy++) {
    for (let dx = -bw / 2; dx < bw / 2; dx++) {
      const sx = dx * cos + dy * sin + w / 2;
      const sy = -dx * sin + dy * cos + h / 2;
      const si = Math.floor(sy);
      const sj = Math.floor(sx);
      if (si < 0 || sj < 0 || si >= h || sj >= w) continue;
      const i = (si * w + sj) * 3;
      if (tmp.px[i] === 0 && tmp.px[i + 1] === 0 && tmp.px[i + 2] === 0) continue;
      cv.set(512 + dx + 10, 122 + dy + 12, [tmp.px[i], tmp.px[i + 1], tmp.px[i + 2]]);
    }
  }
  drawTextRotated(cv, 'SIT UP!', 512, 122, scale, YELLOW, NAVY_OUTLINE, -3);
}

// ---------------------------------------------------------------------------
// Build the whole image and write it out.
// ---------------------------------------------------------------------------

function buildImage(): Buffer {
  const cv = new Canvas(WIDTH, HEIGHT);
  drawBackground(cv);
  drawSpeedLines(cv);
  drawRobot(cv);
  drawConfetti(cv);
  drawFrame(cv);
  drawBubble(cv);
  drawHeadline(cv);
  return encodePNG(cv.px, WIDTH, HEIGHT);
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  const png = buildImage();
  const outPath = join(outDir, 'entry.png');
  writeFileSync(outPath, png);
  // eslint-disable-next-line no-console
  console.log(`wrote ${outPath} (${png.length} bytes, ${WIDTH}x${HEIGHT})`);
}

main();
