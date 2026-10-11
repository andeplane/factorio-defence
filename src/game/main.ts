import { Container } from 'pixi.js';
import { TILE_PX } from '../engine/Camera';
import { Engine } from '../engine/Engine';
import { footprint, layerKeys, prototypeKeys, rotate, type Direction, type EntityPrototype } from '../engine/Entities';
import { orientationOf, SpriteStack } from '../engine/SpriteStack';
import { valueNoise } from '../engine/TileMap';
import { unitKeys } from '../engine/Units';
import { PROTOTYPES, TILE_NAMES, UNITS } from './prototypes';

const engine = new Engine();

function generateTile(x: number, y: number): number {
  const n = valueNoise(x / 24, y / 24, 1) * 0.7 + valueNoise(x / 7, y / 7, 2) * 0.3;
  if (n > 0.68) return 2; // sand
  if (n > 0.56) return 1; // dirt
  return 0; // grass
}

const proto = (name: string) => PROTOTYPES.find((p) => p.name === name)!;

function buildDemo(): void {
  const belt = proto('transport-belt');
  const assembler = proto('assembling-machine-1');
  const radar = proto('radar');
  const chest = proto('wooden-chest');
  const e = engine.entities;
  // A rectangular belt loop running clockwise.
  for (let x = -8; x < 8; x++) e.place(belt, x, -4, 'east');
  for (let y = -4; y < 4; y++) e.place(belt, 8, y, 'south');
  for (let x = 8; x > -8; x--) e.place(belt, x, 4, 'west');
  for (let y = 4; y > -4; y--) e.place(belt, -8, y, 'north');
  for (let i = 0; i < 4; i++) e.place(assembler, -7 + i * 4, -2, 'north');
  e.place(radar, -2, 6, 'north');
  e.place(chest, 9, -5, 'north');
  e.place(chest, 9, 5, 'north');
  e.place(proto('pumpjack'), -14, -6, 'north');
  e.place(proto('pumpjack'), -14, 2, 'north');
  for (const [x, y] of [[12, -8], [12, 6], [-4, 10], [-4, -10]]) e.place(proto('gun-turret'), x, y, 'north');

  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 22 + (i % 3) * 4;
    engine.units.spawn(i % 4 === 0 ? UNITS.mediumBiter : UNITS.smallBiter, Math.cos(a) * r, Math.sin(a) * r);
  }
}

/** Demo behaviour: biters roam a ring around the base, turrets track the nearest one in range. */
function runDemo(): void {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const turrets = [...engine.entities.all()].filter((e) => e.proto.name === 'gun-turret');
  const range = 18;
  engine.onTick((tick) => {
    for (const u of engine.units.all()) {
      if (!u.target && rand() < 0.02) {
        const a = rand() * Math.PI * 2;
        const r = 14 + rand() * 16;
        u.target = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      }
    }
    if (tick % 4) return;
    for (const t of turrets) {
      const cx = t.x + t.width / 2;
      const cy = t.y + t.height / 2;
      let best: { d: number; o: number } | null = null;
      for (const u of engine.units.all()) {
        const d = Math.hypot(u.x - cx, u.y - cy);
        if (d < range && (!best || d < best.d)) best = { d, o: orientationOf(u.x - cx, u.y - cy) };
      }
      t.working = best !== null;
      if (best) {
        // Turn at most 0.02 turns per update, the shortest way round.
        const diff = ((best.o - t.orientation + 1.5) % 1) - 0.5;
        t.orientation = (t.orientation + Math.max(-0.02, Math.min(0.02, diff)) + 1) % 1;
      }
    }
  });
}

class Ghost {
  readonly view = new Container();
  private key = '';
  private stack: SpriteStack | null = null;

  update(proto: EntityPrototype | null, x: number, y: number, dir: Direction, valid: boolean): void {
    const k = proto ? `${proto.name}:${dir}` : '';
    if (k !== this.key) {
      this.key = k;
      this.stack?.destroy();
      this.stack = null;
      if (proto) {
        const [w, h] = footprint(proto, dir);
        const keys = layerKeys(proto, proto.rotatable ? dir : 'north');
        this.stack = new SpriteStack(engine.assets, keys, proto.directionCount ?? 1, null, this.view);
        this.stack.setPosition((w / 2) * TILE_PX, (h / 2) * TILE_PX, 0);
        this.stack.update(0);
      }
    }
    this.view.visible = proto !== null;
    this.view.position.set(x * TILE_PX, y * TILE_PX);
    this.view.alpha = 0.55;
    this.view.tint = valid ? 0x80ff80 : 0xff6060;
  }
}

async function start(): Promise<void> {
  await engine.init({
    parent: document.getElementById('app')!,
    tileNames: TILE_NAMES,
    generateTile,
    animationKeys: [...PROTOTYPES.flatMap(prototypeKeys), ...Object.values(UNITS).flatMap(unitKeys)],
  });
  buildDemo();
  runDemo();

  const ghost = new Ghost();
  engine.overlay.addChild(ghost.view);

  const camera = engine.camera;
  const canvas = engine.app.canvas;
  let selected: EntityPrototype | null = null;
  let direction: Direction = 'east';
  let mouse = { x: 0, y: 0 };
  let dragging: { x: number; y: number } | null = null;
  let painting: 'place' | 'remove' | null = null;
  const keys = new Set<string>();

  const hover = () => {
    const w = camera.screenToWorld(mouse.x, mouse.y);
    const [fw, fh] = selected ? footprint(selected, direction) : [1, 1];
    // Centre multi-tile footprints on the cursor, like Factorio.
    return {
      x: Math.floor(w.x / TILE_PX - (fw - 1) / 2),
      y: Math.floor(w.y / TILE_PX - (fh - 1) / 2),
      tx: Math.floor(w.x / TILE_PX),
      ty: Math.floor(w.y / TILE_PX),
    };
  };

  const act = () => {
    const h = hover();
    if (painting === 'place' && selected) engine.entities.place(selected, h.x, h.y, direction);
    if (painting === 'remove') {
      const e = engine.entities.at(h.tx, h.ty);
      if (e) engine.entities.remove(e);
    }
  };

  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('pointerdown', (ev) => {
    mouse = { x: ev.offsetX, y: ev.offsetY };
    canvas.setPointerCapture(ev.pointerId);
    if (ev.button === 1 || (ev.button === 0 && (keys.has(' ') || !selected))) {
      dragging = { x: ev.clientX, y: ev.clientY };
    } else if (ev.button === 0) {
      painting = 'place';
      act();
    } else if (ev.button === 2) {
      painting = 'remove';
      act();
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    mouse = { x: ev.offsetX, y: ev.offsetY };
    if (dragging) {
      camera.panScreen(ev.clientX - dragging.x, ev.clientY - dragging.y);
      dragging = { x: ev.clientX, y: ev.clientY };
    } else if (painting) {
      act();
    }
  });
  const release = () => {
    dragging = null;
    painting = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      camera.zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.offsetX, ev.offsetY);
    },
    { passive: false },
  );

  const hotbar = document.getElementById('hotbar')!;
  const select = (p: EntityPrototype | null) => {
    selected = selected === p ? null : p;
    hotbar.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', PROTOTYPES[i] === selected));
  };
  PROTOTYPES.forEach((p, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<kbd>${i + 1}</kbd> ${p.name}`;
    b.addEventListener('click', () => select(p));
    hotbar.appendChild(b);
  });

  window.addEventListener('keydown', (ev) => {
    const k = ev.key.toLowerCase();
    keys.add(k);
    const n = Number.parseInt(k, 10);
    if (n >= 1 && n <= PROTOTYPES.length) select(PROTOTYPES[n - 1]);
    if (k === 'r') direction = rotate(direction, ev.shiftKey ? -1 : 1);
    if (k === 'q' || k === 'escape') select(null);
    if (k === '+' || k === '=') camera.zoomAt(1.25, camera.viewWidth / 2, camera.viewHeight / 2);
    if (k === '-') camera.zoomAt(0.8, camera.viewWidth / 2, camera.viewHeight / 2);
  });
  window.addEventListener('keyup', (ev) => keys.delete(ev.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  const info = document.getElementById('info')!;
  let fpsSmoothed = 60;
  engine.onFrame((dt) => {
    const speed = (600 * dt) / 1000 / camera.zoom;
    if (keys.has('w') || keys.has('arrowup')) camera.y -= speed;
    if (keys.has('s') || keys.has('arrowdown')) camera.y += speed;
    if (keys.has('a') || keys.has('arrowleft')) camera.x -= speed;
    if (keys.has('d') || keys.has('arrowright')) camera.x += speed;

    const h = hover();
    ghost.update(selected, h.x, h.y, direction, selected ? engine.entities.canPlace(selected, h.x, h.y, direction) : false);

    fpsSmoothed = fpsSmoothed * 0.95 + (1000 / Math.max(dt, 1)) * 0.05;
    info.textContent = [
      `${fpsSmoothed.toFixed(0)} fps · tick ${engine.tick}`,
      `zoom ${camera.zoom.toFixed(2)} · tile ${h.tx}, ${h.ty} (${engine.tiles.tileAt(h.tx, h.ty)})`,
      `${engine.entities.count} entities · ${engine.units.count} units · facing ${direction}`,
      engine.assets.hasFactorioAssets ? 'graphics: Factorio (local)' : 'graphics: placeholders',
    ].join('\n');
  });

  // Expose for debugging in the browser console.
  (window as unknown as { engine: Engine }).engine = engine;
}

start().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">${String(err)}</pre>`);
});
