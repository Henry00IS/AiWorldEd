import { ModifierStackKindGeneratorCapped } from './modifier_stack_kind_generator_capped.js';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { generatorRevolveSmoothClasses } from '@/generator/revolve/generator_revolve_shading.js';
import { CURVE_PRESETS_TURNERY } from '@/curve/model/curve_preset_turnery.js';
import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import type { Curve } from '@/curve/model/curve_model.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { curvePresetCatalog } from '@/curve/model/curve_preset_catalog.js';
import { CURVE_PRESET_COLUMN_CLASSIC, CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import {
  generatorRevolveSectionFrame,
  type GeneratorRevolveFrame,
} from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveStationsFromCurve } from '@/generator/revolve/generator_revolve_curve.js';
import { generatorRevolveProfileBrushes } from '@/generator/revolve/generator_revolve_blend.js';
import {
  generatorRevolveBlendSmoothClasses,
  generatorRevolveBlendSurfaces,
} from '@/generator/revolve/generator_revolve_blend_surface.js';
import {
  generatorRevolveStationAt,
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
import { MODIFIER_STACK_CAP_TEXTURE_FIELDS } from './modifier_stack_generator_cap_textures.js';
import { MODIFIER_STACK_GENERATOR_SMOOTH_FIELD } from './modifier_stack_generator_smooth.js';
import type { ModifierStackPieceSurfaces } from './modifier_stack_kind_generator.js';

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
    label: 'Repeat Around',
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
    label: 'Repeat Along',
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
export class ModifierStackKindColumn extends ModifierStackKindGeneratorCapped {
  readonly id = 'column';
  readonly label = 'Column';
  readonly description = 'Revolves a profile curve into convex N-gon rings fitted to the volume.';
  protected override readonly surfacesFollowVolume = true;
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
      label: 'Depth / width',
      type: 'number',
      default: 1,
      min: 0.05,
      max: 20,
      step: 0.05,
      hint: 'Cross-section depth relative to width. All sections share this ratio; round becomes oval. Unturned sections fit the bounds; segment rotation and twist may extend beyond them.',
    },
    ...MODIFIER_STACK_COLUMN_SECTION_FIELDS,
    ...MODIFIER_STACK_COLUMN_WRAP_FIELDS,
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
   * Revolves the profile.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Convex brushes from bottom to top.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    return generatorRevolveProfileBrushes(this.revolveFrame(parameters, box), this.stations(parameters, box));
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
    const curve = curveDecode(parameters['profile']) ?? modifierStackColumnFallbackCurve();
    const fixed = {
      base: modifierStackNumber(parameters['sectionBase'], 0.5, 0, 100),
      top: modifierStackNumber(parameters['sectionTop'], 0.5, 0, 100),
    };
    return generatorRevolveStationsFromCurve(curve, size.y, modifierStackColumnRadius(parameters, box), fixed);
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
    const round = this.revolveFrame(parameters, box);
    const stations = this.stations(parameters, box);
    const layout = generatorRevolveUvLayout(stations, round.sides, modifierStackColumnWrap(parameters), round.aspect);
    const bottom = Math.min(...piece.vertices.map((vertex) => vertex.y)) - round.center.y;
    const station = generatorRevolveStationAt(stations, bottom);
    if (modifierStackColumnBlends(station)) return generatorRevolveBlendSurfaces(piece, round, layout);
    return generatorRevolveSurfaces(piece, generatorRevolveSectionFrame(round, station ?? false), layout);
  }

  /**
   * Keeps caps, square pieces and the flat sides of fillets flat; curved facets
   * smooth together.
   *
   * @param piece Piece in frame coordinates.
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Class per face.
   */
  protected override pieceSmoothClasses(
    piece: SolidBrush,
    parameters: Record<string, unknown>,
    box: THREE.Box3,
  ): readonly number[] {
    const round = this.revolveFrame(parameters, box);
    const bottom = Math.min(...piece.vertices.map((vertex) => vertex.y)) - round.center.y;
    const station = generatorRevolveStationAt(this.stations(parameters, box), bottom);
    if (modifierStackColumnBlends(station)) return generatorRevolveBlendSmoothClasses(piece, round);
    return generatorRevolveSmoothClasses(piece, generatorRevolveSectionFrame(round, station ?? false));
  }

  /**
   * Returns the axis base and side count.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Revolve frame.
   */
  private revolveFrame(parameters: Record<string, unknown>, box: THREE.Box3): GeneratorRevolveFrame {
    const sides = modifierStackColumnSideCount(parameters);
    return {
      center: box.getCenter(new THREE.Vector3()).setY(box.min.y),
      sides,
      aspect: modifierStackNumber(parameters['aspect'], 1, 0.05, 20),
    };
  }
}

/**
 * Returns whether the piece starting at a station morphs between two sections.
 *
 * @param station Station at the bottom of the piece.
 * @returns True for a blended piece.
 */
function modifierStackColumnBlends(station: GeneratorRevolveStation | undefined): boolean {
  return !!(station?.blendStart || station?.blendEnd);
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
