import type { AnimationDef, TileDef } from './manifest';

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
};

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function groundTile(base: [number, number, number], speckle: [number, number, number], variants: number): PlaceholderTile {
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
  return { canvas, def: { file: 'placeholder', size: PX, variants } };
}

const TILES: Record<string, () => PlaceholderTile> = {
  'grass-1': () => groundTile([66, 84, 38], [86, 104, 50], 8),
  'dirt-1': () => groundTile([110, 86, 56], [128, 102, 68], 8),
  'sand-1': () => groundTile([168, 140, 92], [186, 158, 108], 8),
};

export function placeholderAnimation(key: string): PlaceholderAnimation | undefined {
  return ANIMATIONS[key]?.();
}

export function placeholderTile(name: string): PlaceholderTile | undefined {
  return TILES[name]?.();
}

export const PLACEHOLDER_ANIMATION_KEYS = Object.keys(ANIMATIONS);
export const PLACEHOLDER_TILE_NAMES = Object.keys(TILES);
