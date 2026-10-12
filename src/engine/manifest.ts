/**
 * Asset manifest format, shared with the sprite extraction script.
 *
 * The manifest lives at `public/assets/factorio/manifest.json` and its image
 * paths are relative to `public/assets/factorio/` (mirroring Factorio's
 * `data/base/graphics/` layout). Field names follow Factorio's own
 * Animation/Sprite prototype fields (width, height, frame_count, line_length,
 * scale, shift, ...) in camelCase so values can be copied straight from the
 * Lua prototype definitions. See docs/ASSETS.md.
 */

export interface AnimationDef {
  /** Image path relative to the manifest directory. */
  file?: string;
  /** Multi-file animations (Factorio `filenames`), each holding `linesPerFile` rows. */
  files?: string[];
  linesPerFile?: number;
  /** Size of one frame in source pixels. */
  width: number;
  height: number;
  /** Pixel offset of the first frame inside the image. Default 0. */
  x?: number;
  y?: number;
  /** Number of frames. Default 1 (a static sprite). */
  frameCount?: number;
  /** Frames per row before wrapping. Default = frameCount. */
  lineLength?: number;
  /** Source-pixel to world-pixel scale. HR Factorio sprites use 0.5. Default 1. */
  scale?: number;
  /** Offset of the sprite centre from the entity centre, in tiles. Default [0, 0]. */
  shift?: [number, number];
  /** Frames advanced per game tick (60 ticks/s), like Factorio. Default 1. */
  animationSpeed?: number;
  /** Render in the shadow layer (Factorio `draw_as_shadow`). */
  drawAsShadow?: boolean;
  /** Additive blending, e.g. working lights (Factorio `blend_mode = "additive"`). */
  additive?: boolean;
  /** Ping-pong instead of looping (Factorio `run_mode = "forward-then-backward"`). */
  runMode?: 'forward' | 'backward' | 'forward-then-backward';
  /**
   * Colour multiplied into the sprite (Factorio `tint`), as {r, g, b, a} or
   * [r, g, b, a], in 0-1 or 0-255 like Factorio accepts. Used by the
   * greyscale mask layers of biters and turrets.
   */
  tint?: { r: number; g: number; b: number; a?: number } | number[];
  /** Playback order as 1-based frame indices (Factorio `frame_sequence`), e.g. a drill head's dig loop. */
  frameSequence?: number[];
}

export interface TileDef {
  /** Image containing `variants` square tile images laid out in a row. */
  file: string;
  /** Size of one variant in source pixels (32 for a 1x1 tile at scale 1). */
  size: number;
  x?: number;
  y?: number;
  /** Number of random variants laid out horizontally. Default 1. */
  variants?: number;
  scale?: number;
  /**
   * Draw order between tile types (Factorio's tile `layer`): a tile's
   * transition pieces are drawn over neighbouring tiles of lower layers.
   */
  layer?: number;
}

export interface AssetManifest {
  version: 1;
  /** Named animations/sprites. Keys are free-form, e.g. "transport-belt/east". */
  animations: Record<string, AnimationDef>;
  /** Ground tiles, keyed by tile name, e.g. "grass-1". */
  tiles?: Record<string, TileDef>;
}

export interface FrameRect {
  file: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Source rectangle of every frame of an animation, in playback order. */
export function frameRects(def: AnimationDef): FrameRect[] {
  const count = def.frameCount ?? 1;
  const lineLength = def.lineLength && def.lineLength > 0 ? def.lineLength : count;
  const files = def.files ?? (def.file ? [def.file] : []);
  if (files.length === 0) throw new Error('Animation has no file or files');
  const linesPerFile = def.linesPerFile ?? Number.MAX_SAFE_INTEGER;
  const rects: FrameRect[] = [];
  for (let i = 0; i < count; i++) {
    const line = Math.floor(i / lineLength);
    const fileIndex = Math.floor(line / linesPerFile);
    const lineInFile = line - fileIndex * linesPerFile;
    const file = files[Math.min(fileIndex, files.length - 1)];
    rects.push({
      file,
      x: (def.x ?? 0) + (i % lineLength) * def.width,
      y: (def.y ?? 0) + lineInFile * def.height,
      width: def.width,
      height: def.height,
    });
  }
  return rects;
}

/** Frame index to show at `tick`, honouring speed and run mode. */
export function frameAt(def: AnimationDef, tick: number): number {
  const count = def.frameCount ?? 1;
  if (count <= 1) return 0;
  const step = Math.floor(tick * (def.animationSpeed ?? 1));
  const seq = def.frameSequence;
  if (seq?.length) return Math.min(count - 1, Math.max(0, seq[step % seq.length] - 1));
  switch (def.runMode) {
    case 'backward':
      return count - 1 - (step % count);
    case 'forward-then-backward': {
      const period = 2 * count - 2;
      const p = step % period;
      return p < count ? p : period - p;
    }
    default:
      return step % count;
  }
}

/** Normalizes a Factorio tint to a 0xRRGGBB colour and an alpha in 0-1. */
export function parseTint(tint: AnimationDef['tint']): { color: number; alpha: number } | null {
  if (!tint) return null;
  let [r, g, b, a] = Array.isArray(tint) ? tint : [tint.r, tint.g, tint.b, tint.a];
  r ??= 0;
  g ??= 0;
  b ??= 0;
  a ??= Math.max(r, g, b) > 1 ? 255 : 1;
  // Factorio treats a colour as 0-255 when any component is above 1.
  const k = Math.max(r, g, b, a) > 1 ? 255 : 1;
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v / k)) * 255);
  return { color: (c(r) << 16) | (c(g) << 8) | c(b), alpha: Math.min(1, Math.max(0, a / k)) };
}
