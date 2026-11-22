import { solidScriptMeshIntersect, solidScriptMeshSubtract } from './solid_script_mesh_boolean.js';
import { solidScriptShapeMeshes, type SolidScriptShapeMesh } from './solid_script_mesh.js';
import type { SolidScriptShape } from './solid_script_shape.js';

/** The meshes one shape gives and how they combine with the meshes before it. */
interface SolidScriptMeshModesPart {
  meshes: SolidScriptShapeMesh[];
  mode: 'Subtractive' | 'Intersecting' | undefined;
}

/**
 * Reads what one shape adds to the meshes of its level.
 *
 * @param shape Shape.
 * @returns Its meshes and their Mode.
 */
function solidScriptMeshModesPart(shape: SolidScriptShape): SolidScriptMeshModesPart {
  if (shape.kind === 'mesh') return { meshes: [shape], mode: solidScriptMeshModesCutting(shape.mode) };
  if (shape.kind === 'group')
    return { meshes: solidScriptMeshModesLevel(shape.children), mode: solidScriptMeshModesCutting(shape.mode) };
  if (shape.kind === 'boolean') return { meshes: solidScriptMeshModesLevel(shape.children), mode: undefined };
  return { meshes: [], mode: undefined };
}

/**
 * Keeps a Mode only when it cuts.
 *
 * @param mode Mode as set.
 * @returns Subtractive, Intersecting or nothing.
 */
function solidScriptMeshModesCutting(mode: string | undefined): SolidScriptMeshModesPart['mode'] {
  return mode === 'Subtractive' || mode === 'Intersecting' ? mode : undefined;
}

/**
 * Combines the meshes of one level in order: a Subtractive mesh cuts itself out
 * of the meshes before it, an Intersecting one keeps only where they overlap
 * it, and either is then gone, like a solid with that Mode.
 *
 * @param shapes Shapes of the level, in order.
 * @returns Meshes left.
 */
function solidScriptMeshModesLevel(shapes: readonly SolidScriptShape[]): SolidScriptShapeMesh[] {
  let kept: SolidScriptShapeMesh[] = [];
  for (const shape of shapes) {
    const { meshes, mode } = solidScriptMeshModesPart(shape);
    if (mode === 'Subtractive')
      kept = kept.flatMap((mesh) =>
        meshes.reduce<SolidScriptShapeMesh[]>(
          (left, cutter) => left.flatMap((part) => solidScriptMeshSubtract(part, cutter) ?? []),
          [mesh],
        ),
      );
    else if (mode === 'Intersecting')
      kept = kept.flatMap((mesh) => meshes.flatMap((cutter) => solidScriptMeshIntersect(mesh, cutter) ?? []));
    else kept.push(...meshes);
  }
  return kept;
}

/**
 * Whether any mesh or group holding meshes in a shape tree cuts.
 *
 * @param shapes Shapes.
 * @returns True when one has Mode Subtractive or Intersecting.
 */
function solidScriptMeshModesAny(shapes: readonly SolidScriptShape[]): boolean {
  return shapes.some((shape) => {
    if (shape.kind === 'mesh') return solidScriptMeshModesCutting(shape.mode) !== undefined;
    if (shape.kind !== 'group' && shape.kind !== 'boolean') return false;
    const cuts = shape.kind === 'group' && solidScriptMeshModesCutting(shape.mode) !== undefined;
    return (cuts && solidScriptShapeMeshes(shape.children).length > 0) || solidScriptMeshModesAny(shape.children);
  });
}

/**
 * The meshes a script's result shows, after meshes with Mode Subtractive or
 * Intersecting cut the meshes before them on their level. Solids are not cut by
 * meshes, and meshes are not cut by solids.
 *
 * @param shapes Result shapes.
 * @returns Meshes to show.
 */
export function solidScriptShapeMeshesCut(shapes: readonly SolidScriptShape[]): SolidScriptShapeMesh[] {
  return solidScriptMeshModesAny(shapes) ? solidScriptMeshModesLevel(shapes) : solidScriptShapeMeshes(shapes);
}
