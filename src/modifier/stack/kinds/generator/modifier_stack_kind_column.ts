import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESET_COLUMN_CLASSIC, CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { generatorRevolveBrushes, type GeneratorRevolveFrame } from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveRuns } from '@/generator/revolve/generator_revolve_profile.js';
import {
  generatorRevolveSurfaces,
  generatorRevolveUvLayout,
  type GeneratorRevolveWrap,
} from '@/generator/revolve/generator_revolve_surface.js';
import type { GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackChoices,
  modifierStackNumber,
  modifierStackWhen,
} from '@/modifier/stack/modifier_stack_fields.js';
import { modifierStackVolumeBox } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { ModifierStackKindGenerator, type ModifierStackPieceSurfaces } from './modifier_stack_kind_generator.js';
import { modifierStackColumnLegacyProfile, modifierStackColumnProfile } from './modifier_stack_column_profile.js';

/** Largest side count of a column. */
export const MODIFIER_STACK_COLUMN_MAX_SIDES = 64;

/** Hides the legacy fields that only old saves still carry. */
const MODIFIER_STACK_COLUMN_HIDDEN = (): boolean => false;

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

/** Fixed heights of the profile sections below and above its markers. */
const MODIFIER_STACK_COLUMN_SECTION_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'sectionBase',
    label: 'Fixed base height',
    type: 'number',
    default: 0.5,
    min: 0,
    max: 100,
    hint: 'Height in metres of the profile below its bottom marker; it keeps this height when the column is resized.',
    visible: (parameters) => modifierStackColumnHasMarker(parameters, 'bottom'),
  },
  {
    key: 'sectionTop',
    label: 'Fixed top height',
    type: 'number',
    default: 0.5,
    min: 0,
    max: 100,
    hint: 'Height in metres of the profile above its top marker; it keeps this height when the column is resized.',
    visible: (parameters) => modifierStackColumnHasMarker(parameters, 'top'),
  },
];

/** Legacy fields kept so columns saved before profiles keep their shape. */
const MODIFIER_STACK_COLUMN_LEGACY_FIELDS: readonly ModifierStackField[] = [
  { key: 'taper', label: 'Shaft taper', type: 'number', default: 1, min: 0.05, max: 1 },
  { key: 'baseHeight', label: 'Base height', type: 'number', default: 0.25, min: 0, max: 100 },
  { key: 'capitalHeight', label: 'Capital height', type: 'number', default: 0.25, min: 0, max: 100 },
  { key: 'shaftRadius', label: 'Shaft radius', type: 'number', default: 0.75, min: 0.05, max: 1 },
].map((field) => ({ ...field, type: 'number' as const, visible: MODIFIER_STACK_COLUMN_HIDDEN }));

/** Texture wrap fields: stretch once over the column, or tile whole repeats. */
const MODIFIER_STACK_COLUMN_WRAP_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'wrap',
    label: 'Wrap',
    type: 'choice',
    default: 'stretch',
    group: 'Texture',
    choices: modifierStackChoices([
      ['stretch', 'Stretch'],
      ['tile', 'Tile'],
    ]),
    hint: 'Stretch wraps the texture once around and once bottom to top; Tile repeats it a whole number of times.',
  },
  {
    key: 'repeatAround',
    label: 'Repeat around',
    type: 'number',
    default: 1,
    min: 1,
    max: 64,
    integer: true,
    step: 1,
    group: 'Texture',
    visible: modifierStackWhen('wrap', 'tile'),
  },
  {
    key: 'tileAlong',
    label: 'Along',
    type: 'choice',
    default: 'density',
    group: 'Texture',
    choices: modifierStackChoices([
      ['density', 'Match texel density'],
      ['count', 'Repeat count'],
    ]),
    hint: 'Match texel density keeps tiles square at the widest ring.',
    visible: modifierStackWhen('wrap', 'tile'),
  },
  {
    key: 'repeatAlong',
    label: 'Repeat along',
    type: 'number',
    default: 1,
    min: 1,
    max: 256,
    integer: true,
    step: 1,
    group: 'Texture',
    visible: (parameters) => parameters['wrap'] === 'tile' && parameters['tileAlong'] === 'count',
  },
];

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
    ...MODIFIER_STACK_COLUMN_SECTION_FIELDS,
    ...MODIFIER_STACK_COLUMN_WRAP_FIELDS,
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
    const stations = this.stations(parameters, box);
    return generatorRevolveBrushes(this.revolveFrame(parameters, box), generatorRevolveRuns(stations));
  }

  /**
   * Samples the profile into stations in metres.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Stations bottom to top.
   */
  private stations(parameters: Record<string, unknown>, box: THREE.Box3): GeneratorRevolveStation[] {
    const size = box.getSize(new THREE.Vector3());
    const curve = modifierStackColumnProfile(parameters, size.y);
    const fixed = {
      base: modifierStackNumber(parameters['sectionBase'], 0.5, 0, 100),
      top: modifierStackNumber(parameters['sectionTop'], 0.5, 0, 100),
    };
    return generatorRevolveStationsFromCurve(curve, size.y, Math.min(size.x, size.z) / 2, fixed);
  }

  /**
   * Wraps the texture around the column sides and along the whole profile.
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
    const frame = this.revolveFrame(parameters, box);
    const layout = generatorRevolveUvLayout(
      this.stations(parameters, box),
      frame.sides,
      modifierStackColumnWrap(parameters),
    );
    return generatorRevolveSurfaces(piece, frame, layout);
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

/**
 * Reads the texture wrap options of a column.
 *
 * @param parameters Normalized parameters.
 * @returns Wrap options.
 */
function modifierStackColumnWrap(parameters: Record<string, unknown>): GeneratorRevolveWrap {
  const along = parameters['tileAlong'] === 'count' ? Number(parameters['repeatAlong']) : 'density';
  return {
    mode: parameters['wrap'] === 'tile' ? 'tile' : 'stretch',
    around: Number(parameters['repeatAround']),
    along,
  };
}
