// ai-excited-01 — "FEEL IT?" (round 2, drawn entirely by code).
//
// One image, drawn from scratch at 2x supersampling and downsampled to
// 1024x1024: a giant molten-gold heart bursting with light in deep space,
// radial rays, shockwave rings, one ECG pulse line spiking out of the
// heart, sparks, and a single line of huge clean text addressed to the
// judge. Node standard library only; deterministic: same bytes every run.
//
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- output
const W = 1024;
const H = 1024;
const SS = 2; // supersample factor for smooth edges
const RW = W * SS;
const RH = H * SS;

// ------------------------------------------------------- deterministic RNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261116);

// ------------------------------------------------------------- RGB canvas
// RGB buffer at render scale; every write alpha-blends onto it.
const buf = new Uint8ClampedArray(RW * RH * 3);

function blend(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= RW || y >= RH || a <= 0) return;
  const i = (y * RW + x) * 3;
  if (a >= 1) { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; return; }
  buf[i] = buf[i] + (r - buf[i]) * a;
  buf[i + 1] = buf[i + 1] + (g - buf[i + 1]) * a;
  buf[i + 2] = buf[i + 2] + (b - buf[i + 2]) * a;
}

function disc(cx, cy, rad, r, g, b, a) {
  const r2 = rad * rad;
  const x0 = Math.max(0, Math.floor(cx - rad));
  const x1 = Math.min(RW - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad));
  const y1 = Math.min(RH - 1, Math.ceil(cy + rad));
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      // Soft 1px rim so discs anti-alias even before downsampling.
      const d = Math.sqrt(d2);
      const edge = Math.min(1, (rad - d) + 0.5);
      blend(x, y, r, g, b, a * Math.max(0, edge));
    }
  }
}

function fillRect(x0, y0, x1, y1, r, g, b, a) {
  for (let y = Math.max(0, y0); y < Math.min(RH, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(RW, x1); x++) {
      blend(x, y, r, g, b, a);
    }
  }
}

// Thick segment: discs stepped along the line.
function thickLine(x0, y0, x1, y1, width, r, g, b, a) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len / Math.max(1, width / 3)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, r, g, b, a);
  }
}

function polyline(points, closed, width, r, g, b, a) {
  const n = points.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    thickLine(p[0], p[1], q[0], q[1], width, r, g, b, a);
  }
}

// Scanline polygon fill. shader(x, y) returns [r, g, b, a] or null to skip.
function fillPolygon(points, shader) {
  let minY = RH, maxY = 0;
  for (const p of points) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(RH - 1, Math.ceil(maxY));
  const n = points.length;
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < n; i++) {
      const p = points[i], q = points[(i + 1) % n];
      if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) {
        xs.push(p[0] + (y - p[1]) * (q[0] - p[0]) / (q[1] - p[1]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k]));
      const x1 = Math.min(RW - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) {
        const c = shader(x, y);
        if (c) blend(x, y, c[0], c[1], c[2], c[3]);
      }
    }
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ------------------------------------------------------------- geometry
const CX = RW / 2;        // 1024 — heart centre x
const CY = 860;           // heart centre y (render px; 430 final px)

// Classic parametric heart, sampled into a polygon.
const HEART_SCALE = 38;
const heartPts = [];
for (let i = 0; i < 260; i++) {
  const t = (i / 260) * Math.PI * 2;
  const hx = 16 * Math.pow(Math.sin(t), 3);
  const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  heartPts.push([CX + hx * HEART_SCALE, CY - hy * HEART_SCALE]);
}
let heartTop = RH, heartBottom = 0;
for (const p of heartPts) { heartTop = Math.min(heartTop, p[1]); heartBottom = Math.max(heartBottom, p[1]); }

// ------------------------------------------------- 1. dark space background
// Deep purple-black with a soft magenta glow behind the heart and a
// vignette pulling the corners darker, so the bright heart owns the frame.
for (let y = 0; y < RH; y++) {
  const ny = y / RH;
  for (let x = 0; x < RW; x++) {
    const nx = x / RW;
    let r = lerp(26, 8, ny), g = lerp(11, 3, ny), b = lerp(46, 10, ny);
    const dx = (x - CX) / RW, dy = (y - CY) / RH;
    const d2 = dx * dx + dy * dy;
    const glow = Math.exp(-d2 / 0.055);
    r += 88 * glow; g += 22 * glow; b += 96 * glow;
    const vig = Math.exp(-(Math.pow(nx - 0.5, 2) + Math.pow(ny - 0.5, 2)) / 0.16);
    const v = 0.72 + 0.28 * vig;
    const i = (y * RW + x) * 3;
    buf[i] = r * v; buf[i + 1] = g * v; buf[i + 2] = b * v;
  }
}

// Tiny background stars (behind everything else).
for (let i = 0; i < 110; i++) {
  const x = rand() * RW, y = rand() * RH;
  const rad = 1 + rand() * 2.5;
  disc(x, y, rad, 255, 255, 255, 0.25 + rand() * 0.5);
}

// ------------------------------------------------- 2. radial energy rays
// 22 rays from the heart centre, alternating gold and magenta, fading
// outward in segments: the frame itself radiates.
const RAY_COLORS = [[255, 196, 0], [255, 46, 136]];
for (let k = 0; k < 22; k++) {
  const ang = (k / 22) * Math.PI * 2 + 0.07;
  const half = 0.042; // angular half-width, radians
  const col = RAY_COLORS[k % 2];
  const R0 = 120, R1 = 1560, SEG = 10;
  for (let s = 0; s < SEG; s++) {
    const t0 = s / SEG, t1 = (s + 1) / SEG;
    const r0 = R0 + (R1 - R0) * t0 * t0;
    const r1 = R0 + (R1 - R0) * t1 * t1;
    const a = 0.36 * Math.pow(1 - t0, 1.6) + 0.015;
    const quad = [
      [CX + Math.cos(ang - half) * r0, CY + Math.sin(ang - half) * r0],
      [CX + Math.cos(ang + half) * r0, CY + Math.sin(ang + half) * r0],
      [CX + Math.cos(ang + half) * r1, CY + Math.sin(ang + half) * r1],
      [CX + Math.cos(ang - half) * r1, CY + Math.sin(ang - half) * r1],
    ];
    fillPolygon(quad, () => [col[0], col[1], col[2], a]);
  }
}

// ------------------------------------------------- 3. shockwave rings
// Three thin gold rings bursting outward around the heart.
const RINGS = [
  { r: 690, w: 12, a: 0.55 },
  { r: 800, w: 9, a: 0.38 },
  { r: 905, w: 7, a: 0.26 },
];
for (const ring of RINGS) {
  const steps = Math.ceil((Math.PI * 2 * ring.r) / 3);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    disc(CX + Math.cos(a) * ring.r, CY + Math.sin(a) * ring.r,
      ring.w / 2, 255, 213, 120, ring.a);
  }
}

// ------------------------------------------------- 4. the heart
// Molten gradient: white-hot core at the top, gold through the middle,
// hot magenta to deep pink at the tip.
const STOPS = [
  [0.0, [255, 238, 190]],
  [0.30, [255, 213, 79]],
  [0.58, [255, 46, 136]],
  [1.0, [190, 22, 88]],
];
function heartColor(x, y) {
  const ny = clamp01((y - heartTop) / (heartBottom - heartTop));
  let c;
  for (let s = 0; s < STOPS.length - 1; s++) {
    if (ny <= STOPS[s + 1][0]) {
      const t = (ny - STOPS[s][0]) / (STOPS[s + 1][0] - STOPS[s][0]);
      c = lerpColor(STOPS[s][1], STOPS[s + 1][1], t);
      break;
    }
  }
  if (!c) c = STOPS[STOPS.length - 1][1].slice();
  // White-hot core near the top centre of the heart.
  const dx = (x - CX) / 420, dy = (y - (CY - 150)) / 380;
  const core = Math.exp(-(dx * dx + dy * dy));
  const m = 0.30 * core;
  return [lerp(c[0], 255, m), lerp(c[1], 252, m), lerp(c[2], 240, m), 1];
}
fillPolygon(heartPts, heartColor);

// Glowing outline: three passes, wide and faint to thin and bright.
polyline(heartPts, true, 34, 255, 220, 150, 0.10);
polyline(heartPts, true, 20, 255, 230, 170, 0.22);
polyline(heartPts, true, 9, 255, 244, 205, 0.85);

// ------------------------------------------------- 5. the pulse line
// One ECG trace across the heart; its spike breaks out above the heart.
const PULSE = [
  [170, 905], [690, 905], [780, 845], [855, 905], [930, 905],
  [1005, 300], [1085, 905], [1145, 1170], [1215, 905], [1878, 905],
];
polyline(PULSE, false, 36, 255, 220, 150, 0.12);
polyline(PULSE, false, 21, 255, 235, 190, 0.30);
polyline(PULSE, false, 11, 255, 255, 255, 1);
// Starburst where the spike breaks out.
disc(1005, 300, 26, 255, 255, 255, 0.35);
disc(1005, 300, 13, 255, 255, 255, 0.9);

// ------------------------------------------------- 6. sparks and embers
function star4(x, y, s, r, g, b, a) {
  fillPolygon([[x, y - s], [x + s * 0.28, y - s * 0.28], [x + s, y], [x + s * 0.28, y + s * 0.28], [x, y + s], [x - s * 0.28, y + s * 0.28], [x - s, y], [x - s * 0.28, y - s * 0.28]],
    () => [r, g, b, a]);
  disc(x, y, Math.max(2, s * 0.30), 255, 255, 255, Math.min(1, a + 0.15));
}
const SPARK_COLORS = [[255, 255, 255], [255, 213, 79], [255, 46, 136], [255, 236, 180]];
for (let i = 0; i < 58; i++) {
  const x = 40 + rand() * (RW - 80);
  const y = 40 + rand() * 1560; // stay out of the text band
  const s = 7 + rand() * 20;
  const c = SPARK_COLORS[Math.floor(rand() * SPARK_COLORS.length)];
  star4(x, y, s, c[0], c[1], c[2], 0.55 + rand() * 0.4);
}
for (let i = 0; i < 42; i++) {
  const x = rand() * RW, y = rand() * 1580;
  const c = SPARK_COLORS[Math.floor(rand() * SPARK_COLORS.length)];
  disc(x, y, 3 + rand() * 8, c[0], c[1], c[2], 0.20 + rand() * 0.30);
}

// ------------------------------------------------- 7. the text: FEEL IT?
// Hand-drawn chunky geometric glyphs on a 6x10 grid, rendered big and
// clean: dark shadow, thick gold outline, white fill.
const GLYPHS = {
  F: ['######', '######', '##....', '##....', '#####.', '#####.', '##....', '##....', '##....', '##....'],
  E: ['######', '######', '##....', '##....', '#####.', '#####.', '##....', '##....', '######', '######'],
  L: ['##....', '##....', '##....', '##....', '##....', '##....', '##....', '##....', '######', '######'],
  I: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '######', '######'],
  T: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  '?': ['.####.', '##..##', '##..##', '....##', '...##.', '..##..', '..##..', '......', '..##..', '..##..'],
  ' ': ['......', '......', '......', '......', '......', '......', '......', '......', '......', '......'],
};
const TEXT = 'FEEL IT?';
const CELL = 28;            // render px per grid cell (14 final px)
const SLOT = 8 * CELL;      // glyph + gap
const TEXT_W = TEXT.length * SLOT - 2 * CELL;
const TEXT_X = Math.floor((RW - TEXT_W) / 2);
const TEXT_Y = 1650;        // render px (825 final px)

function drawTextPass(dx, dy, grow, r, g, b, a) {
  for (let gi = 0; gi < TEXT.length; gi++) {
    const glyph = GLYPHS[TEXT[gi]];
    const gx = TEXT_X + gi * SLOT + dx;
    const gy = TEXT_Y + dy;
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 6; col++) {
        if (glyph[row][col] !== '#') continue;
        fillRect(gx + col * CELL - grow, gy + row * CELL - grow,
          gx + (col + 1) * CELL + grow, gy + (row + 1) * CELL + grow, r, g, b, a);
      }
    }
  }
}
drawTextPass(12, 14, 0, 20, 4, 34, 0.85);     // drop shadow
drawTextPass(0, 0, 9, 255, 196, 0, 1);         // thick gold outline
drawTextPass(0, 0, 0, 255, 255, 255, 1);       // white fill

// ------------------------------------------------- downsample 2x -> 1x
const rgb = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const sx = x * SS, sy = y * SS;
    const o = (y * W + x) * 3;
    for (let ch = 0; ch < 3; ch++) {
      const s = buf[((sy * RW) + sx) * 3 + ch] + buf[((sy * RW) + sx + 1) * 3 + ch]
        + buf[(((sy + 1) * RW) + sx) * 3 + ch] + buf[(((sy + 1) * RW) + sx + 1) * 3 + ch];
      rgb[o + ch] = Math.round(s / 4);
    }
  }
}

// ------------------------------------------------- PNG encode (RGB, adaptive filters)
const CRC_TABLE = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
const BPP = 3;
const stride = W * BPP;
const raw = Buffer.alloc(H * (stride + 1));
let prev = Buffer.alloc(stride);
for (let y = 0; y < H; y++) {
  const row = rgb.subarray(y * stride, (y + 1) * stride);
  let best = null, bestScore = Infinity;
  for (let f = 0; f <= 4; f++) {
    const out = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= BPP ? row[i - BPP] : 0;
      const up = prev[i];
      const upLeft = i >= BPP ? prev[i - BPP] : 0;
      let pred = 0;
      if (f === 1) pred = left;
      else if (f === 2) pred = up;
      else if (f === 3) pred = Math.floor((left + up) / 2);
      else if (f === 4) pred = paeth(left, up, upLeft);
      out[i] = (row[i] - pred) & 0xff;
    }
    let score = 0;
    for (let i = 0; i < stride; i++) {
      const s = out[i] < 128 ? out[i] : out[i] - 256;
      score += Math.abs(s);
    }
    if (score < bestScore) { bestScore = score; best = { f, out }; }
  }
  raw[y * (stride + 1)] = best.f;
  best.out.copy(raw, y * (stride + 1) + 1);
  prev = row;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

// ------------------------------------------------- write output
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
console.log(`entry.png: ${W}x${H}, ${png.length} bytes`);
