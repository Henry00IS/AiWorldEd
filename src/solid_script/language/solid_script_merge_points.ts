import * as THREE from 'three';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import type { SolidScriptShapeMesh } from './solid_script_mesh.js';
import { solidScriptConditionHolds } from './solid_script_condition.js';
import { solidScriptMeshMergeInto } from './solid_script_mesh_merge.js';
import { solidScriptValueNumber } from './solid_script_value.js';

/**
 * Merges mesh corners sharing a Merge ID at their average position. Only
 * corners passing Pick Where merge; every other keeps its own identity.
 *
 * @param run Running line.
 * @param mesh Mesh.
 * @returns Welded mesh.
 */
export function solidScriptMergePoints(run: SolidScriptBlockRun, mesh: SolidScriptShapeMesh): SolidScriptShapeMesh {
  const first = new Map<number, number>();
  const roots = mesh.points.map((position, index) => {
    const $Vertex = run.elements.vertex(mesh, { index, position, normal: new THREE.Vector3() });
    const bindings = { $Vertex, $Index: index, $Count: mesh.points.length };
    if (!solidScriptConditionHolds(run, 'pick', bindings)) return index;
    const id = solidScriptValueNumber(run.valueWith('merge_id', bindings));
    if (id === undefined || !Number.isInteger(id)) throw new Error('Merge ID needs a whole number at each vertex');
    return first.get(id) ?? first.set(id, index).get(id) ?? index;
  });
  return solidScriptMeshMergeInto(mesh, roots, true);
}
