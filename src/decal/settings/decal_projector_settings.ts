import { isDefaultCheckerTextureId } from '@/texture/library/texture_id.js';
import type * as THREE from 'three';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { MODIFIER_STACK_USERDATA_KEY } from '@/modifier/volume/modifier_volume_record.js';
import type { ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import {
  MODIFIER_STACK_DECAL_KEYS,
  MODIFIER_STACK_KIND_DECAL,
} from '@/modifier/stack/kinds/decal/modifier_stack_kind_decal.js';

/**
 * How a decal projector shows its image: drawn on the surfaces it reaches with
 * a depth bias, or as a welded mesh lifted off those surfaces.
 */
export type DecalProjectorMode = 'projector' | 'surfaceMesh';

/** Settings of one decal projector, read from its Decal modifier. */
export interface DecalProjectorSettings {
  /** Presentation mode. */
  mode: DecalProjectorMode;
  /** Texture library id of the image, or an empty string for the checker. */
  textureId: string;
  /** Stacking layer: higher layers draw over lower ones where they overlap. */
  layer: number;
  /** Image opacity from 0 to 1. */
  opacity: number;
  /**
   * Steepest surface angle to the projection direction that still receives the
   * image, in degrees.
   */
  facingLimitDegrees: number;
  /** Lift of the surface mesh, and of exported decals, in model units. */
  liftDistance: number;
  /** True paints only the surfaces the projection reaches first. */
  firstHitOnly: boolean;
  /** True lays a surface mesh image flat across creases like a sticker. */
  unfoldSticker: boolean;
}

/** Settings read per stored parameter record; a stack write makes a new one. */
const decalSettingsByParameters = new WeakMap<object, DecalProjectorSettings>();

/** Reads decal projector settings from the modifier stack of their volume. */
export class DecalProjectorSettingsStore {
  /**
   * Returns whether an object is a decal projector whose Decal modifier is on.
   *
   * @param object Candidate scene object.
   * @returns True for enabled decal projectors.
   */
  static isActiveProjector(object: THREE.Object3D): boolean {
    if (!ModifierVolume.isDecal(object)) return false;
    const stack = DecalProjectorSettingsStore.storedStack(object);
    return stack.enabled !== false && DecalProjectorSettingsStore.decalParameters(stack) !== undefined;
  }

  /**
   * Reads an object's settings. Reads are cached until the stack is written.
   *
   * @param object Decal projector volume.
   * @returns Settings with every field valid.
   */
  static read(object: THREE.Object3D): DecalProjectorSettings {
    const parameters = DecalProjectorSettingsStore.decalParameters(DecalProjectorSettingsStore.storedStack(object));
    if (!parameters) return DecalProjectorSettingsStore.fromParameters({});
    const known = decalSettingsByParameters.get(parameters);
    if (known) return known;
    const settings = DecalProjectorSettingsStore.fromParameters(parameters);
    decalSettingsByParameters.set(parameters, settings);
    return settings;
  }

  /**
   * Converts Decal modifier parameters to settings.
   *
   * @param stored Stored or partial parameters.
   * @returns Settings with every field valid.
   */
  static fromParameters(stored: Record<string, unknown>): DecalProjectorSettings {
    const kind = modifierStackKindFind(MODIFIER_STACK_KIND_DECAL);
    const parameters = kind ? kind.normalizeParameters(stored) : stored;
    const keys = MODIFIER_STACK_DECAL_KEYS;
    return {
      mode: parameters[keys.mode] === 'surfaceMesh' ? 'surfaceMesh' : 'projector',
      textureId: decalTextureIdNormalize(parameters[keys.texture]),
      layer: Number(parameters[keys.layer]),
      opacity: Number(parameters[keys.opacity]),
      facingLimitDegrees: Number(parameters[keys.facingLimit]),
      liftDistance: Number(parameters[keys.liftDistance]),
      firstHitOnly: parameters[keys.firstHitOnly] === true,
      unfoldSticker: parameters[keys.unfoldSticker] === true,
    };
  }

  /**
   * Returns whether a decal lays its image out as an unfolded sticker.
   *
   * @param settings Normalized settings.
   * @returns True for surface meshes with unfolding on.
   */
  static unfolds(settings: DecalProjectorSettings): boolean {
    return settings.mode === 'surfaceMesh' && settings.unfoldSticker;
  }

  /**
   * Returns a key that changes whenever a setting that shapes the generated
   * geometry changes.
   *
   * @param settings Normalized settings.
   * @returns Geometry key.
   */
  static geometryKey(settings: DecalProjectorSettings): string {
    const unfold = DecalProjectorSettingsStore.unfolds(settings);
    return `${settings.mode}|${settings.facingLimitDegrees}|${settings.liftDistance}|${settings.firstHitOnly}|${unfold}`;
  }

  /**
   * Returns a key that changes whenever a setting that only affects shading
   * changes.
   *
   * @param settings Normalized settings.
   * @returns Appearance key.
   */
  static appearanceKey(settings: DecalProjectorSettings): string {
    return `${settings.mode}|${settings.textureId}|${settings.layer}|${settings.opacity}`;
  }

  /**
   * Returns the stored, already normalized stack without copying it.
   *
   * @param object Decal projector volume.
   * @returns Stored stack, possibly empty.
   */
  private static storedStack(object: THREE.Object3D): Partial<ModifierStackSettings> {
    const stored: unknown = object.userData[MODIFIER_STACK_USERDATA_KEY];
    return typeof stored === 'object' && stored !== null ? (stored as Partial<ModifierStackSettings>) : {};
  }

  /**
   * Finds the parameters of the stack's enabled Decal modifier.
   *
   * @param stack Stored stack.
   * @returns Parameter record, or undefined when there is none.
   */
  private static decalParameters(stack: Partial<ModifierStackSettings>): Record<string, unknown> | undefined {
    return stack.modifiers?.find((entry) => entry.kind === MODIFIER_STACK_KIND_DECAL && entry.enabled)?.parameters;
  }
}

/**
 * Reads a stored decal image id. The checker's own id and the empty default
 * both mean the checker, so they compare equal.
 *
 * @param value Stored parameter value.
 * @returns Library id, or an empty string for the checker.
 */
function decalTextureIdNormalize(value: unknown): string {
  const id = typeof value === 'string' ? value : '';
  return isDefaultCheckerTextureId(id) ? '' : id;
}
