import * as THREE from 'three';
import { SolidBrushInstance } from './solid_brush_instance.js';
import { computeTriangleNormal } from '../../selection/triangle_geometry_utils.js';

/**
 * Minimum normal agreement to treat a preview triangle as a brush face.
 */
const FACE_NORMAL_MATCH_DOT = 0.9;

/**
 * Maps a triangle on a solid brush preview mesh to a wing-edge brush face index.
 * Three.js BoxGeometry face order does not match our solid brush face order, so
 * matching is done by comparing triangle normals to brush plane normals.
 * @param mesh Brush preview mesh.
 * @param triangleIndex Triangle index on the preview geometry.
 * @param brush Brush instance owning the mesh.
 * @returns Brush face index, or -1 when no match is found.
 */
export function mapPreviewTriangleToBrushFace(
  mesh: THREE.Mesh,
  triangleIndex: number,
  brush: SolidBrushInstance
): number {
  const localNormal = computeTriangleNormal(mesh.geometry, triangleIndex);
  if (localNormal.lengthSq() < 1e-12) return -1;
  const solidLocalNormal = transformDirectionByMesh(mesh, localNormal);
  const modelBrush = brush.getModelSpaceBrush();
  let bestIndex = -1;
  let bestDot = FACE_NORMAL_MATCH_DOT;
  for (let faceIndex = 0; faceIndex < modelBrush.planes.length; faceIndex++) {
    const dot = modelBrush.planes[faceIndex].normal.dot(solidLocalNormal);
    if (dot > bestDot) {
      bestDot = dot;
      bestIndex = faceIndex;
    }
  }
  return bestIndex;
}

/**
 * Transforms a mesh-local direction into the solid-model local space.
 * @param mesh Brush preview mesh.
 * @param localDirection Direction in mesh local space.
 * @returns Unit direction in the solid model local space.
 */
function transformDirectionByMesh(
  mesh: THREE.Mesh,
  localDirection: THREE.Vector3
): THREE.Vector3 {
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrix);
  return localDirection.clone().applyMatrix3(normalMatrix).normalize();
}
