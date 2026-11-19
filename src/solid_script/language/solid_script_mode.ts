import type { SolidScriptShape, SolidScriptShapeSolid } from './solid_script_shape.js';
import { solidScriptShapeMapLeaves } from './solid_script_shape.js';
import type * as THREE from 'three';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** How a brush combines with the ones before it in the scene. */
export type SolidScriptMode = 'Additive' | 'Subtractive' | 'Intersecting';

/** Mode of a new brush line when the field is left at its default. */
export const SOLID_SCRIPT_MODE_DEFAULT: SolidScriptMode = 'Additive';

/** Official Mode words, with the same labels the editor uses. */
export const SOLID_SCRIPT_MODE_WORDS: readonly { word: SolidScriptMode; detail: string }[] = [
  { word: 'Additive', detail: 'Adds this brush to the ones before it.' },
  { word: 'Subtractive', detail: 'Cuts this brush out of the ones before it.' },
  { word: 'Intersecting', detail: 'Keeps only where this brush overlaps the ones before it.' },
];

/**
 * Reads a Mode word. An empty value means the line did not set one.
 *
 * @param text Value as typed.
 * @returns Mode, or undefined when the line left it unset.
 */
export function solidScriptModeOf(text: string | undefined): SolidScriptMode | undefined {
  const word = text?.trim() ?? '';
  if (word === '') return undefined;
  if (word === 'Additive' || word === 'Subtractive' || word === 'Intersecting') return word;
  throw new Error(`Mode must be Additive, Subtractive or Intersecting, not "${text}"`);
}

/**
 * Builds a solid, keeping Mode only when the line set one.
 *
 * @param label Shape label.
 * @param points Corners in script space.
 * @param values Stored field values of the line.
 * @returns Solid.
 */
export function solidScriptSolidMade(
  label: string,
  points: THREE.Vector3[],
  values: Readonly<Record<string, string>>,
): SolidScriptShapeSolid {
  const mode = solidScriptModeOf(values['mode']);
  return mode ? { kind: 'solid', label, points, mode } : { kind: 'solid', label, points };
}

/**
 * Sets Mode on every solid of a shape when the line set one, such as Linear
 * Extrude or Hull.
 *
 * @param shape Built shape.
 * @param values Stored field values of the line.
 * @returns Shape, or a copy with Mode.
 */
export function solidScriptModeApply(
  shape: SolidScriptShape,
  values: Readonly<Record<string, string>>,
): SolidScriptShape {
  const mode = solidScriptModeOf(values['mode']);
  if (!mode) return shape;
  return solidScriptShapeMapLeaves(shape, (leaf) => (leaf.kind === 'solid' ? { ...leaf, mode } : leaf));
}

/**
 * Maps a Mode word onto the editor's brush operation.
 *
 * @param mode Mode, or none when the line left it unset.
 * @returns Operation, or undefined when unset.
 */
export function solidScriptModeOperation(mode: SolidScriptMode | undefined): SolidOperation | undefined {
  if (mode === 'Subtractive') return SolidOperation.Subtractive;
  if (mode === 'Intersecting') return SolidOperation.Intersecting;
  if (mode === 'Additive') return SolidOperation.Additive;
  return undefined;
}
