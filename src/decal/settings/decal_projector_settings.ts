import type * as THREE from 'three';

/** Scene userData key holding a decal projector's settings. */
export const DECAL_PROJECTOR_USERDATA_KEY = 'decalProjector';

/**
 * How a decal projector shows its image: drawn on the surfaces it reaches with
 * a depth bias, or as a welded mesh lifted off those surfaces.
 */
export type DecalProjectorMode = 'projector' | 'surfaceMesh';

/** Persistent settings of one decal projector volume. */
export interface DecalProjectorSettings {
  /** Presentation mode. */
  mode: DecalProjectorMode;
  /** Texture library id of the image, or an empty string for the checker. */
  textureId: string;
  /** Stacking layer: higher layers draw over lower ones where they overlap. */
  layer: number;
  /** Image opacity from 0 to 1. */
  opacity: number;
  /** Hex tint multiplied with the image. */
  tint: number;
  /**
   * Steepest surface angle to the projection direction that still receives the
   * image, in degrees.
   */
  facingLimitDegrees: number;
  /**
   * Lift of the surface mesh along the smoothed surface normals, in world
   * units.
   */
  liftDistance: number;
}

/** Reads, normalizes and writes decal projector settings on scene objects. */
export class DecalProjectorSettingsStore {
  /** Smallest lift a surface mesh may use, so it never sinks into its surface. */
  static readonly minimumLiftDistance = 0.0005;

  /**
   * Returns the settings a new decal projector starts with.
   *
   * @returns Fresh default settings.
   */
  static defaults(): DecalProjectorSettings {
    return {
      mode: 'projector',
      textureId: '',
      layer: 0,
      opacity: 1,
      tint: 0xffffff,
      facingLimitDegrees: 89,
      liftDistance: 0.002,
    };
  }

  /**
   * Returns whether an object carries decal projector settings.
   *
   * @param object Candidate scene object.
   * @returns True for decal projector volumes.
   */
  static isProjector(object: THREE.Object3D): boolean {
    const stored: unknown = object.userData[DECAL_PROJECTOR_USERDATA_KEY];
    return typeof stored === 'object' && stored !== null;
  }

  /**
   * Reads a normalized copy of an object's settings.
   *
   * @param object Decal projector volume.
   * @returns Settings with every field valid.
   */
  static read(object: THREE.Object3D): DecalProjectorSettings {
    const stored: unknown = object.userData[DECAL_PROJECTOR_USERDATA_KEY];
    const partial = typeof stored === 'object' && stored !== null ? (stored as Partial<DecalProjectorSettings>) : {};
    return DecalProjectorSettingsStore.normalize(partial);
  }

  /**
   * Stores normalized settings on an object.
   *
   * @param object Decal projector volume.
   * @param settings Settings to store; missing fields take their defaults.
   */
  static write(object: THREE.Object3D, settings: Partial<DecalProjectorSettings>): void {
    object.userData[DECAL_PROJECTOR_USERDATA_KEY] = DecalProjectorSettingsStore.normalize(settings);
  }

  /**
   * Fills missing fields and clamps every value into its valid range.
   *
   * @param partial Possibly incomplete settings.
   * @returns Complete, valid settings.
   */
  static normalize(partial: Partial<DecalProjectorSettings>): DecalProjectorSettings {
    return {
      mode: partial.mode === 'surfaceMesh' ? 'surfaceMesh' : 'projector',
      textureId: typeof partial.textureId === 'string' ? partial.textureId : '',
      ...DecalProjectorSettingsStore.numbersNormalize(partial),
    };
  }

  /**
   * Fills and clamps the numeric settings.
   *
   * @param partial Possibly incomplete settings.
   * @returns Every numeric setting, valid.
   */
  private static numbersNormalize(
    partial: Partial<DecalProjectorSettings>,
  ): Omit<DecalProjectorSettings, 'mode' | 'textureId'> {
    const defaults = DecalProjectorSettingsStore.defaults();
    const clamp = DecalProjectorSettingsStore.numberClamped;
    const lowestOffset = DecalProjectorSettingsStore.minimumLiftDistance;
    return {
      layer: clamp(partial.layer, defaults.layer, -1000, 1000, true),
      opacity: clamp(partial.opacity, defaults.opacity, 0, 1, false),
      tint: clamp(partial.tint, defaults.tint, 0, 0xffffff, true),
      facingLimitDegrees: clamp(partial.facingLimitDegrees, defaults.facingLimitDegrees, 0, 180, false),
      liftDistance: clamp(partial.liftDistance, defaults.liftDistance, lowestOffset, 1, false),
    };
  }

  /**
   * Returns a finite number clamped into a range, or a fallback.
   *
   * @param value Candidate value.
   * @param fallback Value used when the candidate is not a finite number.
   * @param minimum Lowest allowed value.
   * @param maximum Highest allowed value.
   * @param integer True to round to the nearest integer.
   * @returns Valid number.
   */
  private static numberClamped(
    value: unknown,
    fallback: number,
    minimum: number,
    maximum: number,
    integer: boolean,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    const clamped = Math.min(maximum, Math.max(minimum, value));
    return integer ? Math.round(clamped) : clamped;
  }

  /**
   * Returns a key that changes whenever a setting that shapes the generated
   * geometry changes.
   *
   * @param settings Normalized settings.
   * @returns Geometry key.
   */
  static geometryKey(settings: DecalProjectorSettings): string {
    return `${settings.mode}|${settings.facingLimitDegrees}|${settings.liftDistance}`;
  }

  /**
   * Returns a key that changes whenever a setting that only affects shading
   * changes.
   *
   * @param settings Normalized settings.
   * @returns Appearance key.
   */
  static appearanceKey(settings: DecalProjectorSettings): string {
    return `${settings.mode}|${settings.textureId}|${settings.layer}|${settings.opacity}|${settings.tint}`;
  }
}
