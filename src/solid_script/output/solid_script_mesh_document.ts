import * as THREE from 'three';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';

/** One mesh a script built, ready to become a regular mesh object. */
export interface SolidScriptMeshDocument {
  /** Name from the part or command that built it. */
  name: string;
  /** Editable polygon document. */
  document: MeshDocument;
  /** True when the script gave texture coordinates. */
  hasUvs: boolean;
}

/**
 * Turns a script mesh into an editable mesh document in editor coordinates (Y
 * up), placed by a matrix like the brushes. When the script gave texture
 * coordinates to some faces, the others get theirs from X and Y, so every
 * corner has one.
 *
 * @param mesh Script mesh.
 * @param upAxis Up axis of the script: 'z' turns Z up into Y up.
 * @param placed Placement after the axis turn.
 * @returns Mesh document and its name.
 */
export function solidScriptMeshDocumentBuild(
  mesh: SolidScriptShapeMesh,
  upAxis: 'z' | 'y',
  placed: THREE.Matrix4,
): SolidScriptMeshDocument {
  const positions = new Float32Array(mesh.points.length * 3);
  mesh.points.forEach((point, index) => {
    const editor = upAxis === 'z' ? new THREE.Vector3(point.x, point.z, -point.y) : point.clone();
    const moved = editor.applyMatrix4(placed);
    positions.set([moved.x, moved.y, moved.z], index * 3);
  });
  const flip = placed.determinant() < 0;
  const faces = mesh.faces.map((face) => (flip ? [...face].reverse() : face));
  const hasUvs = mesh.uvs.some((uv) => uv !== null);
  const name = solidScriptCommandFind(mesh.label)?.label ?? mesh.label;
  if (!hasUvs) return { name, document: meshDocumentFromPolygonList(positions, faces), hasUvs };
  const corners: number[] = [];
  mesh.faces.forEach((face, index) => {
    const uv =
      mesh.uvs[index] ?? face.map((corner): [number, number] => [mesh.points[corner]!.x, mesh.points[corner]!.y]);
    for (const [u, v] of flip ? [...uv].reverse() : uv) corners.push(u, v);
  });
  return { name, document: meshDocumentFromPolygonList(positions, faces, new Float32Array(corners)), hasUvs };
}
