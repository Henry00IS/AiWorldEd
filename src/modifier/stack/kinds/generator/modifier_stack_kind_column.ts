import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackChoices, modifierStackNumber } from '@/modifier/stack/modifier_stack_fields.js';
import { ModifierStackKindGenerator } from './modifier_stack_kind_generator.js';
import { modifierStackFrustum } from './modifier_stack_generator_shapes.js';

/** Largest side count of a column. */
export const MODIFIER_STACK_COLUMN_MAX_SIDES = 64;

/**
 * Builds a revolved column from N-gon frustums: optional base, tapered shaft
 * and optional capital, all fitted to the volume.
 */
export class ModifierStackKindColumn extends ModifierStackKindGenerator {
  readonly id = 'column';
  readonly label = 'Column';
  readonly description = 'Revolves a base, shaft and capital as convex N-gon frustums fitted to the volume.';
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
      key: 'taper',
      label: 'Shaft taper',
      type: 'number',
      default: 1,
      min: 0.05,
      max: 1,
      step: 0.05,
      hint: 'Top radius of the shaft as a fraction of its base.',
    },
    {
      key: 'baseHeight',
      label: 'Base height',
      type: 'number',
      default: 0.25,
      min: 0,
      max: 100,
      step: 0.125,
      group: 'Base and capital',
    },
    {
      key: 'capitalHeight',
      label: 'Capital height',
      type: 'number',
      default: 0.25,
      min: 0,
      max: 100,
      step: 0.125,
      group: 'Base and capital',
    },
    {
      key: 'shaftRadius',
      label: 'Shaft radius',
      type: 'number',
      default: 0.75,
      min: 0.05,
      max: 1,
      step: 0.05,
      group: 'Base and capital',
      hint: 'Shaft radius as a fraction of the base radius.',
    },
  ];

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
   * Builds the base, shaft and capital.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Frustum brushes from bottom to top.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.min(size.x, size.z) / 2;
    const sides = Math.round(modifierStackNumber(Number(parameters['sides']), 8, 3, MODIFIER_STACK_COLUMN_MAX_SIDES));
    const shaft = radius * modifierStackNumber(parameters['shaftRadius'], 0.75, 0.05, 1);
    const base = Math.min(modifierStackNumber(parameters['baseHeight'], 0.25, 0, 100), size.y * 0.45);
    const capital = Math.min(modifierStackNumber(parameters['capitalHeight'], 0.25, 0, 100), size.y * 0.45);
    const center = box.getCenter(new THREE.Vector3()).setY(box.min.y);
    const taper = modifierStackNumber(parameters['taper'], 1, 0.05, 1);
    const sections = [
      modifierStackFrustum(center.clone(), sides, radius, radius, base),
      modifierStackFrustum(center.clone().setY(box.min.y + base), sides, shaft, shaft * taper, size.y - base - capital),
      modifierStackFrustum(center.clone().setY(box.max.y - capital), sides, radius, radius, capital),
    ];
    return sections.filter((section): section is SolidBrush => section !== null);
  }
}
