import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackChoices,
  modifierStackNumber,
  modifierStackWhen,
} from '@/modifier/stack/modifier_stack_fields.js';
import { ModifierStackKindGenerator } from './modifier_stack_kind_generator.js';
import { MODIFIER_STACK_SHAPE_EPSILON, modifierStackPrism } from './modifier_stack_generator_shapes.js';

/** Largest segment count of one arch. */
export const MODIFIER_STACK_ARCH_MAX_SEGMENTS = 128;

/** Smallest segment count of one arch; one segment would be a flat sliver. */
export const MODIFIER_STACK_ARCH_MIN_SEGMENTS = 2;

/** Inner curve of an arch in profile coordinates. */
interface ModifierStackArchCurve {
  radiusSpan: number;
  radiusRise: number;
  segments: number;
  sweep: number;
  /** Angle of the first segment boundary in degrees; 0 is the right springing. */
  start: number;
}

/**
 * Drops profile points that repeat their predecessor, such as a strip corner
 * that already sits on the floor.
 *
 * @param profile Closed profile.
 * @returns Profile without repeated points.
 */
function modifierStackArchDistinct(profile: readonly THREE.Vector2[]): THREE.Vector2[] {
  return profile.filter((point, index) => {
    const previous = profile[(index + profile.length - 1) % profile.length];
    return !previous || point.distanceTo(previous) > MODIFIER_STACK_SHAPE_EPSILON;
  });
}

/**
 * Returns whether a partial sweep can choose where it starts.
 *
 * @param parameters Normalized parameters.
 * @returns True for a ring sweeping less than a half circle.
 */
function modifierStackArchPartial(parameters: Record<string, unknown>): boolean {
  return parameters['style'] === 'ring' && Number(parameters['sweep']) < 180;
}

/**
 * Returns the first angle of a sweep: centred on the crown, or rising from the
 * left or right springing on the ground.
 *
 * @param from 'centre', 'left' or 'right'.
 * @param sweep Sweep in degrees.
 * @returns Start angle in degrees.
 */
export function modifierStackArchStartAngle(from: unknown, sweep: number): number {
  if (from === 'right') return 0;
  if (from === 'left') return 180 - sweep;
  return (180 - sweep) / 2;
}

/**
 * Builds an arch through the volume: a ring of convex voussoirs, a wall with an
 * arched opening whose pieces fill up to the volume top, or the opening itself
 * for subtracting a tunnel.
 */
export class ModifierStackKindArch extends ModifierStackKindGenerator {
  readonly id = 'arch';
  readonly label = 'Arch';
  readonly description = 'Builds a round or elliptical arch from convex voussoirs, or a wall with an arched opening.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    {
      key: 'style',
      label: 'Style',
      type: 'choice',
      default: 'ring',
      choices: modifierStackChoices([
        ['ring', 'Voussoir ring'],
        ['wall', 'Wall with opening'],
      ]),
    },
    {
      key: 'output',
      label: 'Output',
      type: 'choice',
      default: 'arch',
      choices: modifierStackChoices([
        ['arch', 'Arch'],
        ['opening', 'Opening (tunnel)'],
      ]),
      hint: 'Opening builds the space under the arch as convex pieces; set Operation to Subtract to carve it as a tunnel.',
    },
    {
      key: 'span',
      label: 'Span along',
      type: 'choice',
      default: 'x',
      choices: modifierStackChoices([
        ['x', 'X'],
        ['z', 'Z'],
      ]),
    },
    {
      key: 'shape',
      label: 'Shape',
      type: 'choice',
      default: 'round',
      choices: modifierStackChoices([
        ['round', 'Round'],
        ['fit', 'Stretch to top'],
      ]),
      hint:
        'Round keeps a half circle, flattened only when the volume is too low for it. Stretch to top (saved before as ' +
        'Fill height) makes an ellipse that reaches the volume top; it only differs when the volume is taller than ' +
        'half its span.',
    },
    {
      key: 'segments',
      label: 'Segments',
      type: 'number',
      default: 16,
      min: MODIFIER_STACK_ARCH_MIN_SEGMENTS,
      max: MODIFIER_STACK_ARCH_MAX_SEGMENTS,
      integer: true,
      step: 1,
      hint: '32 matches 64 segments per full circle.',
    },
    {
      key: 'sweep',
      label: 'Sweep °',
      type: 'number',
      default: 180,
      min: 1,
      max: 180,
      step: 15,
      visible: modifierStackWhen('style', 'ring'),
    },
    {
      key: 'start',
      label: 'Start from',
      type: 'choice',
      default: 'centre',
      choices: modifierStackChoices([
        ['centre', 'Centre'],
        ['left', 'Left (on the ground)'],
        ['right', 'Right (on the ground)'],
      ]),
      hint: 'Where a sweep under 180° sits: centred on the crown, or rising from the left or right springing.',
      visible: modifierStackArchPartial,
    },
    {
      key: 'thickness',
      label: 'Thickness',
      type: 'number',
      default: 0.25,
      min: 0.01,
      max: 100,
      step: 0.125,
      hint: 'Ring depth, or pier width for a wall.',
    },
  ];

  /**
   * Returns the segment summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    return `${parameters['segments']} seg`;
  }

  /**
   * Builds the arch pieces.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Voussoirs, or wall pieces and piers.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const wall = parameters['style'] === 'wall';
    const curve = this.curveOf(parameters, box, wall);
    if (!curve) return [];
    const thickness = modifierStackNumber(parameters['thickness'], 0.25, 0.01, 100);
    const spanAxis = String(parameters['span']);
    const pieces =
      parameters['output'] === 'opening'
        ? this.openingPieces(curve, box, spanAxis)
        : wall
          ? this.wallPieces(curve, box, spanAxis)
          : this.ringPieces(curve, thickness, box, spanAxis);
    return pieces.filter((piece): piece is SolidBrush => piece !== null);
  }

  /**
   * Measures the inner curve.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box.
   * @param wall True for the wall style.
   * @returns Curve, or null when the box is too small for the thickness.
   */
  private curveOf(parameters: Record<string, unknown>, box: THREE.Box3, wall: boolean): ModifierStackArchCurve | null {
    const size = box.getSize(new THREE.Vector3());
    const half = (parameters['span'] === 'z' ? size.z : size.x) / 2;
    const thickness = modifierStackNumber(parameters['thickness'], 0.25, 0.01, 100);
    const radiusSpan = half - thickness;
    const fitRise = size.y - thickness;
    const radiusRise = parameters['shape'] === 'fit' ? fitRise : Math.min(radiusSpan, fitRise);
    if (radiusSpan < MODIFIER_STACK_SHAPE_EPSILON || radiusRise < MODIFIER_STACK_SHAPE_EPSILON) return null;
    const segments = Math.round(
      modifierStackNumber(
        parameters['segments'],
        16,
        MODIFIER_STACK_ARCH_MIN_SEGMENTS,
        MODIFIER_STACK_ARCH_MAX_SEGMENTS,
      ),
    );
    const sweep = wall ? 180 : modifierStackNumber(parameters['sweep'], 180, 1, 180);
    return { radiusSpan, radiusRise, segments, sweep, start: modifierStackArchStartAngle(parameters['start'], sweep) };
  }

  /**
   * Returns one point of an elliptical curve.
   *
   * @param curve Inner curve.
   * @param grow Extra radius added to both semi-axes.
   * @param index Segment boundary index.
   * @param floor Springing height.
   * @returns Profile point.
   */
  private curvePoint(curve: ModifierStackArchCurve, grow: number, index: number, floor: number): THREE.Vector2 {
    const angle = ((curve.start + (curve.sweep * index) / curve.segments) * Math.PI) / 180;
    return new THREE.Vector2(
      Math.cos(angle) * (curve.radiusSpan + grow),
      floor + Math.sin(angle) * (curve.radiusRise + grow),
    );
  }

  /**
   * Builds the voussoir ring.
   *
   * @param curve Inner curve.
   * @param thickness Ring depth.
   * @param box Volume box.
   * @param spanAxis Span axis.
   * @returns One prism per segment.
   */
  private ringPieces(
    curve: ModifierStackArchCurve,
    thickness: number,
    box: THREE.Box3,
    spanAxis: string,
  ): (SolidBrush | null)[] {
    const pieces: (SolidBrush | null)[] = [];
    for (let index = 0; index < curve.segments; index++) {
      const profile = [
        this.curvePoint(curve, 0, index, box.min.y),
        this.curvePoint(curve, thickness, index, box.min.y),
        this.curvePoint(curve, thickness, index + 1, box.min.y),
        this.curvePoint(curve, 0, index + 1, box.min.y),
      ];
      pieces.push(modifierStackPrism(profile, spanAxis, box));
    }
    return pieces;
  }

  /**
   * Builds a wall with an arched opening: two piers plus one piece per segment
   * reaching the box top.
   *
   * @param curve Inner curve.
   * @param box Volume box.
   * @param spanAxis Span axis.
   * @returns Pier and spandrel prisms.
   */
  private wallPieces(curve: ModifierStackArchCurve, box: THREE.Box3, spanAxis: string): (SolidBrush | null)[] {
    const top = box.max.y;
    const pieces: (SolidBrush | null)[] = this.pierPieces(curve, box, spanAxis);
    for (let index = 0; index < curve.segments; index++) {
      const lower = this.curvePoint(curve, 0, index, box.min.y);
      const upper = this.curvePoint(curve, 0, index + 1, box.min.y);
      const profile = [lower, upper, new THREE.Vector2(upper.x, top), new THREE.Vector2(lower.x, top)];
      pieces.push(modifierStackPrism(profile, spanAxis, box));
    }
    return pieces;
  }

  /**
   * Builds the opening under the arch: one strip per segment from the floor up
   * to the inner curve, each a convex prism.
   *
   * @param curve Inner curve.
   * @param box Volume box.
   * @param spanAxis Span axis.
   * @returns Opening prisms.
   */
  private openingPieces(curve: ModifierStackArchCurve, box: THREE.Box3, spanAxis: string): (SolidBrush | null)[] {
    const floor = box.min.y;
    const pieces: (SolidBrush | null)[] = [];
    for (let index = 0; index < curve.segments; index++) {
      const lower = this.curvePoint(curve, 0, index, floor);
      const upper = this.curvePoint(curve, 0, index + 1, floor);
      const profile = [new THREE.Vector2(lower.x, floor), new THREE.Vector2(upper.x, floor), upper, lower];
      pieces.push(modifierStackPrism(modifierStackArchDistinct(profile), spanAxis, box));
    }
    return pieces;
  }

  /**
   * Builds the two full-height piers beside the opening.
   *
   * @param curve Inner curve.
   * @param box Volume box.
   * @param spanAxis Span axis.
   * @returns Left and right pier boxes.
   */
  private pierPieces(curve: ModifierStackArchCurve, box: THREE.Box3, spanAxis: string): SolidBrush[] {
    const axis = spanAxis === 'z' ? 'z' : 'x';
    const center = box.getCenter(new THREE.Vector3())[axis];
    const left = { min: box.min.clone(), max: box.max.clone() };
    const right = { min: box.min.clone(), max: box.max.clone() };
    left.max[axis] = center - curve.radiusSpan;
    right.min[axis] = center + curve.radiusSpan;
    return [SolidBrushFactory.createBox(left.min, left.max), SolidBrushFactory.createBox(right.min, right.max)];
  }
}
