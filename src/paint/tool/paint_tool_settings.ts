import type { SettingsStorage } from '@/settings/storage/settings_storage.js';
import { PAINT_SHAPE_IMAGE_ID } from '@/paint/raster/paint_tile_raster.js';
import { paintShapeFind } from '@/paint/shape/paint_shape_catalog.js';
import type { PaintStrokeStyle } from '@/paint/stroke/paint_stroke_style.js';

/** Storage key of the paint tool settings. */
export const PAINT_TOOL_SETTINGS_STORAGE_KEY = 'aiworlded.paint.tool';

/** What a click with the paint tool does. */
export type PaintToolMode = 'paint' | 'erase' | 'pick';

/** Smallest and largest brush radius in world units. */
export const PAINT_TOOL_RADIUS_MIN = 0.02;
export const PAINT_TOOL_RADIUS_MAX = 4;

/** Smallest and largest stencil repeat size in world units. */
export const PAINT_TOOL_STENCIL_SCALE_MIN = 0.05;
export const PAINT_TOOL_STENCIL_SCALE_MAX = 16;

/** Most recent colors remembered. */
export const PAINT_TOOL_RECENT_COLORS = 10;

/** Saved form of the settings. */
interface PaintToolSettingsSnapshot {
  mode: PaintToolMode;
  color: number;
  opacity: number;
  hardness: number;
  radius: number;
  shape: string;
  stencilTextureId: string;
  stencilScale: number;
  stampTextureId: string;
  recentColors: number[];
}

/** Listener for settings changes. */
export type PaintToolSettingsListener = () => void;

/**
 * Clamps a number into a range, falling back for non-numbers.
 *
 * @param value Candidate.
 * @param min Minimum.
 * @param max Maximum.
 * @param fallback Value used when the candidate is not a finite number.
 * @returns Clamped value.
 */
function paintToolClamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

/**
 * Current brush of the paint tool: mode, color, size, softness, strength,
 * shape, stencil and stamp image. Changes are saved so the brush is the same
 * next session.
 */
export class PaintToolSettings {
  private readonly listeners = new Set<PaintToolSettingsListener>();
  private snapshot: PaintToolSettingsSnapshot;
  private lastDrawMode: 'paint' | 'erase';

  /**
   * Creates settings, loading saved values when storage is given.
   *
   * @param storage Settings storage, or null to keep them in memory.
   */
  constructor(private readonly storage: SettingsStorage | null) {
    this.snapshot = PaintToolSettings.parse(storage?.getItem(PAINT_TOOL_SETTINGS_STORAGE_KEY) ?? null);
    this.lastDrawMode = this.snapshot.mode === 'erase' ? 'erase' : 'paint';
  }

  /**
   * Parses saved settings, keeping defaults for anything missing or invalid.
   *
   * @param text Saved JSON, or null.
   * @returns Snapshot.
   */
  static parse(text: string | null): PaintToolSettingsSnapshot {
    const defaults: PaintToolSettingsSnapshot = {
      mode: 'paint',
      color: 0xd9482b,
      opacity: 1,
      hardness: 0.7,
      radius: 0.15,
      shape: 'round',
      stencilTextureId: '',
      stencilScale: 1,
      stampTextureId: '',
      recentColors: [0xd9482b, 0xf2c14e, 0x3a7d44, 0x2b6cb0, 0x6b4f3a, 0x1f1f1f, 0xf4f1ea],
    };
    if (text === null) return defaults;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return defaults;
    }
    if (typeof value !== 'object' || value === null) return defaults;
    const record = value as Record<string, unknown>;
    const mode = record['mode'];
    const recent = Array.isArray(record['recentColors'])
      ? record['recentColors'].filter((color): color is number => typeof color === 'number' && color >= 0)
      : defaults.recentColors;
    return {
      mode: mode === 'erase' ? 'erase' : 'paint',
      color: Math.round(paintToolClamp(record['color'], 0, 0xffffff, defaults.color)),
      opacity: paintToolClamp(record['opacity'], 0.02, 1, defaults.opacity),
      hardness: paintToolClamp(record['hardness'], 0, 1, defaults.hardness),
      radius: paintToolClamp(record['radius'], PAINT_TOOL_RADIUS_MIN, PAINT_TOOL_RADIUS_MAX, defaults.radius),
      shape: typeof record['shape'] === 'string' ? record['shape'] : defaults.shape,
      stencilTextureId: typeof record['stencilTextureId'] === 'string' ? record['stencilTextureId'] : '',
      stencilScale: paintToolClamp(
        record['stencilScale'],
        PAINT_TOOL_STENCIL_SCALE_MIN,
        PAINT_TOOL_STENCIL_SCALE_MAX,
        defaults.stencilScale,
      ),
      stampTextureId: typeof record['stampTextureId'] === 'string' ? record['stampTextureId'] : '',
      recentColors: recent.slice(0, PAINT_TOOL_RECENT_COLORS).map((color) => Math.round(color) & 0xffffff),
    };
  }

  /**
   * Adds a change listener.
   *
   * @param listener Listener.
   * @returns Removes the listener.
   */
  listen(listener: PaintToolSettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Click mode. */
  get mode(): PaintToolMode {
    return this.snapshot.mode;
  }

  /** Last paint or erase mode, which picking a color returns to. */
  get drawMode(): 'paint' | 'erase' {
    return this.lastDrawMode;
  }

  /** Paint color as 0xRRGGBB. */
  get color(): number {
    return this.snapshot.color;
  }

  /** Strength 0..1. */
  get opacity(): number {
    return this.snapshot.opacity;
  }

  /** Edge hardness 0..1. */
  get hardness(): number {
    return this.snapshot.hardness;
  }

  /** Radius in world units. */
  get radius(): number {
    return this.snapshot.radius;
  }

  /** Shape id. */
  get shape(): string {
    return this.snapshot.shape;
  }

  /** Stencil texture id, empty for none. */
  get stencilTextureId(): string {
    return this.snapshot.stencilTextureId;
  }

  /** Stencil repeat size in world units. */
  get stencilScale(): number {
    return this.snapshot.stencilScale;
  }

  /** Stamp image texture id used by the image shape. */
  get stampTextureId(): string {
    return this.snapshot.stampTextureId;
  }

  /** Recently used colors, newest first. */
  get recentColors(): readonly number[] {
    return this.snapshot.recentColors;
  }

  /**
   * Sets the click mode.
   *
   * @param mode Mode.
   */
  setMode(mode: PaintToolMode): void {
    if (mode !== 'pick') this.lastDrawMode = mode;
    this.update({ mode });
  }

  /**
   * Sets the paint color.
   *
   * @param color 0xRRGGBB.
   */
  setColor(color: number): void {
    this.update({ color: Math.round(color) & 0xffffff });
  }

  /**
   * Moves a color to the front of the recent colors.
   *
   * @param color 0xRRGGBB.
   */
  rememberColor(color: number): void {
    const rest = this.snapshot.recentColors.filter((recent) => recent !== color);
    this.update({ recentColors: [color, ...rest].slice(0, PAINT_TOOL_RECENT_COLORS) });
  }

  /**
   * Sets the strength.
   *
   * @param opacity 0..1.
   */
  setOpacity(opacity: number): void {
    this.update({ opacity: paintToolClamp(opacity, 0.02, 1, this.opacity) });
  }

  /**
   * Sets the edge hardness.
   *
   * @param hardness 0..1.
   */
  setHardness(hardness: number): void {
    this.update({ hardness: paintToolClamp(hardness, 0, 1, this.hardness) });
  }

  /**
   * Sets the radius.
   *
   * @param radius World units.
   */
  setRadius(radius: number): void {
    this.update({ radius: paintToolClamp(radius, PAINT_TOOL_RADIUS_MIN, PAINT_TOOL_RADIUS_MAX, this.radius) });
  }

  /**
   * Scales the radius by a factor.
   *
   * @param factor Factor.
   */
  scaleRadius(factor: number): void {
    this.setRadius(this.radius * factor);
  }

  /**
   * Sets the shape.
   *
   * @param shape Shape id, or the image shape id.
   */
  setShape(shape: string): void {
    this.update({ shape });
  }

  /**
   * Sets the stencil texture.
   *
   * @param textureId Texture id, empty for none.
   */
  setStencilTextureId(textureId: string): void {
    this.update({ stencilTextureId: textureId });
  }

  /**
   * Sets the stencil repeat size.
   *
   * @param scale World units.
   */
  setStencilScale(scale: number): void {
    this.update({
      stencilScale: paintToolClamp(
        scale,
        PAINT_TOOL_STENCIL_SCALE_MIN,
        PAINT_TOOL_STENCIL_SCALE_MAX,
        this.stencilScale,
      ),
    });
  }

  /**
   * Sets the stamp image and switches to the image shape.
   *
   * @param textureId Texture id.
   */
  setStampTextureId(textureId: string): void {
    this.update({ stampTextureId: textureId, shape: textureId === '' ? 'round' : PAINT_SHAPE_IMAGE_ID });
  }

  /**
   * Returns the stroke style for the current settings; the radius is in world
   * units.
   *
   * @returns Style.
   */
  style(): PaintStrokeStyle {
    const image = this.shape === PAINT_SHAPE_IMAGE_ID && this.stampTextureId !== '';
    const erase = this.mode === 'erase';
    return {
      mode: erase ? 'erase' : 'paint',
      shape: image ? PAINT_SHAPE_IMAGE_ID : erase ? 'round' : paintShapeFind(this.shape).id,
      stencilTextureId: this.stencilTextureId,
      stencilScale: this.stencilScale,
      stampTextureId: image ? this.stampTextureId : '',
      color: this.color,
      opacity: this.opacity,
      hardness: this.hardness,
      radius: this.radius,
    };
  }

  /**
   * Applies a change, saves it and notifies listeners.
   *
   * @param change Changed fields.
   */
  private update(change: Partial<PaintToolSettingsSnapshot>): void {
    const next = { ...this.snapshot, ...change };
    const keys = Object.keys(change) as (keyof PaintToolSettingsSnapshot)[];
    if (keys.every((key) => next[key] === this.snapshot[key])) return;
    this.snapshot = next;
    this.storage?.setItem(
      PAINT_TOOL_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...this.snapshot, mode: this.lastDrawMode }),
    );
    for (const listener of this.listeners) listener();
  }
}
