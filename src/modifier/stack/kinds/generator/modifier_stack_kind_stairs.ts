import {
  MODIFIER_STACK_STAIRS_TEXTURE_FIELDS,
  modifierStackStairsTexturesOmitDefaults,
  modifierStackStairsTexturesPick,
} from './modifier_stack_stairs_textures.js';
import { ModifierStackKindGenerator } from './modifier_stack_kind_generator.js';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { modifierStackPrism } from './modifier_stack_generator_shapes.js';
import { modifierStackStairsSlabProfile } from './modifier_stack_stairs_slab.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackChoices,
  modifierStackNumber,
  modifierStackWhen,
} from '@/modifier/stack/modifier_stack_fields.js';

/** Largest step count of one flight. */
export const MODIFIER_STACK_STAIRS_MAX_STEPS = 256;

/** Measurements of one flight inside the volume box. */
interface ModifierStackStairsFlight {
  steps: number;
  rise: number;
  run: number;
  length: number;
}

/**
 * Builds a straight flight of box steps that fills the volume: constant rise
 * from a step count or a target rise, optional top landing, solid or floating
 * treads.
 */
export class ModifierStackKindStairs extends ModifierStackKindGenerator {
  readonly id = 'stairs';
  readonly label = 'Stairs';
  readonly description = 'Fills the volume with a straight flight of convex steps, by count or by target rise.';
  protected override readonly shadingFields = MODIFIER_STACK_STAIRS_TEXTURE_FIELDS;
  protected readonly specificFields: readonly ModifierStackField[] = [
    {
      key: 'direction',
      label: 'Ascend',
      type: 'choice',
      default: '+z',
      choices: modifierStackChoices([
        ['+x', '+X'],
        ['-x', '−X'],
        ['+z', '+Z'],
        ['-z', '−Z'],
      ]),
      hint: 'Direction the flight climbs.',
    },
    {
      key: 'sizing',
      label: 'Steps by',
      type: 'choice',
      default: 'rise',
      choices: modifierStackChoices([
        ['rise', 'Target rise'],
        ['count', 'Step count'],
      ]),
    },
    {
      key: 'rise',
      label: 'Target rise',
      type: 'number',
      default: 0.125,
      min: 0.01,
      max: 10,
      step: 0.0625,
      visible: modifierStackWhen('sizing', 'rise'),
      hint: 'Step height the flight rounds to, in metres.',
    },
    {
      key: 'count',
      label: 'Steps',
      type: 'number',
      default: 8,
      min: 1,
      max: MODIFIER_STACK_STAIRS_MAX_STEPS,
      integer: true,
      step: 1,
      visible: modifierStackWhen('sizing', 'count'),
    },
    {
      key: 'landing',
      label: 'Landing',
      type: 'number',
      default: 0,
      min: 0,
      max: 1000,
      step: 0.25,
      hint: 'Extra depth of the top step, in metres.',
    },
    {
      key: 'fill',
      label: 'Underside',
      type: 'choice',
      default: 'slab',
      choices: modifierStackChoices([
        ['slab', 'Sloped slab'],
        ['solid', 'Solid to floor'],
        ['floating', 'Floating treads'],
      ]),
      hint: 'Sloped slab keeps a clean underside that follows the pitch.',
    },
    {
      key: 'waist',
      label: 'Thickness',
      type: 'number',
      default: 0.2,
      min: 0.01,
      max: 100,
      step: 0.05,
      visible: modifierStackWhen('fill', 'slab'),
      hint: 'Thickness of the slab under the steps, measured square to the pitch.',
    },
    {
      key: 'thickness',
      label: 'Tread depth',
      type: 'number',
      default: 0.125,
      min: 0.01,
      max: 100,
      step: 0.0625,
      visible: modifierStackWhen('fill', 'floating'),
    },
  ];

  /**
   * Normalizes parameters, leaving the optional face textures out while they
   * are unused.
   *
   * @param input Stored or partial parameters.
   * @returns Normalized parameters.
   */
  override normalizeParameters(input: Record<string, unknown>): Record<string, unknown> {
    return modifierStackStairsTexturesOmitDefaults(super.normalizeParameters(input));
  }

  /**
   * Gives treads, side walls and the underside their own textures when switched
   * on.
   *
   * @param piece Piece in frame coordinates.
   * @param parameters Normalized parameters.
   * @returns Texture per face, or null when off.
   */
  protected override pieceFaceTextures(
    piece: SolidBrush,
    parameters: Record<string, unknown>,
  ): readonly (string | undefined)[] | null {
    return modifierStackStairsTexturesPick(piece, parameters);
  }

  /**
   * Returns the step count summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    return parameters['sizing'] === 'count' ? `${parameters['count']} steps` : `rise ${parameters['rise']} m`;
  }

  /**
   * Builds one box per step.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Step brushes from bottom to top.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const flight = this.flightOf(parameters, box);
    const pieces: SolidBrush[] = [];
    for (let index = 0; index < flight.steps; index++) pieces.push(this.stepBrush(index, flight, parameters, box));
    return pieces;
  }

  /**
   * Measures the flight.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box.
   * @returns Step count, rise, run and run length.
   */
  private flightOf(parameters: Record<string, unknown>, box: THREE.Box3): ModifierStackStairsFlight {
    const size = box.getSize(new THREE.Vector3());
    const length = String(parameters['direction']).endsWith('x') ? size.x : size.z;
    const target = modifierStackNumber(parameters['rise'], 0.125, 0.01, 10);
    const wanted = parameters['sizing'] === 'count' ? Number(parameters['count']) : Math.round(size.y / target);
    const steps = Math.max(1, Math.min(MODIFIER_STACK_STAIRS_MAX_STEPS, Math.round(wanted)));
    const landing = Math.min(modifierStackNumber(parameters['landing'], 0, 0, 1000), length * 0.9);
    return { steps, rise: size.y / steps, run: (length - landing) / steps, length };
  }

  /**
   * Builds one step box.
   *
   * @param index Step index from the bottom.
   * @param flight Flight measurements.
   * @param parameters Normalized parameters.
   * @param box Volume box.
   * @returns Box brush.
   */
  private stepBrush(
    index: number,
    flight: ModifierStackStairsFlight,
    parameters: Record<string, unknown>,
    box: THREE.Box3,
  ): SolidBrush {
    if (parameters['fill'] === 'slab') {
      const slab = this.slabBrush(index, flight, parameters, box);
      if (slab) return slab;
    }
    const top = box.min.y + (index + 1) * flight.rise;
    const thickness = modifierStackNumber(parameters['thickness'], flight.rise, 0.01, 100);
    const bottom = parameters['fill'] === 'floating' ? Math.max(box.min.y, top - thickness) : box.min.y;
    const start = index * flight.run;
    const end = index === flight.steps - 1 ? flight.length : (index + 1) * flight.run;
    const min = box.min.clone().setY(bottom);
    const max = box.max.clone().setY(top);
    this.alongWrite(String(parameters['direction']), box, start, end, min, max);
    return SolidBrushFactory.createBox(min, max);
  }

  /**
   * Builds one step whose underside follows the pitch of the flight.
   *
   * @param index Step index from the bottom.
   * @param flight Flight measurements.
   * @param parameters Normalized parameters.
   * @param box Volume box.
   * @returns Prism brush, or null when degenerate.
   */
  private slabBrush(
    index: number,
    flight: ModifierStackStairsFlight,
    parameters: Record<string, unknown>,
    box: THREE.Box3,
  ): SolidBrush | null {
    const direction = String(parameters['direction']);
    const axis = direction.endsWith('x') ? 'x' : 'z';
    const waist = modifierStackNumber(parameters['waist'], 0.2, 0.01, 100);
    const profile = modifierStackStairsSlabProfile(index, flight, waist, box.min.y);
    const center = box.getCenter(new THREE.Vector3())[axis];
    const span = (along: number): number =>
      direction.startsWith('+') ? box.min[axis] + along - center : box.max[axis] - along - center;
    return modifierStackPrism(
      profile.map((point) => new THREE.Vector2(span(point.x), point.y)),
      axis,
      box,
    );
  }

  /**
   * Writes a run interval onto the climbing axis of a box.
   *
   * @param direction Climb direction.
   * @param box Volume box.
   * @param start Run distance where the step begins.
   * @param end Run distance where the step ends.
   * @param min Box minimum to write.
   * @param max Box maximum to write.
   */
  private alongWrite(
    direction: string,
    box: THREE.Box3,
    start: number,
    end: number,
    min: THREE.Vector3,
    max: THREE.Vector3,
  ): void {
    const axis = direction.endsWith('x') ? 'x' : 'z';
    if (direction.startsWith('+')) {
      min[axis] = box.min[axis] + start;
      max[axis] = box.min[axis] + end;
      return;
    }
    min[axis] = box.max[axis] - end;
    max[axis] = box.max[axis] - start;
  }
}
