import * as THREE from 'three';
import type { SolidBrushInstance } from './solid_brush_instance.js';
import { isSolidCsgGroup } from './solid_group.js';

/**
 * Returns whether a transform of the selected objects moves a brush: the brush
 * mesh itself is selected, or one of the CSG groups that hold it is.
 *
 * @param brush Brush instance to test.
 * @param selectedObjects Objects the transform moves.
 * @returns True when the brush moves with the selection.
 */
export function solidBrushTransformScopeContains(
  brush: SolidBrushInstance,
  selectedObjects: ReadonlySet<THREE.Object3D>,
): boolean {
  let current: THREE.Object3D | null = brush.mesh;
  while (current) {
    if (selectedObjects.has(current)) return true;
    current = current.parent;
    if (!current || !isSolidCsgGroup(current)) return false;
  }
  return false;
}

/**
 * Collects the brushes of a list that a transform of the selected objects
 * moves, including brushes nested under selected CSG groups.
 *
 * @param brushes Brushes to filter.
 * @param selectedObjects Objects the transform moves.
 * @returns Brushes moved by the selection.
 */
export function solidBrushTransformScopeCollect(
  brushes: readonly SolidBrushInstance[],
  selectedObjects: ReadonlySet<THREE.Object3D>,
): SolidBrushInstance[] {
  return brushes.filter((brush) => solidBrushTransformScopeContains(brush, selectedObjects));
}
