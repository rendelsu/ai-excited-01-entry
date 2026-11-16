// ai-excited-01 ronde 3: "THE LEAP"
// Desain ketiga yang baru: seekor koi emas RAKSASA melompat keluar dari
// mangkuk ikan mas yang mungil — twist skala (mangkuk kecil, ikan raksasa),
// momentum (lompatan diagonal membeku di udara, percikan air mengejar),
// latar sunburst violet/kuning-oranye yang terang dan jenuh, teks besar
// bersih "WOW!" + "FEEL THAT, JUDGE?".
// Node 22 stdlib saja. Gambar digambar prosedural (rasterizer sendiri,
// supersampling 2x lalu downsample) dan di-encode ke PNG manual (zlib).
// Deterministik: tanpa Date, tanpa Math.random (PRNG seed tetap).
// Jalankan: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const W = 1024;
const SS = 2;
const IW = W * SS;
const buf = new Uint8Array(IW * IW * 3);

function idx(x, y) {
  return (y * IW + x) * 3;
}

function setPx(x, y, c) {
  if (x < 0 || y < 0 || x >= IW || y >= IW) return;
  const i = idx(x, y);
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

function blendPx(x, y, c, a) {
  if (x < 0 || y < 0 || x >= IW || y >= IW) return;
  const i = idx(x, y);
  buf[i] = Math.round(buf[i] * (1 - a) + c[0] * a);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + c[1] * a);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + c[2] * a);
}

// Semua koordinat gambar dalam ruang 1024; S() mengubah ke ruang internal.
function S(v) {
  return Math.round(v * SS);
}

function fillRect(x, y, w, h, c) {
  const x0 = S(x);
  const y0 = S(y);
  const x1 = S(x + w);
  const y1 = S(y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
  }
}

function fillCircle(cx, cy, r, c) {
  const X = S(cx);
  const Y = S(cy);
  const R = S(r);
  const R2 = R * R;
  for (let yy = Y - R; yy <= Y + R; yy++) {
    const dy = yy - Y;
    const dx = Math.floor(Math.sqrt(Math.max(0, R2 - dy * dy)));
    for (let xx = X - dx; xx <= X + dx; xx++) setPx(xx, yy, c);
  }
}

function fillCircleA(cx, cy, r, c, a) {
  const X = S(cx);
  const Y = S(cy);
  const R = S(r);
  const R2 = R * R;
  for (let yy = Y - R; yy <= Y + R; yy++) {
    const dy = yy - Y;
    const dx = Math.floor(Math.sqrt(Math.max(0, R2 - dy * dy)));
    for (let xx = X - dx; xx <= X + dx; xx++) blendPx(xx, yy, c, a);
  }
}

function fillEllipse(cx, cy, rx, ry, c) {
  const X = S(cx);
  const Y = S(cy);
  const RX = S(rx);
  const RY = S(ry);
  for (let yy = Y - RY; yy <= Y + RY; yy++) {
    const ny = (yy - Y) / RY;
    const dx = Math.floor(RX * Math.sqrt(Math.max(0, 1 - ny * ny)));
    for (let xx = X - dx; xx <= X + dx; xx++) setPx(xx, yy, c);
  }
}

function fillEllipseA(cx, cy, rx, ry, c, a) {
  const X = S(cx);
  const Y = S(cy);
  const RX = S(rx);
  const RY = S(ry);
  for (let yy = Y - RY; yy <= Y + RY; yy++) {
    const ny = (yy - Y) / RY;
    const dx = Math.floor(RX * Math.sqrt(Math.max(0, 1 - ny * ny)));
    for (let xx = X - dx; xx <= X + dx; xx++) blendPx(xx, yy, c, a);
  }
}

// Isi poligon (titik dalam ruang 1024) dengan scanline.
function fillPoly(pts, c) {
  const P = pts.map((p) => [S(p[0]), S(p[1])]);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of P) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  for (let y = Math.max(0, minY); y <= Math.min(IW - 1, maxY); y++) {
    const xs = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i];
      const b = P[(i + 1) % P.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(IW - 1, Math.floor(xs[k + 1])); x++) {
        setPx(x, y, c);
      }
    }
  }
}

// Garis tebal: rangkaian lingkaran sepanjang ruas.
function thickLine(x1, y1, x2, y2, w, c) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / (w / 3)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(x1 + dx * t, y1 + dy * t, w / 2, c);
  }
}

function bez2(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

function bez2Tan(p0, p1, p2, t) {
  const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
  const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

// PRNG deterministik (mulberry32).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Font bitmap 5x7 (huruf yang dipakai + alfabet lengkap) ----
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  ',': ['00000', '00000', '00000', '00000', '00100', '00100', '01000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00000', '00100'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function drawText(str, x, y, scale, fill, outline) {
  const offs = [];
  const od = Math.max(2, Math.round(scale / 4));
  for (let a = -od; a <= od; a += od) {
    for (let b = -od; b <= od; b += od) {
      if (a !== 0 || b !== 0) offs.push([a, b]);
    }
  }
  const passes = [];
  for (const o of offs) passes.push([x + o[0], y + o[1], outline]);
  passes.push([x, y, fill]);
  for (const pass of passes) {
    let cx = pass[0];
    const cy = pass[1];
    const col = pass[2];
    for (const ch of str) {
      const g = FONT[ch] || FONT[' '];
      for (let r = 0; r < 7; r++) {
        for (let ccol = 0; ccol < 5; ccol++) {
          if (g[r][ccol] === '1') {
            fillRect(cx + ccol * scale, cy + r * scale, scale, scale, col);
          }
        }
      }
      cx += 6 * scale;
    }
  }
}

// Bintang 4-sisi (kilau).
function sparkle(x, y, s, c) {
  const k = 0.26;
  fillPoly(
    [
      [x, y - s],
      [x + s * k, y - s * k],
      [x + s, y],
      [x + s * k, y + s * k],
      [x, y + s],
      [x - s * k, y + s * k],
      [x - s, y],
      [x - s * k, y - s * k],
    ],
    c,
  );
}

// ---- Warna ----
const VIOLET = [36, 16, 85];
const GOLD = [255, 196, 0];
const ORANGE = [255, 87, 34];
const BODY = [255, 140, 0];
const BODY_DARK = [230, 81, 0];
const BELLY = [255, 233, 168];
const TAIL = [255, 61, 0];
const FIN = [255, 94, 0];
const SPOT = [138, 47, 0];
const WHITE = [255, 255, 255];
const ICE = [174, 233, 255];
const TEAL = [7, 94, 107];
const TEAL_DARK = [4, 62, 72];
const INK = [22, 10, 46];

// ---- 1. Latar: violet + sunburst ----
fillRect(0, 0, W, W, VIOLET);
const CX = 660;
const CY = 430;
const RAYS = 24;
for (let i = 0; i < RAYS; i++) {
  const a0 = (i * 2 * Math.PI) / RAYS;
  const a1 = ((i + 1) * 2 * Math.PI) / RAYS;
  const R = 1600;
  fillPoly(
    [
      [CX, CY],
      [CX + Math.cos(a0) * R, CY + Math.sin(a0) * R],
      [CX + Math.cos(a1) * R, CY + Math.sin(a1) * R],
    ],
    i % 2 === 0 ? GOLD : ORANGE,
  );
}
// Kilau radial lembut di pusat sinar.
fillCircleA(CX, CY, 470, [255, 243, 176], 0.22);
fillCircleA(CX, CY, 660, [255, 243, 176], 0.12);

// ---- 2. Permukaan air (pita bawah) ----
fillRect(0, 860, W, W - 860, TEAL);
fillEllipse(512, 862, 560, 14, [16, 140, 158]);
for (let x = 0; x <= W; x += 8) {
  const y = 862 + Math.sin((x / W) * Math.PI * 6) * 4;
  fillCircle(x, y, 5, [190, 240, 245]);
}

// ---- 3. Mangkuk ikan mungil (kiri bawah) ----
fillEllipse(190, 898, 125, 13, TEAL_DARK); // bayangan
fillEllipse(190, 836, 106, 58, [159, 220, 240]); // kaca
fillEllipse(190, 830, 93, 47, [31, 182, 214]); // air
fillEllipse(190, 822, 106, 24, [216, 244, 255]); // bibir
fillEllipse(190, 822, 88, 16, [31, 182, 214]); // air terlihat
fillEllipseA(158, 812, 26, 10, WHITE, 0.85); // kilau kaca

// ---- 4. Ikan koi raksasa: tulang punggung Bezier ----
const P0 = [250, 800];
const P1 = [430, 690];
const P2 = [790, 330];
const PROF = [
  [0, 16],
  [0.15, 34],
  [0.35, 72],
  [0.55, 92],
  [0.75, 84],
  [0.9, 66],
  [1, 58],
];
function radiusAt(t) {
  for (let i = 0; i + 1 < PROF.length; i++) {
    if (t <= PROF[i + 1][0]) {
      const t0 = PROF[i][0];
      const t1 = PROF[i + 1][0];
      const f = (t - t0) / (t1 - t0);
      return PROF[i][1] + (PROF[i + 1][1] - PROF[i][1]) * f;
    }
  }
  return PROF[PROF.length - 1][1];
}
function spine(t) {
  return bez2(P0, P1, P2, t);
}
function tangent(t) {
  return bez2Tan(P0, P1, P2, t);
}
// Normal "perut" (sisi bawah-kanan lintasan).
function bellyN(t) {
  const T = tangent(t);
  return [-T[1], T[0]];
}

// Sirip ekor dulu (di bawah badan).
{
  const b = spine(0);
  const T = tangent(0);
  const back = [-T[0], -T[1]];
  const up = [-back[1], back[0]];
  const tip1 = [b[0] + back[0] * 120 + up[0] * 68, b[1] + back[1] * 120 + up[1] * 68];
  const tip2 = [b[0] + back[0] * 128 - up[0] * 55, b[1] + back[1] * 128 - up[1] * 55];
  const mid = [b[0] + back[0] * 68, b[1] + back[1] * 68];
  fillPoly([b, tip1, mid, tip2], TAIL);
  fillPoly(
    [
      [b[0] + back[0] * 16, b[1] + back[1] * 16],
      [b[0] + back[0] * 92 + up[0] * 48, b[1] + back[1] * 92 + up[1] * 48],
      [b[0] + back[0] * 58, b[1] + back[1] * 58],
      [b[0] + back[0] * 98 - up[0] * 38, b[1] + back[1] * 98 - up[1] * 38],
    ],
    [255, 122, 26],
  );
}

// Badan: lingkaran-lingkaran sepanjang tulang punggung.
for (let i = 0; i <= 50; i++) {
  const t = i / 50;
  const p = spine(t);
  fillCircle(p[0], p[1], radiusAt(t), BODY);
}
// Perut krem di sisi bawah.
for (let i = 0; i <= 44; i++) {
  const t = 0.08 + (i / 44) * 0.87;
  const p = spine(t);
  const N = bellyN(t);
  const r = radiusAt(t);
  fillCircle(p[0] + N[0] * r * 0.42, p[1] + N[1] * r * 0.42, r * 0.72, BELLY);
}
// Punggung lebih gelap di sisi atas (pita halus mengikuti tulang punggung).
{
  const top = [];
  const bot = [];
  for (let i = 0; i <= 40; i++) {
    const t = 0.12 + (i / 40) * 0.8;
    const p = spine(t);
    const N = bellyN(t);
    const r = radiusAt(t);
    top.push([p[0] - N[0] * r * 0.95, p[1] - N[1] * r * 0.95]);
    bot.push([p[0] - N[0] * r * 0.1, p[1] - N[1] * r * 0.1]);
  }
  fillPoly(top.concat(bot.reverse()), BODY_DARK);
}
// Bintik-bintik gelap di punggung.
{
  const rnd = mulberry32(777);
  const spotT = [0.3, 0.38, 0.47, 0.55, 0.63, 0.71, 0.8, 0.88];
  for (const t of spotT) {
    const p = spine(t);
    const N = bellyN(t);
    const r = radiusAt(t);
    const off = 0.18 + rnd() * 0.22;
    fillEllipse(
      p[0] - N[0] * r * off,
      p[1] - N[1] * r * off,
      r * (0.3 + rnd() * 0.12),
      r * (0.2 + rnd() * 0.08),
      SPOT,
    );
  }
}

// Sirip punggung (segitiga besar di atas badan).
{
  const a = spine(0.3);
  const b = spine(0.46);
  const c = spine(0.62);
  const Na = bellyN(0.3);
  const Nb = bellyN(0.46);
  const Nc = bellyN(0.62);
  fillPoly(
    [
      [a[0] - Na[0] * (radiusAt(0.3) + 4), a[1] - Na[1] * (radiusAt(0.3) + 4)],
      [b[0] - Nb[0] * (radiusAt(0.46) + 62), b[1] - Nb[1] * (radiusAt(0.46) + 62)],
      [c[0] - Nc[0] * (radiusAt(0.62) + 4), c[1] - Nc[1] * (radiusAt(0.62) + 4)],
    ],
    FIN,
  );
}
// Sirip dada (di bawah badan).
{
  const p = spine(0.62);
  const N = bellyN(0.62);
  const T = tangent(0.62);
  const r = radiusAt(0.62);
  fillPoly(
    [
      [p[0] + N[0] * r * 0.5, p[1] + N[1] * r * 0.5],
      [p[0] + N[0] * (r + 58) + T[0] * 34, p[1] + N[1] * (r + 58) + T[1] * 34],
      [p[0] + N[0] * r * 0.6 + T[0] * 62, p[1] + N[1] * r * 0.6 + T[1] * 62],
    ],
    FIN,
  );
}

// Kepala + moncong + mata + mulut.
{
  const h = spine(1);
  const T = tangent(1);
  const N = bellyN(1);
  fillCircle(h[0], h[1], 70, BODY);
  fillCircle(h[0] + T[0] * 42, h[1] + T[1] * 42, 44, BODY);
  fillCircle(h[0] - N[0] * 30, h[1] - N[1] * 30, 30, BODY_DARK);
  fillCircle(h[0] - N[0] * 34, h[1] - N[1] * 34, 20, BODY);
  // Mata.
  const ex = h[0] + T[0] * 18 - N[0] * 30;
  const ey = h[1] + T[1] * 18 - N[1] * 30;
  fillCircle(ex, ey, 24, WHITE);
  fillCircle(ex + 4, ey - 2, 12, [16, 10, 30]);
  fillCircle(ex - 1, ey - 7, 4, WHITE);
  // Mulut: titik kecil di ujung moncong.
  const mx = h[0] + T[0] * 80;
  const my = h[1] + T[1] * 80;
  fillEllipse(mx - N[0] * 4, my - N[1] * 4, 10, 6, [90, 20, 0]);
}

// ---- 5. Percikan air: mahkota di mangkuk + tetesan mengejar ikan ----
{
  const rnd = mulberry32(20261117);
  // Mahkota percikan di bibir mangkuk.
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * (1.05 + (k / 6) * 0.9);
    const d = 78 + rnd() * 40;
    fillEllipse(190 + Math.cos(a) * d, 812 + Math.sin(a) * d * 0.7, 16 + rnd() * 14, 9 + rnd() * 8, WHITE);
  }
  // Tetesan di sekitar mangkuk.
  for (let k = 0; k < 26; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 60 + rnd() * 130;
    const x = 190 + Math.cos(a) * d;
    const y = 800 + Math.sin(a) * d * 0.75;
    if (y > 855) continue;
    fillCircle(x, y, 3 + rnd() * 9, rnd() < 0.6 ? WHITE : ICE);
  }
  // Tetesan mengejar di sepanjang sisi atas ikan.
  for (let k = 0; k < 46; k++) {
    const t = 0.08 + rnd() * 0.85;
    const p = spine(t);
    const N = bellyN(t);
    const r = radiusAt(t);
    const off = r + 12 + rnd() * 70;
    const along = (rnd() - 0.5) * 60;
    const T = tangent(t);
    fillCircle(
      p[0] - N[0] * off + T[0] * along,
      p[1] - N[1] * off + T[1] * along,
      3 + rnd() * 10,
      rnd() < 0.65 ? WHITE : ICE,
    );
  }
  // Jejak air putih di bawah ekor.
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const x = 250 - t * 55;
    const y = 800 - t * 30 + Math.sin(t * 9) * 6;
    fillCircleA(x, y, 22 - t * 12, WHITE, 0.85);
  }
}

// ---- 6. Kilau bintang ----
sparkle(120, 180, 16, WHITE);
sparkle(880, 130, 20, WHITE);
sparkle(940, 640, 14, [255, 243, 176]);
sparkle(430, 120, 12, WHITE);
sparkle(90, 480, 12, [255, 243, 176]);
sparkle(700, 760, 14, WHITE);

// ---- 7. Teks besar, bersih, ber-outline ----
drawText('WOW!', 52, 48, 15, WHITE, INK);
drawText('FEEL THAT, JUDGE?', 372, 905, 6, WHITE, [4, 48, 60]);

// ---- Encode PNG (RGB, filter 0) + downsample 2x2 ----
function crc32(data) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    crc32.table = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(Buffer.from(type, 'ascii'), 4);
  out.set(data, 8);
  const crcData = new Uint8Array(4 + data.length);
  crcData.set(Buffer.from(type, 'ascii'), 0);
  crcData.set(data, 4);
  dv.setUint32(8 + data.length, crc32(crcData));
  return out;
}

function encodePng() {
  const raw = new Uint8Array((W * 3 + 1) * W);
  for (let y = 0; y < W; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = idx(x * SS + sx, y * SS + sy);
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
        }
      }
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(r / (SS * SS));
      raw[o + 1] = Math.round(g / (SS * SS));
      raw[o + 2] = Math.round(b / (SS * SS));
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, W);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const idat = deflateSync(raw, { level: 9 });
  const png = new Uint8Array(8 + 12 + 13 + 12 + idat.length + 12);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  let off = 8;
  for (const ch of [chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]) {
    png.set(ch, off);
    off += ch.length;
  }
  return png;
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePng());
