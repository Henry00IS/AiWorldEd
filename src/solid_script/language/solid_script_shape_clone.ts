import type * as THREE from 'three';
import type {
  SolidScriptFaceTag,
  SolidScriptFaceUv,
  SolidScriptReceived,
  SolidScriptShape,
  SolidScriptShapeSolid,
} from './solid_script_shape.js';
import type { SolidScriptShapeMesh, SolidScriptUv } from './solid_script_mesh.js';
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
  if (shape.kind === 'solid') return solidScriptSolidClone(shape);
  if (shape.kind === 'mesh') return solidScriptMeshClone(shape);
  return { ...shape, path: solidScriptPathMap(shape.path, ([x, y]): [number, number] => [x, y]) };
}

/**
 * Copies a solid, including its corners, textures and clip plane.
 *
 * @param leaf Solid.
 * @returns Independent copy.
 */
function solidScriptSolidClone(leaf: SolidScriptShapeSolid): SolidScriptShapeSolid {
  const copy: SolidScriptShapeSolid = { ...leaf, points: leaf.points.map((point) => point.clone()) };
  if (leaf.received) copy.received = solidScriptReceivedClone(leaf.received);
  if (leaf.faceTextures) copy.faceTextures = leaf.faceTextures.map(solidScriptFacePinClone);
  if (leaf.faceSmooth) copy.faceSmooth = leaf.faceSmooth.map(solidScriptFacePinClone);
  if (leaf.faceUvs) copy.faceUvs = leaf.faceUvs.map(solidScriptFaceUvClone);
  if (leaf.faceTags) copy.faceTags = leaf.faceTags.map(solidScriptFaceTagClone);
  if (leaf.clippedBy) copy.clippedBy = { normal: leaf.clippedBy.normal.clone(), constant: leaf.clippedBy.constant };
  if (leaf.uvCarry) copy.uvCarry = leaf.uvCarry.clone();
  return copy;
}

/**
 * Copies a received-brush record.
 *
 * @param received Record.
 * @returns Independent copy.
 */
function solidScriptReceivedClone(received: SolidScriptReceived): SolidScriptReceived {
  const copy: SolidScriptReceived = { ...received, matrix: received.matrix.clone() };
  if (received.clip) copy.clip = { normal: [...received.clip.normal], constant: received.clip.constant };
  return copy;
}

/**
 * Copies a per-face texture record.
 *
 * @param face Record.
 * @returns Independent copy.
 */
function solidScriptFacePinClone<Pin extends { point: THREE.Vector3; normal: THREE.Vector3 }>(face: Pin): Pin {
  return { ...face, point: face.point.clone(), normal: face.normal.clone() };
}

/**
 * Copies a per-face UV record.
 *
 * @param face Record.
 * @returns Independent copy.
 */
function solidScriptFaceUvClone(face: SolidScriptFaceUv): SolidScriptFaceUv {
  return { point: face.point.clone(), normal: face.normal.clone(), uv: face.uv.clone() };
}

/**
 * Copies a face tag, including its plane.
 *
 * @param tag Tag.
 * @returns Independent copy.
 */
function solidScriptFaceTagClone(tag: SolidScriptFaceTag): SolidScriptFaceTag {
  return { ...tag, point: tag.point.clone(), normal: tag.normal.clone() };
}

/**
 * Copies a mesh, including its corners, faces and UVs.
 *
 * @param mesh Mesh.
 * @returns Independent copy.
 */
function solidScriptMeshClone(mesh: SolidScriptShapeMesh): SolidScriptShapeMesh {
  const copy: SolidScriptShapeMesh = {
    ...mesh,
    points: mesh.points.map((point) => point.clone()),
    faces: mesh.faces.map((face) => [...face]),
    uvs: mesh.uvs.map((face) => face?.map(([u, v]): SolidScriptUv => [u, v]) ?? null),
  };
  if (mesh.faceTags) copy.faceTags = mesh.faceTags.map(solidScriptFaceTagClone);
  if (mesh.uvCarry) copy.uvCarry = mesh.uvCarry.clone();
  return copy;
}
