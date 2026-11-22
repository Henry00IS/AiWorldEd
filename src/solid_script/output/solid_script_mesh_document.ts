import * as THREE from 'three';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  solidScriptMeshLoopCenter,
  solidScriptMeshLoopNormal,
  type SolidScriptShapeMesh,
} from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptFaceTextureOwn } from '@/solid_script/language/solid_script_shape.js';

/** One mesh a script built, ready to become a regular mesh object. */
export interface SolidScriptMeshDocument {
  /** Name from the part or command that built it. */
  name: string;
  /** Editable polygon document. */
  document: MeshDocument;
  /** True when the script gave texture coordinates. */
  hasUvs: boolean;
  /**
   * Texture slots: slot 0 is the Texture block's library texture, or null for
   * the default; each texture Texture Faces gave follows once.
   */
  textures: (string | null)[];
  /** Slot of each face, in face order. */
  slots: number[];
}

/**
 * Turns a script mesh into an editable mesh document, placed by a matrix like
 * the brushes. When the script gave texture coordinates to some faces, the
 * others get theirs as seen from above (X and -Z), so every corner has one.
 *
 * @param mesh Script mesh.
 * @param placed Placement.
 * @returns Mesh document and its name.
 */
export function solidScriptMeshDocumentBuild(
  mesh: SolidScriptShapeMesh,
  placed: THREE.Matrix4,
): SolidScriptMeshDocument {
  const positions = new Float32Array(mesh.points.length * 3);
  mesh.points.forEach((point, index) => {
    const moved = point.clone().applyMatrix4(placed);
    positions.set([moved.x, moved.y, moved.z], index * 3);
  });
  const flip = placed.determinant() < 0;
  const faces = mesh.faces.map((face) => (flip ? [...face].reverse() : face));
  const hasUvs = mesh.uvs.some((uv) => uv !== null);
  const name = solidScriptCommandFind(mesh.label)?.label ?? mesh.label;
  const { textures, slots } = solidScriptMeshDocumentSlots(mesh);
  if (!hasUvs) return { name, document: meshDocumentFromPolygonList(positions, faces), hasUvs, textures, slots };
  const corners: number[] = [];
  mesh.faces.forEach((face, index) => {
    const uv =
      mesh.uvs[index] ?? face.map((corner): [number, number] => [mesh.points[corner]!.x, -mesh.points[corner]!.z]);
    for (const [u, v] of flip ? [...uv].reverse() : uv) corners.push(u, v);
  });
  return {
    name,
    document: meshDocumentFromPolygonList(positions, faces, new Float32Array(corners)),
    hasUvs,
    textures,
    slots,
  };
}

/**
 * Lists a mesh's texture slots and the slot of each face: slot 0 is the whole
 * mesh's texture, and each texture Texture Faces gave a face gets a slot of its
 * own the first time it is used.
 *
 * @param mesh Script mesh.
 * @returns Slot textures and the slot of each face.
 */
function solidScriptMeshDocumentSlots(mesh: SolidScriptShapeMesh): { textures: (string | null)[]; slots: number[] } {
  const textures: (string | null)[] = [mesh.texture ?? null];
  const slots = mesh.faces.map((face) => {
    const own = solidScriptFaceTextureOwn(
      mesh.faceTextures ?? [],
      solidScriptMeshLoopNormal(mesh.points, face),
      solidScriptMeshLoopCenter(mesh.points, face),
    );
    if (own === undefined) return 0;
    if (!textures.includes(own)) textures.push(own);
    return textures.indexOf(own);
  });
  return { textures, slots };
}
