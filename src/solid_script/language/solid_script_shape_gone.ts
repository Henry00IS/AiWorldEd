import type { SolidScriptShapeMesh } from './solid_script_mesh.js';
import { solidScriptShapeIsLeaf, type SolidScriptShape } from './solid_script_shape.js';

/**
 * Makes what a deleted solid or mesh becomes: a mesh with nothing in it, which
 * the result leaves out.
 *
 * @param label Label of the deleted object.
 * @returns Empty mesh.
 */
export function solidScriptShapeGone(label: string): SolidScriptShapeMesh {
  return { kind: 'mesh', label, points: [], faces: [], uvs: [] };
}

/**
 * Tells whether a shape is a deleted object: a mesh with no faces left.
 *
 * @param shape Shape.
 * @returns True when it was deleted or lost every face.
 */
export function solidScriptShapeIsGone(shape: SolidScriptShape): boolean {
  return shape.kind === 'mesh' && shape.faces.length === 0;
}

/**
 * Leaves the deleted objects out of a shape tree; a join whose first part is
 * gone is gone too, and so is a group with nothing left.
 *
 * @param shape Shape tree.
 * @returns The tree without them, or null when nothing is left.
 */
export function solidScriptShapePruned(shape: SolidScriptShape): SolidScriptShape | null {
  if (solidScriptShapeIsLeaf(shape)) return solidScriptShapeIsGone(shape) ? null : shape;
  const kept = shape.children.map(solidScriptShapePruned);
  if (shape.kind === 'boolean' && shape.operation === 'difference' && kept[0] === null) return null;
  const children = kept.filter((child): child is SolidScriptShape => child !== null);
  if (children.length === 0) return null;
  return children.length === shape.children.length ? shape : { ...shape, children };
}
