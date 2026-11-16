// ai-excited-01 r4 — "THE FRAME BREAKS FIRST"
// A classical portrait steps halfway out of its gilded museum frame,
// reaching toward a neon city that pours through the opening.
// Drawn entirely by code (Node stdlib only): a small software rasterizer
// plus a hand-rolled PNG encoder. Deterministic: fixed-seed PRNG, no
// timestamps, no network. Writes one 1024x1024 PNG to $MAKEFUN_OUTPUT_DIR.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const buf = new Uint8Array(W * H * 3);

// ---------- deterministic PRNG (mulberry32, fixed seed) ----------
let seed = 20261117;
function rnd(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- colour helpers ----------
type RGB = [number, number, number];
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
function setPx(x: number, y: number, c: RGB): void {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 3;
  buf[i] = clamp(c[0], 0, 255); buf[i + 1] = clamp(c[1], 0, 255); buf[i + 2] = clamp(c[2], 0, 255);
}
function blendPx(x: number, y: number, c: RGB, a: number): void {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H || a <= 0) return;
  if (a >= 1) { setPx(xi, yi, c); return; }
  const i = (yi * W + xi) * 3;
  buf[i] = clamp(buf[i] + (c[0] - buf[i]) * a, 0, 255);
  buf[i + 1] = clamp(buf[i + 1] + (c[1] - buf[i + 1]) * a, 0, 255);
  buf[i + 2] = clamp(buf[i + 2] + (c[2] - buf[i + 2]) * a, 0, 255);
}
function addPx(x: number, y: number, c: RGB, a: number): void {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H || a <= 0) return;
  const i = (yi * W + xi) * 3;
  buf[i] = clamp(buf[i] + c[0] * a, 0, 255);
  buf[i + 1] = clamp(buf[i + 1] + c[1] * a, 0, 255);
  buf[i + 2] = clamp(buf[i + 2] + c[2] * a, 0, 255);
}

// ---------- shapes ----------
function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const xa = Math.max(0, Math.floor(Math.min(x0, x1)));
  const xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1)));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1)));
  const yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1)));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) setPx(x, y, c);
  }
}
function vgradRect(x0: number, y0: number, x1: number, y1: number, top: RGB, bot: RGB): void {
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H - 1, Math.ceil(y1));
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W - 1, Math.ceil(x1));
  for (let y = ya; y <= yb; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const c = mix(top, bot, clamp(t, 0, 1));
    for (let x = xa; x <= xb; x++) setPx(x, y, c);
  }
}
function circle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) blendPx(x, y, c, a);
    }
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) blendPx(x, y, c, a);
    }
  }
}
type Pt = [number, number];
function poly(points: Pt[], c: RGB, a = 1): void {
  if (points.length < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (const p of points) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++) {
        blendPx(x, y, c, a);
      }
    }
  }
}
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a = 1): void {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len / Math.max(1, w * 0.4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    circle(x0 + dx * t, y0 + dy * t, w / 2, c, a);
  }
}
function glow(cx: number, cy: number, r: number, c: RGB, strength: number): void {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      const f = (1 - d) * (1 - d) * strength;
      addPx(x, y, c, f);
    }
  }
}
// soft radial vignette: darken toward the corners
function vignette(amount: number): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const f = clamp((d - 0.55) * amount, 0, 0.55);
      if (f <= 0) continue;
      const i = (y * W + x) * 3;
      buf[i] *= (1 - f); buf[i + 1] *= (1 - f); buf[i + 2] *= (1 - f);
    }
  }
}

// ---------- frame-space rotation (frame tilts -3 degrees) ----------
const ANG = -3 * Math.PI / 180;
const FCX = 512, FCY = 470;
function fx(x: number, y: number): Pt {
  const dx = x - FCX, dy = y - FCY;
  const ca = Math.cos(ANG), sa = Math.sin(ANG);
  return [FCX + dx * ca - dy * sa, FCY + dx * sa + dy * ca];
}
function fpoly(points: Pt[], c: RGB, a = 1): void {
  poly(points.map(([x, y]) => fx(x, y)), c, a);
}
function fcircle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const [x, y] = fx(cx, cy);
  circle(x, y, r, c, a);
}

// ---------- palette ----------
const WALL_TOP: RGB = [26, 20, 44];
const WALL_BOT: RGB = [10, 8, 18];
const GOLD: RGB = [201, 162, 39];
const GOLD_HI: RGB = [245, 217, 122];
const GOLD_DK: RGB = [122, 92, 20];
const GOLD_MID: RGB = [232, 199, 102];
const PAINT_TOP: RGB = [74, 58, 34];
const PAINT_BOT: RGB = [36, 26, 16];
const SKIN: RGB = [232, 180, 140];
const SKIN_DK: RGB = [181, 126, 86];
const SKIN_HI: RGB = [247, 211, 172];
const COAT: RGB = [30, 36, 54];
const MAGENTA: RGB = [255, 46, 154];
const CYAN: RGB = [34, 230, 255];
const VIOLET: RGB = [122, 61, 255];
const YELLOW: RGB = [255, 210, 63];
const WHITE: RGB = [255, 255, 255];
const INK: RGB = [18, 6, 15];

// ---------- 1. museum wall ----------
vgradRect(0, 0, W, H, WALL_TOP, WALL_BOT);
// faint wall panels
for (const px0 of [40, 984]) {
  for (let y = 60; y < 980; y++) blendPx(px0, y, [70, 60, 110], 0.25);
}
fillRect(0, 96, W, 100, [38, 30, 62]); // picture rail
// warm sconce glows left and right
glow(70, 300, 150, [255, 190, 90], 0.35);
glow(954, 300, 150, [255, 190, 90], 0.35);
circle(70, 300, 14, [255, 214, 130]);
circle(954, 300, 14, [255, 214, 130]);

// ---------- 2. neon city glow behind the frame (right side) ----------
glow(820, 520, 420, MAGENTA, 0.5);
glow(880, 420, 300, CYAN, 0.4);
glow(760, 640, 260, VIOLET, 0.45);

// ---------- 3. portrait canvas inside the frame ----------
const FX0 = 268, FY0 = 168, FX1 = 756, FY1 = 772; // frame-space inner rect
{
  // painted backdrop, frame-space
  fpoly([[FX0, FY0], [FX1, FY0], [FX1, FY1], [FX0, FY1]], PAINT_BOT);
  // warm oval halo behind the head, kept subtle so it does not read as an egg
  const [hx, hy] = fx(512, 380);
  ellipse(hx, hy, 150, 175, [107, 86, 54], 0.55);
  ellipse(hx, hy, 105, 130, [140, 112, 70], 0.45);
}
// ---------- figure: classical bust, leaning out ----------
// shoulders / coat
fpoly([[330, 772], [360, 640], [420, 600], [512, 585], [604, 600], [664, 640], [694, 772]], COAT);
// coat shading + lapels
fpoly([[512, 585], [560, 620], [512, 772], [470, 700]], [22, 26, 42]);
fpoly([[512, 585], [464, 620], [512, 772], [554, 700]], [38, 46, 68]);
// white shirt + collar
fpoly([[486, 600], [512, 585], [538, 600], [524, 660], [512, 690], [500, 660]], [242, 237, 226]);
fpoly([[486, 600], [512, 632], [470, 640]], [242, 237, 226]);
fpoly([[538, 600], [512, 632], [554, 640]], [242, 237, 226]);
// neck
fpoly([[492, 560], [532, 560], [528, 610], [496, 610]], SKIN_DK);
// head (oval, slightly turned)
{
  const [hx, hy] = fx(512, 470);
  ellipse(hx, hy, 78, 98, SKIN);
  // shadow side of face
  ellipse(hx + 34, hy + 6, 46, 90, SKIN_DK, 0.55);
  // highlight
  ellipse(hx - 30, hy - 20, 30, 44, SKIN_HI, 0.5);
}
// hair: dark, swept, painted
fpoly([[436, 440], [448, 372], [512, 348], [576, 372], [588, 440], [566, 400], [512, 382], [458, 400]], [32, 24, 18]);
fpoly([[448, 372], [512, 348], [576, 372], [560, 388], [512, 372], [464, 388]], [58, 44, 30]);
// brows + eyes (simple, confident, flat-painted)
fpoly([[452, 452], [486, 446], [488, 456], [454, 462]], [28, 20, 14]);
fpoly([[538, 446], [572, 452], [570, 462], [536, 456]], [28, 20, 14]);
ellipse(470, 470, 12, 6, [30, 22, 16]);
ellipse(554, 470, 12, 6, [30, 22, 16]);
circle(470, 468, 3, WHITE);
circle(554, 468, 3, WHITE);
// nose shadow + a calm, closed mouth (no moustache: it read as a smudge)
thickLine(512, 472, 506, 512, 5, SKIN_DK, 0.7);
thickLine(494, 542, 512, 546, 5, [150, 90, 60], 0.9);
thickLine(512, 546, 530, 542, 5, [150, 90, 60], 0.9);

// ---------- 4. gilded frame (tilted), with the lower-right corner broken ----------
// outer + inner gold bars
fpoly([[232, 132], [792, 132], [792, 168], [232, 168]], GOLD_HI); // top
fpoly([[232, 772], [792, 772], [792, 808], [232, 808]], GOLD_DK); // bottom
fpoly([[232, 132], [268, 132], [268, 808], [232, 808]], GOLD); // left
fpoly([[756, 132], [792, 132], [792, 808], [756, 808]], GOLD_MID); // right
// inner bevel lines
fpoly([[268, 168], [756, 168], [756, 182], [268, 182]], GOLD_DK);
fpoly([[268, 758], [756, 758], [756, 772], [268, 772]], GOLD_HI);
// corner rosettes
for (const [cx, cy] of [[250, 150], [774, 150], [250, 790], [774, 790]] as Pt[]) {
  fcircle(cx, cy, 16, GOLD_HI);
  fcircle(cx, cy, 9, GOLD_DK);
  fcircle(cx, cy, 4, GOLD_HI);
}
// gilded ornament ticks along the top bar
for (let i = 0; i < 9; i++) {
  const x = 300 + i * 52;
  fcircle(x, 150, 6, GOLD_MID);
}

// ---------- 5. the break: neon city bursts through the lower-right ----------
// jagged hole over the frame's lower-right corner
poly([[700, 560], [760, 520], [830, 560], [880, 640], [860, 740], [790, 800], [720, 760], [690, 660]], [12, 6, 20]);
// city glow spilling out
glow(830, 660, 260, MAGENTA, 0.55);
glow(880, 600, 200, CYAN, 0.5);
// skyscraper silhouettes pouring out, leaning right
const buildings: [number, number, number, number, RGB][] = [
  [760, 560, 40, 220, [40, 10, 60]],
  [806, 500, 46, 280, [24, 8, 52]],
  [858, 540, 38, 240, [52, 12, 70]],
  [902, 470, 44, 310, [20, 6, 44]],
  [950, 540, 36, 240, [44, 10, 64]],
];
for (const [bx, by, bw, bh, col] of buildings) {
  poly([[bx, by + bh], [bx, by], [bx + bw / 2, by - 26], [bx + bw, by], [bx + bw, by + bh]], col);
}
// lit windows on the buildings
seed = 777;
for (const [bx, by, bw, bh] of buildings) {
  for (let wy = by + 14; wy < by + bh - 12; wy += 22) {
    for (let wx = bx + 7; wx < bx + bw - 7; wx += 14) {
      if (rnd() < 0.55) {
        const wc: RGB = rnd() < 0.5 ? YELLOW : CYAN;
        fillRect(wx, wy, wx + 6, wy + 9, wc);
      }
    }
  }
}
// light beams radiating from the hole
for (let i = 0; i < 7; i++) {
  const a = -0.9 + i * 0.28;
  const x2 = 830 + Math.cos(a) * 420, y2 = 660 + Math.sin(a) * 420;
  thickLine(830, 660, x2, y2, 5 + (i % 3) * 3, i % 2 === 0 ? CYAN : MAGENTA, 0.5);
}
// gold shards flying out of the break
seed = 4242;
for (let i = 0; i < 26; i++) {
  const cx = 700 + rnd() * 280, cy = 520 + rnd() * 300;
  const s = 6 + rnd() * 16, a = rnd() * Math.PI;
  const pts: Pt[] = [];
  for (let k = 0; k < 3; k++) {
    const aa = a + (k * 2 * Math.PI) / 3;
    pts.push([cx + Math.cos(aa) * s, cy + Math.sin(aa) * s * 0.6]);
  }
  poly(pts, rnd() < 0.5 ? GOLD_HI : GOLD_MID);
}
// cracks radiating from the break into the frame's gold bars
thickLine(700, 560, 660, 520, 4, GOLD_DK, 0.9);
thickLine(700, 560, 690, 610, 4, GOLD_DK, 0.9);
thickLine(760, 520, 740, 470, 4, GOLD_DK, 0.9);
thickLine(830, 560, 850, 500, 4, GOLD_DK, 0.9);
thickLine(860, 740, 900, 780, 4, GOLD_DK, 0.9);
// sparks
seed = 99;
for (let i = 0; i < 60; i++) {
  const x = 640 + rnd() * 380, y = 420 + rnd() * 420;
  const c: RGB = [MAGENTA, CYAN, YELLOW, WHITE][i % 4];
  const r = 1 + rnd() * 3;
  circle(x, y, r, c);
  if (rnd() < 0.4) { thickLine(x - 8, y, x + 8, y, 2, c, 0.8); thickLine(x, y - 8, x, y + 8, 2, c, 0.8); }
}

// ---------- 6. the reaching hand (canvas space, bursting out) ----------
// A bright flash where the hand tears through the canvas
glow(760, 620, 200, [255, 220, 160], 0.35);
// no forearm drawn: the hand bursts straight out of the glow and the
// broken corner, which reads cleaner than any stub arm at this scale
// (a short stub looked like a detached digit)
// palm, big and bright, centre-right, tilted toward the viewer
ellipse(806, 556, 88, 100, SKIN);
ellipse(776, 534, 50, 58, SKIN_HI, 0.6);
ellipse(836, 590, 44, 52, SKIN_DK, 0.25);
// fingers reaching up-right, each drawn as two segments so they curve
// slightly outward like a hand opening toward the viewer
function finger(x0: number, y0: number, mx: number, my: number, x1: number, y1: number, w: number): void {
  thickLine(x0, y0, mx, my, w, SKIN);
  thickLine(mx, my, x1, y1, w * 0.88, SKIN);
  thickLine(x0, y0, mx, my, w * 0.5, SKIN_HI, 0.5);
  circle(x1, y1, w * 0.4, SKIN_HI);
  // fingertip nail
  ellipse(x1, y1 - 4, w * 0.22, w * 0.3, [250, 225, 200], 0.9);
}
finger(766, 472, 736, 400, 706, 332, 34); // index
finger(806, 454, 788, 380, 772, 302, 36); // middle
finger(848, 464, 852, 392, 854, 322, 34); // ring
finger(886, 490, 912, 436, 930, 384, 30); // pinky
// thumb: a tapered capsule sweeping down-left from the palm's edge
thickLine(724, 566, 676, 612, 34, SKIN);
thickLine(676, 612, 644, 646, 28, SKIN);
thickLine(724, 566, 676, 612, 18, SKIN_HI, 0.5);
circle(640, 650, 13, SKIN_HI);
// knuckle creases (short, dark, only between fingers)
thickLine(782, 478, 752, 556, 4, SKIN_DK, 0.8);
thickLine(826, 468, 808, 556, 4, SKIN_DK, 0.8);
thickLine(866, 478, 856, 556, 4, SKIN_DK, 0.8);
// rim light: thin, only on the outer (right) edge of each finger,
// so it reads as light, not as neon sticks
thickLine(706, 332, 736, 400, 3, CYAN, 0.7);
thickLine(772, 302, 788, 380, 3, CYAN, 0.7);
thickLine(854, 322, 852, 392, 3, CYAN, 0.7);
thickLine(930, 384, 912, 436, 3, CYAN, 0.7);
thickLine(886, 490, 848, 556, 3, CYAN, 0.55);
thickLine(766, 472, 724, 566, 3, MAGENTA, 0.6);
thickLine(644, 646, 676, 612, 3, MAGENTA, 0.55);
// motion streaks: only to the RIGHT of the hand, never across the face
// or the fingers (hand ends near x=945)
for (let i = 0; i < 4; i++) {
  const y = 420 + i * 52;
  thickLine(958, y, 1010, y - 24, 4, i % 2 === 0 ? CYAN : MAGENTA, 0.5);
}

// ---------- 7. vignette ----------
vignette(0.7);

// ---------- 8. text: IT ESCAPED. (5x7 block font, huge, clean) ----------
const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
function drawText(text: string, x0: number, y0: number, s: number, c: RGB): void {
  let cx = x0;
  for (const ch of text) {
    const g = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === '1') fillRect(cx + col * s, y0 + r * s, cx + (col + 1) * s, y0 + (r + 1) * s, c);
      }
    }
    cx += 6 * s;
  }
}
const TEXT = 'IT ESCAPED.';
const TS = 12; // cell scale -> letters 84px tall
const textW = TEXT.length * 6 * TS - TS;
const tx = Math.round((W - textW) / 2);
const ty = 886;
// magenta drop shadow, then dark outline, then white
drawText(TEXT, tx + 9, ty + 9, TS, MAGENTA);
drawText(TEXT, tx - 3, ty - 3, TS, INK);
drawText(TEXT, tx + 3, ty - 3, TS, INK);
drawText(TEXT, tx - 3, ty + 3, TS, INK);
drawText(TEXT, tx + 3, ty + 3, TS, INK);
drawText(TEXT, tx, ty, TS, WHITE);
// thin gold rule under the text
fillRect(tx, 986, tx + textW, 992, GOLD_HI);

// ---------- PNG encode (filter 0, zlib level 9) ----------
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'entry.png'), png);
