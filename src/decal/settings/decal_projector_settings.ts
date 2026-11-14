import { isDefaultCheckerTextureId } from '@/texture/library/texture_id.js';
import type * as THREE from 'three';
import type { DecalImageWindow } from '@/decal/image/decal_image_window.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { MODIFIER_STACK_USERDATA_KEY } from '@/modifier/volume/modifier_volume_record.js';
import type { ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import {
  MODIFIER_STACK_DECAL_HITS,
  MODIFIER_STACK_DECAL_KEYS,
  MODIFIER_STACK_DECAL_WRAPS,
  MODIFIER_STACK_KIND_DECAL,
} from '@/modifier/stack/kinds/decal/modifier_stack_kind_decal.js';

/** Settings of one decal projector, read from its Decal modifier. */
export interface DecalProjectorSettings {
  /** Texture library id of the image, or an empty string for the checker. */
  textureId: string;
  /** Part of the texture shown, and how it is turned and mirrored. */
  window: DecalImageWindow;
  /** Stacking layer: higher layers draw over lower ones where they overlap. */
  layer: number;
  /**
   * Steepest surface angle to the projection direction that still receives the
   * image, in degrees.
   */
  facingLimitDegrees: number;
  /** Distance the decal floats above its surfaces, in model units. */
  lift: number;
  /** Extra lift per decal stacked below this one, in model units. */
  layerLift: number;
  /** True paints only the surfaces the projection reaches first. */
  firstHitOnly: boolean;
  /**
   * True keeps only the second hit: what the first surfaces hide, on the next
   * surface behind.
   */
  invert: boolean;
  /** True lays the image flat across creases like a sticker. */
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
      textureId: decalTextureIdNormalize(parameters[keys.texture]),
      window: decalImageWindowRead(parameters),
      layer: Number(parameters[keys.layer]),
      facingLimitDegrees: Number(parameters[keys.facingLimit]),
      lift: Number(parameters[keys.lift]),
      layerLift: Number(parameters[keys.layerLift]),
      firstHitOnly: parameters[keys.hits] === MODIFIER_STACK_DECAL_HITS.first,
      invert: parameters[keys.hits] === MODIFIER_STACK_DECAL_HITS.shadow,
      unfoldSticker: parameters[keys.wrap] === MODIFIER_STACK_DECAL_WRAPS.sticker,
    };
  }

  /**
   * Returns how far a decal floats above its surfaces: its lift, plus its layer
   * lift once for every overlapping decal stacked below it.
   *
   * @param settings Normalized settings.
   * @param stackRank Number of decals stacked below this one.
   * @returns Lift in model units.
   */
  static liftOffset(settings: DecalProjectorSettings, stackRank: number): number {
    return settings.lift + stackRank * settings.layerLift;
  }

  /**
   * Returns whether a decal lays its image out as an unfolded sticker.
   *
   * @param settings Normalized settings.
   * @returns True with unfolding on.
   */
  static unfolds(settings: DecalProjectorSettings): boolean {
    return settings.unfoldSticker;
  }

  /**
   * Returns a key that changes whenever a setting that shapes the generated
   * geometry changes.
   *
   * @param settings Normalized settings.
   * @returns Geometry key.
   */
  static geometryKey(settings: DecalProjectorSettings): string {
    const shown = Object.values(settings.window).join(',');
    return `${settings.facingLimitDegrees}|${settings.lift}|${settings.layerLift}|${settings.firstHitOnly}|${settings.invert}|${settings.unfoldSticker}|${shown}`;
  }

  /**
   * Returns a key that changes whenever a setting that only affects shading
   * changes.
   *
   * @param settings Normalized settings.
   * @returns Appearance key.
   */
  static appearanceKey(settings: DecalProjectorSettings): string {
    return `${settings.textureId}|${settings.layer}|${Object.values(settings.window).join(',')}`;
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

/**
 * Reads the image window from normalized Decal modifier parameters.
 *
 * @param parameters Normalized parameters.
 * @returns Image window.
 */
function decalImageWindowRead(parameters: Record<string, unknown>): DecalImageWindow {
  const keys = MODIFIER_STACK_DECAL_KEYS;
  return {
    minU: Number(parameters[keys.uvMinU]),
    minV: Number(parameters[keys.uvMinV]),
    maxU: Number(parameters[keys.uvMaxU]),
    maxV: Number(parameters[keys.uvMaxV]),
    quarterTurns: Math.round(Number(parameters[keys.uvRotation]) / 90) % 4 || 0,
    flipU: parameters[keys.uvFlipU] === true,
    flipV: parameters[keys.uvFlipV] === true,
  };
}
