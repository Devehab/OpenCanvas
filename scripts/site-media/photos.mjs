/**
 * Procedural sample photos for the landing page media (no stock photos, no
 * licensing questions): a desert sunset, a mountain lake, a night city, a
 * bokeh still life and a simple logo.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(new URL('../../packages/renderer/package.json', import.meta.url));
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const fontsDir = new URL('../../node_modules/.pnpm/', import.meta.url).pathname;
GlobalFonts.registerFromPath(
  join(fontsDir, '@fontsource+inter@5.3.0/node_modules/@fontsource/inter/files/inter-latin-800-normal.woff2'),
  'Inter',
);

/** Deterministic pseudo-random numbers so the media is reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gradient(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function ridge(ctx, w, base, amp, seed, color, step = 40) {
  const r = rng(seed);
  ctx.beginPath();
  ctx.moveTo(0, base);
  let y = base;
  for (let x = 0; x <= w + step; x += step) {
    y = Math.max(base - amp, Math.min(base + amp * 0.4, y + (r() - 0.5) * amp * 0.6));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, 4000);
  ctx.lineTo(0, 4000);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function desertSunset(w = 1600, h = 1067) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = gradient(ctx, 0, 0, 0, h, [
    [0, '#2b1055'],
    [0.45, '#d53369'],
    [0.75, '#f7944d'],
    [1, '#ffd29d'],
  ]);
  ctx.fillRect(0, 0, w, h);
  // Sun with glow.
  const sun = ctx.createRadialGradient(w * 0.62, h * 0.58, 10, w * 0.62, h * 0.58, h * 0.45);
  sun.addColorStop(0, 'rgba(255,240,200,1)');
  sun.addColorStop(0.18, 'rgba(255,214,140,0.95)');
  sun.addColorStop(0.4, 'rgba(255,150,90,0.35)');
  sun.addColorStop(1, 'rgba(255,120,80,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  // Dunes.
  const dunes = ['#c2552f', '#9c3f22', '#6e2a17', '#45190e'];
  dunes.forEach((color, i) => {
    const base = h * (0.66 + i * 0.09);
    ctx.beginPath();
    ctx.moveTo(0, base);
    for (let x = 0; x <= w; x += 20) {
      ctx.lineTo(
        x,
        base + Math.sin(x / (260 + i * 60) + i * 1.7) * (40 + i * 10) - Math.sin(x / 700 + i) * 30,
      );
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  });
  // Crescent moon (drawn on its own canvas so the cut-out keeps the sky).
  const moon = createCanvas(120, 120);
  const m = moon.getContext('2d');
  m.fillStyle = 'rgba(255,245,220,0.95)';
  m.beginPath();
  m.arc(60, 60, 46, 0, Math.PI * 2);
  m.fill();
  m.globalCompositeOperation = 'destination-out';
  m.beginPath();
  m.arc(80, 48, 42, 0, Math.PI * 2);
  m.fill();
  ctx.drawImage(moon, w * 0.2 - 60, h * 0.17 - 60);
  const r = rng(7);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
    ctx.beginPath();
    ctx.arc(r() * w, r() * h * 0.38, r() * 1.8 + 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Palm silhouette.
  ctx.strokeStyle = '#2a0f08';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.14, h);
  ctx.quadraticCurveTo(w * 0.17, h * 0.75, w * 0.13, h * 0.55);
  ctx.stroke();
  ctx.fillStyle = '#2a0f08';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI + (i / 6) * Math.PI;
    ctx.save();
    ctx.translate(w * 0.13, h * 0.55);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(70, 0, 80, 14, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return c.toBuffer('image/jpeg', 90);
}

export function mountainLake(w = 1600, h = 1067) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = gradient(ctx, 0, 0, 0, h * 0.6, [
    [0, '#5ab0f0'],
    [1, '#d9f0ff'],
  ]);
  ctx.fillRect(0, 0, w, h);
  ridge(ctx, w, h * 0.42, 160, 3, '#7f9cc4', 60);
  ridge(ctx, w, h * 0.5, 120, 5, '#4f6f9b', 50);
  ridge(ctx, w, h * 0.58, 70, 9, '#2f4a6b', 30);
  // Lake with reflection.
  ctx.fillStyle = gradient(ctx, 0, h * 0.62, 0, h, [
    [0, '#7fb6e0'],
    [1, '#1f4d72'],
  ]);
  ctx.fillRect(0, h * 0.62, w, h);
  ctx.globalAlpha = 0.25;
  ctx.save();
  ctx.translate(0, h * 1.24);
  ctx.scale(1, -1);
  ridge(ctx, w, h * 0.58, 70, 9, '#2f4a6b', 30);
  ctx.restore();
  ctx.globalAlpha = 1;
  // Pines in front.
  const r = rng(11);
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const s = 60 + r() * 90;
    const y = h * 0.64;
    ctx.fillStyle = '#163021';
    ctx.beginPath();
    ctx.moveTo(x, y - s * 2.2);
    ctx.lineTo(x + s * 0.5, y);
    ctx.lineTo(x - s * 0.5, y);
    ctx.closePath();
    ctx.fill();
  }
  return c.toBuffer('image/jpeg', 90);
}

export function nightCity(w = 1600, h = 1067) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = gradient(ctx, 0, 0, 0, h, [
    [0, '#0b1026'],
    [0.6, '#2a1b5c'],
    [1, '#ff6fa8'],
  ]);
  ctx.fillRect(0, 0, w, h);
  const r = rng(21);
  let x = 0;
  while (x < w) {
    const bw = 60 + r() * 120;
    const bh = h * (0.25 + r() * 0.5);
    ctx.fillStyle = `hsl(${240 + r() * 30}, 35%, ${10 + r() * 8}%)`;
    ctx.fillRect(x, h - bh, bw - 6, bh);
    for (let wy = h - bh + 16; wy < h - 20; wy += 22) {
      for (let wx = x + 10; wx < x + bw - 20; wx += 18) {
        if (r() > 0.55) {
          ctx.fillStyle = r() > 0.2 ? 'rgba(255,214,120,0.9)' : 'rgba(120,200,255,0.9)';
          ctx.fillRect(wx, wy, 8, 11);
        }
      }
    }
    x += bw;
  }
  return c.toBuffer('image/jpeg', 90);
}

export function bokeh(w = 1600, h = 1067) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = gradient(ctx, 0, 0, w, h, [
    [0, '#14b8a6'],
    [0.5, '#6366f1'],
    [1, '#ec4899'],
  ]);
  ctx.fillRect(0, 0, w, h);
  const r = rng(33);
  for (let i = 0; i < 70; i++) {
    const rad = 20 + r() * 110;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(r() * w, r() * h);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return c.toBuffer('image/jpeg', 90);
}

/** A simple logo with transparency: a palm-leaf mark and a wordmark. */
export function logo(name = 'NAKHLA', color = '#7c3aed') {
  const w = 900;
  const h = 300;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(150, 150, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.translate(150, 175);
    ctx.rotate(-Math.PI / 2 + (i - 2) * 0.45);
    ctx.beginPath();
    ctx.ellipse(55, 0, 60, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#111827';
  ctx.font = '800 110px Inter';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 300, 158);
  return c.toBuffer('image/png');
}
