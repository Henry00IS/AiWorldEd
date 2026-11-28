import type { SolidScriptShape } from './solid_script_shape.js';
import { solidScriptStructureClone } from './solid_script_structure_clone.js';
import { solidScriptPathMap } from './solid_script_path_model.js';

/**
 * Copies a shape tree so a later stamp or edit does not change the original.
 *
 * @param shape Shape tree.
 * @returns Independent copy.
 */
export function solidScriptShapeClone(shape: SolidScriptShape): SolidScriptShape {
  if (shape.kind === 'group' || shape.kind === 'boolean')
    return { ...shape, children: shape.children.map(solidScriptShapeClone) };
  if (shape.kind === 'solid' || shape.kind === 'mesh') return solidScriptStructureClone(shape);
  return { ...shape, path: solidScriptPathMap(shape.path, ([x, y]): [number, number] => [x, y]) };
}
