import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESET_COLUMN_CLASSIC, CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { generatorRevolveBrushes, type GeneratorRevolveFrame } from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import { generatorRevolveSurfaces } from '@/generator/revolve/generator_revolve_surface.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackChoices, modifierStackNumber } from '@/modifier/stack/modifier_stack_fields.js';
import { modifierStackVolumeBox } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { ModifierStackKindGenerator, type ModifierStackPieceSurfaces } from './modifier_stack_kind_generator.js';
import { modifierStackColumnLegacyProfile, modifierStackColumnProfile } from './modifier_stack_column_profile.js';

/** Largest side count of a column. */
export const MODIFIER_STACK_COLUMN_MAX_SIDES = 64;

/** Hides the legacy fields that only old saves still carry. */
const MODIFIER_STACK_COLUMN_HIDDEN = (): boolean => false;

/** Legacy fields kept so columns saved before profiles keep their shape. */
const MODIFIER_STACK_COLUMN_LEGACY_FIELDS: readonly ModifierStackField[] = [
  { key: 'taper', label: 'Shaft taper', type: 'number', default: 1, min: 0.05, max: 1 },
  { key: 'baseHeight', label: 'Base height', type: 'number', default: 0.25, min: 0, max: 100 },
  { key: 'capitalHeight', label: 'Capital height', type: 'number', default: 0.25, min: 0, max: 100 },
  { key: 'shaftRadius', label: 'Shaft radius', type: 'number', default: 0.75, min: 0.05, max: 1 },
].map((field) => ({ ...field, type: 'number' as const, visible: MODIFIER_STACK_COLUMN_HIDDEN }));

/**
 * Builds a revolved column from a profile curve: height runs left to right,
 * radius bottom to top. Concave runs merge into one convex brush each.
 */
export class ModifierStackKindColumn extends ModifierStackKindGenerator {
  readonly id = 'column';
  readonly label = 'Column';
  readonly description = 'Revolves a profile curve into convex N-gon rings fitted to the volume.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    {
      key: 'sides',
      label: 'Sides',
      type: 'choice',
      default: '8',
      choices: modifierStackChoices([
        ['4', '4'],
        ['6', '6'],
        ['8', '8'],
        ['12', '12'],
        ['16', '16'],
        ['24', '24'],
        ['32', '32'],
      ]),
    },
    {
      key: 'profile',
      label: 'Profile',
      type: 'curve',
      default: '',
      curvePresets: CURVE_PRESETS_ARCHITECTURE,
      hint: 'Radius along the height: left is the bottom, 1.0 is half the volume width. Click to edit.',
    },
    ...MODIFIER_STACK_COLUMN_LEGACY_FIELDS,
  ];

  /**
   * Starts new columns on the classic profile.
   *
   * @returns Starting parameters.
   */
  override createParameters(): Record<string, unknown> {
    return { profile: curveEncode(curvePresetBuild(CURVE_PRESET_COLUMN_CLASSIC)) };
  }

  /**
   * Returns the legacy profile of a column saved before profiles, for the
   * inspector preview.
   *
   * @param key Field key.
   * @param parameters Normalized parameters.
   * @param volume Owning volume.
   * @returns Encoded curve, or empty.
   */
  override curveFallback(key: string, parameters: Record<string, unknown>, volume: THREE.Object3D): string {
    if (key !== 'profile') return '';
    const box = modifierStackVolumeBox(volume);
    return curveEncode(modifierStackColumnLegacyProfile(parameters, box.getSize(new THREE.Vector3()).y));
  }

  /**
   * Returns the side count summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    return `${parameters['sides']} sides`;
  }

  /**
   * Revolves the profile.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Convex brushes from bottom to top.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const size = box.getSize(new THREE.Vector3());
    const curve = modifierStackColumnProfile(parameters, size.y);
    const stations = generatorRevolveStationsFromCurve(curve, size.y, Math.min(size.x, size.z) / 2);
    return generatorRevolveBrushes(this.revolveFrame(parameters, box), generatorRevolveRuns(stations));
  }

  /**
   * Wraps the texture around the column sides.
   *
   * @param piece Piece in frame coordinates.
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Face surfaces.
   */
  protected override pieceSurfaces(
    piece: SolidBrush,
    parameters: Record<string, unknown>,
    box: THREE.Box3,
  ): ModifierStackPieceSurfaces {
    return generatorRevolveSurfaces(piece, this.revolveFrame(parameters, box));
  }

  /**
   * Returns the axis base and side count.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Revolve frame.
   */
  private revolveFrame(parameters: Record<string, unknown>, box: THREE.Box3): GeneratorRevolveFrame {
    const sides = Math.round(modifierStackNumber(Number(parameters['sides']), 8, 3, MODIFIER_STACK_COLUMN_MAX_SIDES));
    return { center: box.getCenter(new THREE.Vector3()).setY(box.min.y), sides };
  }
}
