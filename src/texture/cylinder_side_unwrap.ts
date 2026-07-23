import * as THREE from 'three';
import { FaceTextureMapEntry } from './face_texture_mapping.js';
import { getGeometrySource } from './geometry_source.js';
import {
  buildProjectionBasis,
  computeRegionWorldNormal,
  resolveProjectionNormal
} from './planar_uv_projector.js';

/** Wall-like sides: normals nearly horizontal. */
const SIDE_NORMAL_Y_MAX = 0.35;

const scratchLocal = new THREE.Vector3();
const scratchWorld = new THREE.Vector3();

/**
 * Applies circumferential U offsets to cylinder side faces.
 * Each side keeps face-plane projection (no squash) and U ranges are laid
 * end-to-end around the shell so the texture unwraps instead of repeating.
 * Caps (top/bottom) are left unchanged.
 * @param mesh Mesh whose geometry source may be a cylinder.
 * @param entries Face texture map entries to mutate in place.
 */
export function applyCylinderSideUnwrapOffsets(
  mesh: THREE.Mesh,
  entries: FaceTextureMapEntry[]
): void {
  if (!isCylinderMesh(mesh)) return;
  mesh.updateMatrixWorld(true);
  const sideEntries = collectSortedSideEntries(mesh, entries);
  if (sideEntries.length < 3) return;
  assignSequentialUOffsets(mesh, sideEntries);
}

/**
 * Returns whether the mesh is stamped or typed as a cylinder.
 * @param mesh Mesh to inspect.
 * @returns True for cylinder primitives.
 */
function isCylinderMesh(mesh: THREE.Mesh): boolean {
  const source = getGeometrySource(mesh) || getGeometrySource(mesh.geometry);
  if (source?.type === 'cylinder') return true;
  return mesh.geometry instanceof THREE.CylinderGeometry;
}

/**
 * Collects side-face entries sorted by outward normal angle around Y.
 * @param mesh Mesh providing world normals.
 * @param entries All face map entries.
 * @returns Sorted side entries only.
 */
function collectSortedSideEntries(
  mesh: THREE.Mesh,
  entries: FaceTextureMapEntry[]
): FaceTextureMapEntry[] {
  const sides = entries.filter((entry) => {
    const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
    return Math.abs(normal.y) <= SIDE_NORMAL_Y_MAX;
  });
  sides.sort((a, b) => {
    const na = computeRegionWorldNormal(mesh, a.triangleIndices);
    const nb = computeRegionWorldNormal(mesh, b.triangleIndices);
    return Math.atan2(na.x, na.z) - Math.atan2(nb.x, nb.z);
  });
  return sides;
}

/**
 * Writes sequential offsetU values so side U ranges tile around the cylinder.
 * Offsets U by cumulative side length so faces unwrap end-to-end.
 * @param mesh Mesh for vertex transforms.
 * @param sideEntries Side faces in angular order.
 */
function assignSequentialUOffsets(
  mesh: THREE.Mesh,
  sideEntries: FaceTextureMapEntry[]
): void {
  let cumulativeU = 0;
  sideEntries.forEach((entry) => {
    const span = measureFacePlaneUSpan(mesh, entry);
    const minDot = measureFacePlaneMinUDot(mesh, entry);
    const scaleU = entry.mapping.scaleU === 0 ? 1 : entry.mapping.scaleU;
    // u = (dot - offsetU) / scaleU  →  place this face at [cumulativeU, cumulativeU+span)
    entry.mapping.offsetU = minDot - cumulativeU * scaleU;
    cumulativeU += span / scaleU;
  });
}

/**
 * Measures the physical U extent of a face under face-plane projection.
 * @param mesh Mesh owner.
 * @param entry Face region and mapping.
 * @returns World-meters span along the face U axis.
 */
function measureFacePlaneUSpan(
  mesh: THREE.Mesh,
  entry: FaceTextureMapEntry
): number {
  const dots = collectFacePlaneUDots(mesh, entry);
  if (dots.length === 0) return 0;
  return Math.max(...dots) - Math.min(...dots);
}

/**
 * Minimum world position dot the face U axis (raw, before offset).
 * @param mesh Mesh owner.
 * @param entry Face region and mapping.
 * @returns Minimum U dot product.
 */
function measureFacePlaneMinUDot(
  mesh: THREE.Mesh,
  entry: FaceTextureMapEntry
): number {
  const dots = collectFacePlaneUDots(mesh, entry);
  if (dots.length === 0) return 0;
  return Math.min(...dots);
}

/**
 * Collects raw U dots for every vertex in a face region.
 * @param mesh Mesh owner.
 * @param entry Face region and mapping.
 * @returns Dot products along the face U axis.
 */
function collectFacePlaneUDots(
  mesh: THREE.Mesh,
  entry: FaceTextureMapEntry
): number[] {
  const faceNormal = computeRegionWorldNormal(mesh, entry.triangleIndices);
  const projectionNormal = resolveProjectionNormal(faceNormal, 'face');
  const basis = buildProjectionBasis(projectionNormal, entry.mapping.rotationDeg);
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const dots: number[] = [];
  entry.triangleIndices.forEach((faceIndex) => {
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = index
        ? index.getX(faceIndex * 3 + corner)
        : faceIndex * 3 + corner;
      scratchLocal.fromBufferAttribute(position, vertexIndex);
      scratchWorld.copy(scratchLocal).applyMatrix4(mesh.matrixWorld);
      dots.push(scratchWorld.dot(basis.uAxis));
    }
  });
  return dots;
}
