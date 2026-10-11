import type { AnimationDef, TileDef } from './manifest';
import { pieceCoverage, TRANSITION_PIECES, type Corner, type Edge } from './transitions';

/**
 * Procedurally drawn stand-ins for the Factorio graphics, used for any
 * animation or tile the manifest does not provide. Each placeholder is a
 * canvas spritesheet plus a regular AnimationDef/TileDef, so it goes through
 * exactly the same slicing and playback code as the real sprites.
 */

export interface PlaceholderAnimation {
  canvas: HTMLCanvasElement;
  def: AnimationDef;
}

export interface PlaceholderTile {
  canvas: HTMLCanvasElement;
  def: TileDef;
}

const PX = 32; // source pixels per tile for placeholders (scale 1)

function sheet(
  frameW: number,
  frameH: number,
  frames: number,
  lineLength: number,
  draw: (ctx: CanvasRenderingContext2D, frame: number) => void,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = frameW * lineLength;
  canvas.height = frameH * Math.ceil(frames / lineLength);
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < frames; i++) {
    ctx.save();
    ctx.translate((i % lineLength) * frameW, Math.floor(i / lineLength) * frameH);
    ctx.beginPath();
    ctx.rect(0, 0, frameW, frameH);
    ctx.clip();
    draw(ctx, i);
    ctx.restore();
  }
  return canvas;
}

const DIR_ANGLE: Record<string, number> = { north: -Math.PI / 2, east: 0, south: Math.PI / 2, west: Math.PI };

function belt(direction: string): PlaceholderAnimation {
  const frames = 16;
  const canvas = sheet(PX, PX, frames, frames, (ctx, f) => {
    ctx.translate(PX / 2, PX / 2);
    ctx.rotate(DIR_ANGLE[direction]);
    ctx.translate(-PX / 2, -PX / 2);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 3, PX, PX - 6);
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(0, 2, PX, 2);
    ctx.fillRect(0, PX - 4, PX, 2);
    // Chevrons moving in +x; one full chevron spacing per 16 frames.
    const spacing = 8;
    const offset = (f / frames) * spacing * 2;
    ctx.strokeStyle = '#8a8a8a';
    ctx.lineWidth = 2;
    for (let x = -spacing * 2; x < PX + spacing; x += spacing) {
      const cx = x + (offset % spacing);
      ctx.beginPath();
      ctx.moveTo(cx - 3, 8);
      ctx.lineTo(cx + 2, PX / 2);
      ctx.lineTo(cx - 3, PX - 8);
      ctx.stroke();
    }
  });
  return { canvas, def: { file: 'placeholder', width: PX, height: PX, frameCount: frames, animationSpeed: 0.5 } };
}

const EDGE: Record<string, [number, number]> = { north: [PX / 2, 0], east: [PX, PX / 2], south: [PX / 2, PX], west: [0, PX / 2] };
const OPPOSITE: Record<string, string> = { north: 'south', east: 'west', south: 'north', west: 'east' };

/** Quarter-circle belt entering moving `from` and leaving moving `to`. */
function beltCurve(from: string, to: string): PlaceholderAnimation {
  const frames = 16;
  const entry = EDGE[OPPOSITE[from]];
  const exit = EDGE[to];
  // The arc is centred on the tile corner shared by the entry and exit edges.
  const c: [number, number] = [entry[0] === PX / 2 ? exit[0] : entry[0], entry[1] === PX / 2 ? exit[1] : entry[1]];
  const a0 = Math.atan2(entry[1] - c[1], entry[0] - c[0]);
  const a1 = Math.atan2(exit[1] - c[1], exit[0] - c[0]);
  let delta = a1 - a0;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  const ccw = delta < 0;
  const r = PX / 2;
  const canvas = sheet(PX, PX, frames, frames, (ctx, f) => {
    const arc = (radius: number) => {
      ctx.beginPath();
      ctx.arc(c[0], c[1], radius, a0, a1, ccw);
    };
    ctx.lineWidth = PX - 6;
    ctx.strokeStyle = '#3a3a3a';
    arc(r);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#c9a227';
    arc(r - 13);
    ctx.stroke();
    arc(r + 13);
    ctx.stroke();
    ctx.strokeStyle = '#8a8a8a';
    ctx.lineWidth = 8;
    ctx.setLineDash([2, 6]);
    ctx.lineDashOffset = -(f / frames) * 16;
    arc(r);
    ctx.stroke();
  });
  return { canvas, def: { file: 'placeholder', width: PX, height: PX, frameCount: frames, animationSpeed: 0.5 } };
}

function gear(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, teeth: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.78;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function assembler(): PlaceholderAnimation {
  const frames = 32;
  const size = PX * 3;
  const canvas = sheet(size, size, frames, 8, (ctx, f) => {
    ctx.fillStyle = '#5b5f52';
    ctx.fillRect(3, 3, size - 6, size - 6);
    ctx.strokeStyle = '#2f312a';
    ctx.lineWidth = 3;
    ctx.strokeRect(4.5, 4.5, size - 9, size - 9);
    ctx.fillStyle = '#44473d';
    ctx.fillRect(14, 14, size - 28, size - 28);
    const a = (f / frames) * Math.PI * 2;
    gear(ctx, size * 0.42, size * 0.45, 22, 10, a, '#9c9f92');
    gear(ctx, size * 0.68, size * 0.66, 13, 7, -a * (10 / 7) + 0.2, '#b08d3b');
    // Corner bolts
    ctx.fillStyle = '#2f312a';
    for (const [x, y] of [[10, 10], [size - 10, 10], [10, size - 10], [size - 10, size - 10]]) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return { canvas, def: { file: 'placeholder', width: size, height: size, frameCount: frames, lineLength: 8, animationSpeed: 0.5 } };
}

function shadow(tilesW: number, tilesH: number, shiftX: number): PlaceholderAnimation {
  const w = PX * tilesW + PX;
  const h = PX * tilesH;
  const canvas = sheet(w, h, 1, 1, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.moveTo(PX * 0.5, h - 4);
    ctx.lineTo(w - 2, h - 4);
    ctx.lineTo(w - 2, 10);
    ctx.lineTo(w - PX, 4);
    ctx.closePath();
    ctx.fill();
  });
  return { canvas, def: { file: 'placeholder', width: w, height: h, shift: [shiftX, 0], drawAsShadow: true } };
}

function radar(): PlaceholderAnimation {
  const frames = 64;
  const size = PX * 3;
  const canvas = sheet(size, size, frames, 8, (ctx, f) => {
    const c = size / 2;
    ctx.fillStyle = '#4b4f47';
    ctx.beginPath();
    ctx.arc(c, c, size * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2c2e29';
    ctx.lineWidth = 3;
    ctx.stroke();
    const a = (f / frames) * Math.PI * 2;
    ctx.save();
    ctx.translate(c, c - 6);
    ctx.rotate(a);
    ctx.fillStyle = '#a7aba0';
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.36, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d14b3a';
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  });
  return { canvas, def: { file: 'placeholder', width: size, height: size, frameCount: frames, lineLength: 8, animationSpeed: 0.5 } };
}

function chest(): PlaceholderAnimation {
  const canvas = sheet(PX, PX, 1, 1, (ctx) => {
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(4, 5, PX - 8, PX - 9);
    ctx.strokeStyle = '#4e3115';
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 6, PX - 10, PX - 11);
    ctx.fillStyle = '#c0a060';
    ctx.fillRect(PX / 2 - 2, 12, 4, 5);
  });
  return { canvas, def: { file: 'placeholder', width: PX, height: PX } };
}

function pumpjackBase(): PlaceholderAnimation {
  const size = PX * 3;
  const canvas = sheet(size, size, 1, 1, (ctx) => {
    ctx.fillStyle = '#5a5648';
    ctx.fillRect(6, 10, size - 12, size - 16);
    ctx.strokeStyle = '#2e2b23';
    ctx.lineWidth = 3;
    ctx.strokeRect(7.5, 11.5, size - 15, size - 19);
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.arc(size * 0.3, size * 0.62, 7, 0, Math.PI * 2);
    ctx.fill();
  });
  return { canvas, def: { file: 'placeholder', width: size, height: size } };
}

function pumpjackHorsehead(): PlaceholderAnimation {
  const frames = 40;
  const w = PX * 3;
  const h = PX * 4;
  const canvas = sheet(w, h, frames, 8, (ctx, f) => {
    const pivot = [w * 0.55, h * 0.38];
    const swing = Math.sin((f / frames) * Math.PI * 2) * 0.28;
    // A-frame
    ctx.strokeStyle = '#3d3a31';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w * 0.4, h * 0.78);
    ctx.lineTo(pivot[0], pivot[1]);
    ctx.lineTo(w * 0.72, h * 0.78);
    ctx.stroke();
    // Walking beam with the horsehead on the left
    ctx.save();
    ctx.translate(pivot[0], pivot[1]);
    ctx.rotate(swing);
    ctx.fillStyle = '#c48a1e';
    ctx.fillRect(-w * 0.45, -4, w * 0.75, 8);
    ctx.fillStyle = '#a0701a';
    ctx.beginPath();
    ctx.moveTo(-w * 0.45, -12);
    ctx.quadraticCurveTo(-w * 0.55, 0, -w * 0.45, 14);
    ctx.lineTo(-w * 0.38, 14);
    ctx.lineTo(-w * 0.38, -12);
    ctx.fill();
    ctx.restore();
    // Polished rod
    const rodX = pivot[0] - Math.cos(swing) * w * 0.47;
    const rodY = pivot[1] - Math.sin(swing) * w * 0.47 + 14;
    ctx.strokeStyle = '#9a9a9a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rodX, rodY);
    ctx.lineTo(rodX, h * 0.8);
    ctx.stroke();
  });
  return {
    canvas,
    def: { file: 'placeholder', width: w, height: h, frameCount: frames, lineLength: 8, shift: [0, -0.5], animationSpeed: 0.5 },
  };
}

function turretBase(): PlaceholderAnimation {
  const size = PX * 2;
  const canvas = sheet(size, size, 1, 1, (ctx) => {
    ctx.fillStyle = '#4a4d45';
    ctx.beginPath();
    ctx.moveTo(size * 0.3, 4);
    ctx.lineTo(size * 0.7, 4);
    ctx.lineTo(size - 4, size * 0.3);
    ctx.lineTo(size - 4, size * 0.7);
    ctx.lineTo(size * 0.7, size - 4);
    ctx.lineTo(size * 0.3, size - 4);
    ctx.lineTo(4, size * 0.7);
    ctx.lineTo(4, size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2a2c27';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  return { canvas, def: { file: 'placeholder', width: size, height: size } };
}

function turretGun(direction: number, count: number): PlaceholderAnimation {
  const size = PX * 2;
  const canvas = sheet(size, size, 2, 2, (ctx, f) => {
    ctx.translate(size / 2, size / 2);
    ctx.rotate((direction / count) * Math.PI * 2);
    ctx.fillStyle = '#c48a1e';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f2f2f';
    ctx.fillRect(-6, -30, 4, 22);
    ctx.fillRect(2, -30, 4, 22);
    if (f === 1) {
      ctx.fillStyle = 'rgba(255, 220, 120, 0.9)';
      ctx.beginPath();
      ctx.arc(0, -31, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return { canvas, def: { file: 'placeholder', width: size, height: size, frameCount: 2, animationSpeed: 0.5, shift: [0, -0.25] } };
}

function biter(direction: number, count: number, size: number, body: string, legs: string): PlaceholderAnimation {
  const frames = 8;
  const canvas = sheet(size, size, frames, frames, (ctx, f) => {
    ctx.translate(size / 2, size / 2);
    ctx.rotate((direction / count) * Math.PI * 2);
    const r = size * 0.18;
    const step = Math.sin((f / frames) * Math.PI * 2) * r * 0.5;
    ctx.strokeStyle = legs;
    ctx.lineWidth = Math.max(1.5, size / 24);
    for (const side of [-1, 1]) {
      for (const k of [-1, 0, 1]) {
        const phase = k === 0 ? -step : step;
        ctx.beginPath();
        ctx.moveTo(side * r * 0.6, k * r * 0.7);
        ctx.lineTo(side * r * 1.9, k * r * 0.9 + phase * side);
        ctx.stroke();
      }
    }
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.4, r * 0.8, r * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -r * 1.1, r * 0.55, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  return { canvas, def: { file: 'placeholder', width: size, height: size, frameCount: frames, animationSpeed: 0.4 } };
}

function directional(prefix: string, count: number, build: (d: number, n: number) => PlaceholderAnimation) {
  return Object.fromEntries(Array.from({ length: count }, (_, d) => [`${prefix}/${d}`, () => build(d, count)]));
}

/** Builders for every animation key the game references. */
const ANIMATIONS: Record<string, () => PlaceholderAnimation> = {
  'transport-belt/north': () => belt('north'),
  'transport-belt/east': () => belt('east'),
  'transport-belt/south': () => belt('south'),
  'transport-belt/west': () => belt('west'),
  ...Object.fromEntries(
    ['north', 'east', 'south', 'west'].flatMap((from) =>
      ['north', 'east', 'south', 'west']
        .filter((to) => to !== from && to !== OPPOSITE[from])
        .map((to) => [`transport-belt/${from}_to_${to}`, () => beltCurve(from, to)]),
    ),
  ),
  'assembling-machine-1': assembler,
  'assembling-machine-1/shadow': () => shadow(3, 3, 0.5),
  radar,
  'radar/shadow': () => shadow(3, 3, 0.5),
  'wooden-chest': chest,
  pumpjack: pumpjackBase,
  'pumpjack/north': pumpjackHorsehead,
  'gun-turret': turretBase,
  ...directional('gun-turret/attacking_animation/dir', 64, turretGun),
  ...directional('small-biter/dir', 16, (d, n) => biter(d, n, PX * 1.5, '#9a8a5a', '#5d5236')),
  ...directional('medium-biter/dir', 16, (d, n) => biter(d, n, PX * 2.2, '#b05a4a', '#6a3328')),
};

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function groundTile(base: [number, number, number], speckle: [number, number, number], variants: number, layer: number): PlaceholderTile {
  const canvas = sheet(PX, PX, variants, variants, (ctx, v) => {
    ctx.fillStyle = `rgb(${base.join(',')})`;
    ctx.fillRect(0, 0, PX, PX);
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(hash(i, v * 97) * PX);
      const y = Math.floor(hash(v * 31, i) * PX);
      const k = 0.7 + hash(i, i + v) * 0.6;
      ctx.fillStyle = `rgb(${speckle.map((c) => Math.min(255, Math.floor(c * k))).join(',')})`;
      ctx.fillRect(x, y, 2, 2);
    }
  });
  return { canvas, def: { file: 'placeholder', size: PX, variants, layer } };
}

/**
 * Soft-edged piece of `tile` for one transition case: the tile's texture
 * kept only within a wavy band along the covered edges and a quarter disc at
 * covered corners. The waves are zero at the cell corners, so pieces in
 * neighbouring cells line up.
 */
function transitionTile(tile: PlaceholderTile, piece: string): PlaceholderTile {
  const variants = 4;
  const { edges, corners } = pieceCoverage(piece);
  const depth = PX * 0.42;
  const src = tile.canvas.getContext('2d')!.getImageData(0, 0, PX, PX).data;
  const canvas = document.createElement('canvas');
  canvas.width = PX * variants;
  canvas.height = PX;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(PX * variants, PX);
  const cornerPos: Record<Corner, [number, number]> = { ne: [PX, 0], se: [PX, PX], sw: [0, PX], nw: [0, 0] };
  // Distance into the cell from an edge, and position along that edge in [0, 1].
  const fromEdge = (e: Edge, x: number, y: number): [number, number] =>
    e === 'north' ? [y, x / PX] : e === 'south' ? [PX - y, x / PX] : e === 'west' ? [x, y / PX] : [PX - x, y / PX];
  for (let v = 0; v < variants; v++) {
    const wave = (t: number) =>
      Math.sin(t * Math.PI) * (Math.sin(t * Math.PI * (2 + v)) * 3 + Math.sin(t * Math.PI * (5 + v) + v) * 1.5);
    for (let y = 0; y < PX; y++) {
      for (let x = 0; x < PX; x++) {
        let inside = -Infinity; // signed distance inside the covered region, in px
        for (const e of edges) {
          const [d, t] = fromEdge(e, x + 0.5, y + 0.5);
          inside = Math.max(inside, depth + wave(t) - d);
        }
        for (const c of corners) {
          const [cx, cy] = cornerPos[c];
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          inside = Math.max(inside, depth - d);
        }
        const alpha = Math.max(0, Math.min(1, (inside + 1.5) / 3));
        const si = (y * PX + x) * 4;
        const di = (y * PX * variants + v * PX + x) * 4;
        img.data[di] = src[si];
        img.data[di + 1] = src[si + 1];
        img.data[di + 2] = src[si + 2];
        img.data[di + 3] = alpha * 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, def: { file: 'placeholder', size: PX, variants } };
}

const TILES: Record<string, () => PlaceholderTile> = {
  'grass-1': () => groundTile([66, 84, 38], [86, 104, 50], 8, 26),
  'dirt-1': () => groundTile([110, 86, 56], [128, 102, 68], 8, 19),
  'sand-1': () => groundTile([168, 140, 92], [186, 158, 108], 8, 8),
};

export function placeholderAnimation(key: string): PlaceholderAnimation | undefined {
  return ANIMATIONS[key]?.();
}

const PIECES = new Set(TRANSITION_PIECES);

/** A ground tile, or a transition piece of one ("grass-1/side/north"). */
export function placeholderTile(name: string): PlaceholderTile | undefined {
  const slash = name.indexOf('/');
  if (slash < 0) return TILES[name]?.();
  const base = TILES[name.slice(0, slash)] as (() => PlaceholderTile) | undefined;
  const piece = name.slice(slash + 1);
  return base && PIECES.has(piece) ? transitionTile(base(), piece) : undefined;
}

export const PLACEHOLDER_ANIMATION_KEYS = Object.keys(ANIMATIONS);
export const PLACEHOLDER_TILE_NAMES = Object.keys(TILES);
