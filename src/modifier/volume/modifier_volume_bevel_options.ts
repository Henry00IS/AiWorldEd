import { modifierVolumeRecordBevel } from './modifier_volume_record.js';
import type { Object3D } from 'three';

/** Convex geometry, trim chart, corner, and strip shading controls. */
export interface ModifierBevelOptions {
  /** Convex blend: .25 is chamfer, .5 is circular. */
  profile: number;
  /** Interpretation of the existing distance amount. */
  widthMode: 'offset' | 'width' | 'depth' | 'percent';
  /** Conservatively preserve space between neighbouring bevels. */
  clampOverlap: boolean;
  /** Simple intersects edge strips; patch adds a planar convex corner cut. */
  corner: 'simple' | 'patch';
  /** Follow the strip chart or independently axis-project corner caps. */
  capProjection: 'inherit' | 'axis';
  /** Empty follows the ordinary bevel texture. */
  capTextureId: string;
  /** Profile seam location, in texture turns. */
  trimSeam: number;
  /** Endpoint, midpoint, or opposite endpoint anchors the length chart. */
  trimOrigin: 'anchor' | 'center' | 'end';
  /** Lengthwise texture direction. */
  trimDirection: 'forward' | 'reverse';
  /** Flat preserves the old polygon normals. Smooth affects only profile strips. */
  normals: 'flat' | 'smooth';
}

/**
 * Normalizes untrusted or absent options to backwards-compatible defaults.
 *
 * @param input Optional saved fields.
 */
export function modifierBevelOptionsNormalize(input: Partial<ModifierBevelOptions> = {}): ModifierBevelOptions {
  return {
    profile: modifierBevelOptionNumber(input.profile, 0.5, 0.25, 0.5),
    widthMode: modifierBevelOptionChoice(input.widthMode, ['offset', 'width', 'depth', 'percent']),
    clampOverlap: input.clampOverlap === true,
    corner: input.corner === 'patch' ? 'patch' : 'simple',
    capProjection: input.capProjection === 'axis' ? 'axis' : 'inherit',
    capTextureId: typeof input.capTextureId === 'string' ? input.capTextureId : '',
    trimSeam: modifierBevelOptionNumber(input.trimSeam, 0, 0, 1),
    trimOrigin: modifierBevelOptionChoice(input.trimOrigin, ['anchor', 'center', 'end']),
    trimDirection: input.trimDirection === 'reverse' ? 'reverse' : 'forward',
    normals: input.normals === 'smooth' ? 'smooth' : 'flat',
  };
}

/**
 * Reads saved options without changing old scenes.
 *
 * @param volume Modifier object.
 */
export function modifierBevelOptionsRead(volume: Object3D): ModifierBevelOptions {
  const value: unknown = modifierVolumeRecordBevel(volume)['modifierBevelOptions'];
  return modifierBevelOptionsNormalize(value && typeof value === 'object' ? value : {});
}

/**
 * Stores a normalized copy for undo, duplication, and serialization.
 *
 * @param volume Modifier object.
 * @param options Optional controls.
 */
export function modifierBevelOptionsWrite(volume: Object3D, options?: Partial<ModifierBevelOptions>): void {
  modifierVolumeRecordBevel(volume)['modifierBevelOptions'] = modifierBevelOptionsNormalize(options);
}

/**
 * Accepts a finite number in a closed interval.
 *
 * @param value Saved value.
 * @param fallback Missing default.
 * @param min Lower bound.
 * @param max Upper bound.
 */
function modifierBevelOptionNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

/**
 * Accepts one known string, otherwise the first choice.
 *
 * @param value Saved choice.
 * @param choices Nonempty valid choices.
 */
function modifierBevelOptionChoice<T extends string>(value: T | undefined, choices: readonly [T, ...T[]]): T {
  return value !== undefined && choices.includes(value) ? value : choices[0];
}
