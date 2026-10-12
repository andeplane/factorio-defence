import { Container, Sprite, Texture } from 'pixi.js';
import type { Animation, AssetStore } from './Assets';
import { TILE_PX } from './Camera';
import type { Direction, Entity, EntityManager } from './Entities';
import { lanePoint, type Lane } from './beltGeometry';

/**
 * Plain description of a running factory, as a simulation would produce it
 * each tick. The view only draws it: it holds no game rules of its own.
 * Positions are tiles; any tile of a multi-tile entity identifies it.
 */
export interface FactoryViewState {
  /** Items on belts. `pos` runs 0 to 1 along the tile in the direction of travel. */
  beltItems: { x: number; y: number; lane: Lane; pos: number; item: string }[];
  /**
   * Inserter arms. `swing` is 0 with the hand over the pickup tile and 1
   * over the drop tile; `held` is the item in the hand, if any.
   */
  inserters: { x: number; y: number; swing: number; held: string | null }[];
  /** Machines (furnaces, assemblers, drills) and whether they are working. */
  machines: { x: number; y: number; working: boolean }[];
}

export const EMPTY_FACTORY_STATE: FactoryViewState = { beltItems: [], inserters: [], machines: [] };

/** Item icon size on belts and in hands, in world px (about 0.45 tiles, as in Factorio). */
export const ITEM_PX = 14;
/** Distance from an inserter's centre to its hand over the pickup/drop tile, in tiles. */
export const INSERTER_REACH = 1;
/** Heights (screen-up offsets, in tiles) of the arm's pivot, elbow and hand. */
const PIVOT_HEIGHT = 0.2;
const ELBOW_HEIGHT = 0.35;
const HAND_HEIGHT = 0.1;
/** How far the claw reaches past the hand point, as a fraction of the forearm. */
const CLAW_OVERHANG = 0.12;

const VEC: Record<Direction, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };

interface ArmSprites {
  base: Sprite;
  hand: Sprite;
  item: Sprite;
}

/**
 * Draws a FactoryViewState over the entities in an EntityManager: item icons
 * on belt lanes, inserter arms with open or closed hands and held items, and
 * machines' working state (furnace fire, assembler animation).
 */
export class FactoryView {
  private itemSprites: Sprite[] = [];
  private arms = new Map<number, ArmSprites>();
  private icons = new Map<string, Texture>();

  constructor(
    private assets: AssetStore,
    private entities: EntityManager,
    /** Container for belt items (above belts, under machines). */
    private itemLayer: Container,
    /** Container for inserter arms (above machines). */
    private armLayer: Container,
    /** Direction items enter a curved belt with, or undefined if straight. */
    private beltCurveFrom: (belt: Entity) => Direction | undefined,
  ) {
    entities.onChange((e, change) => {
      if (change === 'removed') this.dropArm(e.id);
    });
  }

  render(state: FactoryViewState): void {
    this.renderBeltItems(state.beltItems);
    this.renderInserters(state.inserters);
    for (const m of state.machines) {
      const e = this.entities.at(m.x, m.y);
      if (e) e.working = m.working;
    }
  }

  private renderBeltItems(items: FactoryViewState['beltItems']): void {
    let used = 0;
    for (const it of items) {
      const belt = this.entities.at(it.x, it.y);
      if (!belt) continue;
      const [ox, oy] = lanePoint(belt.direction, this.beltCurveFrom(belt), it.lane, it.pos);
      const s = this.itemSprites[used] ?? this.newItemSprite(this.itemLayer);
      this.itemSprites[used++] = s;
      s.visible = true;
      setIcon(s, this.icon(it.item));
      s.position.set((it.x + 0.5 + ox) * TILE_PX, (it.y + 0.5 + oy) * TILE_PX);
    }
    for (let i = used; i < this.itemSprites.length; i++) this.itemSprites[i].visible = false;
  }

  private renderInserters(inserters: FactoryViewState['inserters']): void {
    const seen = new Set<number>();
    for (const ins of inserters) {
      const e = this.entities.at(ins.x, ins.y);
      if (!e) continue;
      seen.add(e.id);
      const arm = this.arms.get(e.id) ?? this.newArm(e.id);
      // The arm sweeps half a turn, clockwise, from the pickup side to the drop side.
      const [px, py] = VEC[e.direction];
      const angle = Math.atan2(-py, -px) + Math.PI * Math.min(1, Math.max(0, ins.swing));
      const cx = (e.x + 0.5) * TILE_PX;
      const cy = (e.y + 0.5) * TILE_PX;
      const hx = cx + Math.cos(angle) * INSERTER_REACH * TILE_PX;
      const hy = cy + Math.sin(angle) * INSERTER_REACH * TILE_PX - HAND_HEIGHT * TILE_PX;
      // Two segments as in Factorio: the upper arm from the raised pivot to a
      // raised elbow halfway out, then the forearm down to the hand.
      const sx = cx;
      const sy = cy - PIVOT_HEIGHT * TILE_PX;
      const ex = (cx + hx) / 2;
      const ey = (cy + hy) / 2 - ELBOW_HEIGHT * TILE_PX;
      placeSegment(arm.base, sx, sy, ex, ey, 0);
      const hand = this.anim(ins.held ? 'inserter/hand_closed' : 'inserter/hand_open');
      if (hand) arm.hand.texture = hand.frames[0];
      placeSegment(arm.hand, ex, ey, hx, hy, CLAW_OVERHANG);
      arm.item.visible = ins.held !== null;
      if (ins.held) {
        setIcon(arm.item, this.icon(ins.held));
        arm.item.position.set(hx, hy);
      }
    }
    for (const id of [...this.arms.keys()]) if (!seen.has(id)) this.dropArm(id);
  }

  private newItemSprite(parent: Container): Sprite {
    const s = new Sprite();
    s.anchor.set(0.5);
    parent.addChild(s);
    return s;
  }

  private newArm(id: number): ArmSprites {
    const base = new Sprite(this.anim('inserter/hand_base')?.frames[0] ?? Texture.EMPTY);
    base.anchor.set(0.5, 1);
    base.scale.x = this.anim('inserter/hand_base')?.def.scale ?? 1;
    const hand = new Sprite(this.anim('inserter/hand_open')?.frames[0] ?? Texture.EMPTY);
    hand.anchor.set(0.5, 1);
    hand.scale.x = this.anim('inserter/hand_open')?.def.scale ?? 1;
    this.armLayer.addChild(base, hand);
    const item = this.newItemSprite(this.armLayer);
    const arm = { base, hand, item };
    this.arms.set(id, arm);
    return arm;
  }

  private dropArm(id: number): void {
    const arm = this.arms.get(id);
    if (!arm) return;
    arm.base.destroy();
    arm.hand.destroy();
    arm.item.destroy();
    this.arms.delete(id);
  }

  private anim(key: string): Animation | null {
    return this.assets.animation(key);
  }

  private icon(item: string): Texture {
    let tex = this.icons.get(item);
    if (!tex) {
      tex = this.anim(`icon/${item}`)?.frames[0] ?? Texture.WHITE;
      this.icons.set(item, tex);
    }
    return tex;
  }
}

/** Animation keys the view may draw, for preloading. */
export function factoryViewKeys(items: string[]): string[] {
  return ['inserter/hand_base', 'inserter/hand_open', 'inserter/hand_closed', ...items.map((i) => `icon/${i}`)];
}

/**
 * Stretches an arm sprite (anchored at its bottom centre, pointing up like
 * Factorio's hand sprites) from (x0, y0) to (x1, y1), plus `overhang` of its
 * length beyond the end.
 */
function placeSegment(s: Sprite, x0: number, y0: number, x1: number, y1: number, overhang: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  s.position.set(x0, y0);
  // Rotate the sprite's up (-y) onto the segment.
  s.rotation = Math.atan2(dy, dx) + Math.PI / 2;
  s.height = Math.max(2, Math.hypot(dx, dy) * (1 + overhang));
}

function setIcon(s: Sprite, tex: Texture): void {
  if (s.texture === tex) return;
  s.texture = tex;
  s.width = ITEM_PX;
  s.height = ITEM_PX;
}
