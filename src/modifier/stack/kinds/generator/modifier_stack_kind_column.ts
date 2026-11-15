import * as THREE from 'three';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { CURVE_PRESETS_TURNERY } from '@/curve/model/curve_preset_turnery.js';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import type { Curve } from '@/curve/model/curve_model.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { curvePresetCatalog } from '@/curve/model/curve_preset_catalog.js';
import { CURVE_PRESET_COLUMN_CLASSIC, CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import type { GeneratorRevolveFrame } from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import type { GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackChoices, modifierStackNumber } from '@/modifier/stack/modifier_stack_fields.js';
import { MODIFIER_STACK_CAP_TEXTURE_FIELDS } from './modifier_stack_generator_cap_textures.js';
import { MODIFIER_STACK_GENERATOR_SMOOTH_FIELD } from './modifier_stack_generator_smooth.js';
import { modifierStackRevolveWrapFields } from './modifier_stack_generator_revolve_wrap.js';
import { ModifierStackKindGeneratorRevolved } from './modifier_stack_kind_generator_revolved.js';

/** Largest side count of a column. */
export const MODIFIER_STACK_COLUMN_MAX_SIDES = 64;

/**
 * Returns whether the column's profile has a marker.
 *
 * @param parameters Column parameters.
 * @param side Marker.
 * @returns True when the marker is set.
 */
function modifierStackColumnHasMarker(parameters: Record<string, unknown>, side: 'bottom' | 'top'): boolean {
  return curveDecode(parameters['profile'])?.markers?.[side] !== undefined;
}

/**
 * Returns the profile of a column stored with an empty profile: the classic
 * profile as it was before presets carried Base and Top, with both off.
 *
 * @returns Curve.
 */
function modifierStackColumnFallbackCurve(): Curve {
  const { height: _height, ...unfixed } = CURVE_PRESET_COLUMN_CLASSIC;
  return curvePresetBuild(unfixed);
}

/** Fixed heights of the profile sections below and above its markers. */
const MODIFIER_STACK_COLUMN_SECTION_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'sectionBase',
    label: 'Fixed Base Height',
    type: 'number',
    default: 0.5,
    min: 0,
    max: 100,
    hint: 'Height in metres of the profile below its bottom marker; it keeps this height when the column is resized. Stored in the profile curve, so presets and curve files set it too.',
    curveHeight: { curve: 'profile', side: 'bottom' },
    visible: (parameters) => modifierStackColumnHasMarker(parameters, 'bottom'),
  },
  {
    key: 'sectionTop',
    label: 'Fixed Top Height',
    type: 'number',
    default: 0.5,
    min: 0,
    max: 100,
    hint: 'Height in metres of the profile above its top marker; it keeps this height when the column is resized. Stored in the profile curve, so presets and curve files set it too.',
    curveHeight: { curve: 'profile', side: 'top' },
    visible: (parameters) => modifierStackColumnHasMarker(parameters, 'top'),
  },
];

/**
 * Builds a revolved column from a profile curve: height runs left to right,
 * radius bottom to top. Concave runs merge into one convex brush each.
 */
export class ModifierStackKindColumn extends ModifierStackKindGeneratorRevolved {
  readonly id = 'column';
  readonly label = 'Column';
  readonly description = 'Revolves a profile curve into convex N-gon rings fitted to the volume.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    {
      key: 'sides',
      label: 'Sides',
      type: 'choice',
      default: '8',
      hint: 'Side count of Round sections. Square and Polygon sections use their own corner settings.',
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
      curvePresets: curvePresetCatalog([
        ...CURVE_PRESETS_ARCHITECTURE,
        ...CURVE_PRESETS_TURNERY,
        ...CURVE_PRESETS_EXTENDED,
      ]),
      curveMarkers: true,
      hint: 'Radius along the height: left is the bottom, 1.0 is half the volume width. Use the curve editor Section picker for Round, Square and Polygon segments, with cut or rounded corners. Click to edit.',
    },
    {
      key: 'aspect',
      label: 'Depth / Width',
      type: 'number',
      default: 1,
      min: 0.05,
      max: 20,
      step: 0.05,
      hint: 'Cross-section depth relative to width. All sections share this ratio; round becomes oval. Unturned sections fit the bounds; segment rotation and twist may extend beyond them.',
    },
    ...MODIFIER_STACK_COLUMN_SECTION_FIELDS,
    ...modifierStackRevolveWrapFields('stretch'),
  ];
  protected override readonly shadingFields = [
    ...MODIFIER_STACK_CAP_TEXTURE_FIELDS,
    MODIFIER_STACK_GENERATOR_SMOOTH_FIELD,
  ];

  /**
   * Starts new columns on the classic profile, whose Base and Top are on so the
   * base and capital keep their height when the column is resized.
   *
   * @returns Starting parameters.
   */
  override createParameters(): Record<string, unknown> {
    return { profile: curveEncode(curvePresetBuild(CURVE_PRESET_COLUMN_CLASSIC)) };
  }

  /**
   * Shows the classic profile for a column whose profile is empty.
   *
   * @param key Field key.
   * @returns Encoded curve, or empty.
   */
  override curveFallback(key: string): string {
    return key === 'profile' ? curveEncode(modifierStackColumnFallbackCurve()) : '';
  }

  /**
   * Returns the side count summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    return `${modifierStackColumnSideCount(parameters)} sides`;
  }

  /**
   * Samples the profile into stations in metres.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Stations bottom to top.
   */
  protected stations(parameters: Record<string, unknown>, box: THREE.Box3): GeneratorRevolveStation[] {
    const size = box.getSize(new THREE.Vector3());
    const curve = curveDecode(parameters['profile']) ?? modifierStackColumnFallbackCurve();
    const fixed = {
      base: modifierStackNumber(parameters['sectionBase'], 0.5, 0, 100),
      top: modifierStackNumber(parameters['sectionTop'], 0.5, 0, 100),
    };
    return generatorRevolveStationsFromCurve(curve, size.y, modifierStackColumnRadius(parameters, box), fixed);
  }

  /**
   * Returns the axis base and side count.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Revolve frame.
   */
  protected revolveFrame(parameters: Record<string, unknown>, box: THREE.Box3): GeneratorRevolveFrame {
    const sides = modifierStackColumnSideCount(parameters);
    return {
      center: box.getCenter(new THREE.Vector3()).setY(box.min.y),
      sides,
      aspect: modifierStackNumber(parameters['aspect'], 1, 0.05, 20),
    };
  }
}

/**
 * Reads the requested resolution of Round sections.
 *
 * @param parameters Column parameters.
 * @returns Round side count.
 */
function modifierStackColumnSideCount(parameters: Record<string, unknown>): number {
  return Math.round(modifierStackNumber(Number(parameters['sides']), 8, 3, MODIFIER_STACK_COLUMN_MAX_SIDES));
}

/**
 * Sets profile value one to the unrotated half-width, limited by depth and
 * aspect. Rotation never changes this radius; rotated corners may extend
 * outside the box.
 *
 * @param parameters Generator parameters.
 * @param box Generator bounds.
 * @returns Radius at profile value one.
 */
function modifierStackColumnRadius(parameters: Record<string, unknown>, box: THREE.Box3): number {
  const size = box.getSize(new THREE.Vector3());
  const aspect = modifierStackNumber(parameters['aspect'], 1, 0.05, 20);
  return Math.min(size.x, size.z / aspect) / 2;
}
