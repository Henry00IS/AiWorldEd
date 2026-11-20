import type { SolidScriptShape, SolidScriptShapeSolid } from './solid_script_shape.js';
import { solidScriptShapeMapLeaves } from './solid_script_shape.js';
import type { SolidScriptBody } from './solid_script_body.js';
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
 * @param body Corners and faces in script space.
 * @param values Stored field values of the line.
 * @returns Solid.
 */
export function solidScriptSolidMade(
  label: string,
  body: SolidScriptBody,
  values: Readonly<Record<string, string>>,
): SolidScriptShapeSolid {
  const mode = solidScriptModeOf(values['mode']);
  const solid: SolidScriptShapeSolid = { kind: 'solid', label, points: body.points, faces: body.faces };
  if (mode) solid.mode = mode;
  return solid;
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

/** How a Part or Group combines with the shapes before it in the scene. */
export type SolidScriptGroupMode = SolidScriptMode | 'Pass-Through';

/** Mode of a new Part or Group when the field is left at its default. */
export const SOLID_SCRIPT_GROUP_MODE_DEFAULT: SolidScriptGroupMode = 'Additive';

/**
 * Official Mode words for a Part or Group, with the same labels the editor
 * uses.
 */
export const SOLID_SCRIPT_GROUP_MODE_WORDS: readonly { word: SolidScriptGroupMode; detail: string }[] = [
  { word: 'Additive', detail: 'Adds this group to the ones before it.' },
  { word: 'Subtractive', detail: 'Cuts this group out of the ones before it.' },
  { word: 'Intersecting', detail: 'Keeps only where this group overlaps the ones before it.' },
  {
    word: 'Pass-Through',
    detail: "Acts like a folder. Its brushes are combined as if they weren't grouped.",
  },
];

/**
 * Reads a Part or Group Mode word. An empty value means Additive.
 *
 * @param text Value as typed.
 * @returns Mode, or undefined when the line left it unset.
 */
export function solidScriptGroupModeOf(text: string | undefined): SolidScriptGroupMode | undefined {
  const word = text?.trim() ?? '';
  if (word === '') return undefined;
  if (word === 'Additive' || word === 'Subtractive' || word === 'Intersecting' || word === 'Pass-Through') return word;
  throw new Error(`Mode must be Additive, Subtractive, Intersecting or Pass-Through, not "${text}"`);
}

/**
 * Maps a Part or Group Mode onto the editor's group operation. Unset is
 * Additive.
 *
 * @param mode Mode, or none when the line left it unset.
 * @returns Operation.
 */
export function solidScriptGroupModeOperation(mode: SolidScriptGroupMode | undefined): SolidOperation {
  if (mode === 'Subtractive') return SolidOperation.Subtractive;
  if (mode === 'Intersecting') return SolidOperation.Intersecting;
  if (mode === 'Pass-Through') return SolidOperation.PassThrough;
  return SolidOperation.Additive;
}

/**
 * Names a scene CSG operation with the same words Mode fields use.
 *
 * @param operation Scene operation.
 * @returns Mode word, including Pass-Through for a group.
 */
export function solidScriptModeLabel(operation: SolidOperation): SolidScriptGroupMode {
  if (operation === SolidOperation.Subtractive) return 'Subtractive';
  if (operation === SolidOperation.Intersecting) return 'Intersecting';
  if (operation === SolidOperation.PassThrough) return 'Pass-Through';
  return 'Additive';
}

/**
 * Names a scene brush operation with a brush Mode word. Pass-Through is not a
 * brush Mode, so it becomes Additive.
 *
 * @param operation Scene operation.
 * @returns Additive, Subtractive or Intersecting.
 */
export function solidScriptBrushModeLabel(operation: SolidOperation): SolidScriptMode {
  const mode = solidScriptModeLabel(operation);
  return mode === 'Pass-Through' ? SOLID_SCRIPT_MODE_DEFAULT : mode;
}
