import * as THREE from 'three';
import {
  FaceTextureMapping,
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping
} from './face_texture_mapping.js';
import {
  ProjectionBasis,
  buildProjectionBasis,
  computeRegionWorldNormal,
  projectWorldPositionToUv,
  resolveProjectionNormal
} from './planar_uv_projector.js';
import {
  getTriangleVertexIndices,
  getVertexPosition
} from '../selection/triangle_geometry_utils.js';

/** Edge coincidence tolerance in world units. */
const EDGE_MATCH_TOLERANCE = 1e-3;
/** Parallel-plane threshold on |nA × nB|². */
const PARALLEL_NORMAL_DET = 1e-8;

/**
 * World-space edge segment used for shared-boundary detection.
 */
interface WorldEdge {
  a: THREE.Vector3;
  b: THREE.Vector3;
}

/**
 * Builds a destination face mapping so UV coordinates continue from a source
 * face across a shared edge (or projected plane alignment when parallel).
 * Copies texture id and scale; solves rotation and offset for face-plane UV.
 * @param sourceMesh Mesh owning the source region.
 * @param sourceTriangles Source coplanar triangle indices.
 * @param sourceMapping Source projection parameters.
 * @param destMesh Mesh owning the destination region.
 * @param destTriangles Destination coplanar triangle indices.
 * @returns Mapping for the destination region.
 */
export function transferUvMappingAcrossFaces(
  sourceMesh: THREE.Mesh,
  sourceTriangles: number[],
  sourceMapping: FaceTextureMapping,
  destMesh: THREE.Mesh,
  destTriangles: number[]
): FaceTextureMapping {
  sourceMesh.updateMatrixWorld(true);
  destMesh.updateMatrixWorld(true);
  const sourceNormal = computeRegionWorldNormal(sourceMesh, sourceTriangles);
  const destNormal = computeRegionWorldNormal(destMesh, destTriangles);
  const points = resolveAlignmentWorldPoints(
    sourceMesh,
    sourceTriangles,
    sourceNormal,
    destMesh,
    destTriangles,
    destNormal
  );
  const sourceBasis = buildSourceBasis(sourceNormal, sourceMapping);
  const uvA = projectWorldPositionToUv(points.pointA, sourceBasis, sourceMapping);
  const uvB = projectWorldPositionToUv(points.pointB, sourceBasis, sourceMapping);
  return solveDestinationMapping(
    destNormal,
    sourceMapping,
    points.pointA,
    points.pointB,
    uvA,
    uvB,
    points.flipU
  );
}

/**
 * Resolves two world points used to lock UV continuity between faces.
 * Prefers a shared mesh edge; falls back to plane-intersection geometry.
 * @param sourceMesh Source mesh.
 * @param sourceTriangles Source triangles.
 * @param sourceNormal Source world normal.
 * @param destMesh Destination mesh.
 * @param destTriangles Destination triangles.
 * @param destNormal Destination world normal.
 * @returns Alignment points and whether U should flip.
 */
function resolveAlignmentWorldPoints(
  sourceMesh: THREE.Mesh,
  sourceTriangles: number[],
  sourceNormal: THREE.Vector3,
  destMesh: THREE.Mesh,
  destTriangles: number[],
  destNormal: THREE.Vector3
): { pointA: THREE.Vector3; pointB: THREE.Vector3; flipU: boolean } {
  const shared = findSharedWorldEdge(
    sourceMesh,
    sourceTriangles,
    destMesh,
    destTriangles
  );
  if (shared) {
    return {
      pointA: shared.a,
      pointB: shared.b,
      flipU: sourceNormal.dot(destNormal) < 0
    };
  }
  return buildPlaneAlignmentPoints(sourceMesh, sourceTriangles, sourceNormal, destNormal);
}

/**
 * Finds a world-space edge shared (within tolerance) by two face regions.
 * @param sourceMesh Source mesh.
 * @param sourceTriangles Source triangles.
 * @param destMesh Destination mesh.
 * @param destTriangles Destination triangles.
 * @returns Shared edge endpoints, or null.
 */
function findSharedWorldEdge(
  sourceMesh: THREE.Mesh,
  sourceTriangles: number[],
  destMesh: THREE.Mesh,
  destTriangles: number[]
): WorldEdge | null {
  const sourceEdges = collectRegionWorldEdges(sourceMesh, sourceTriangles);
  const destEdges = collectRegionWorldEdges(destMesh, destTriangles);
  for (let i = 0; i < sourceEdges.length; i++) {
    for (let j = 0; j < destEdges.length; j++) {
      const match = matchEdges(sourceEdges[i], destEdges[j]);
      if (match) return match;
    }
  }
  return null;
}

/**
 * Collects unique world-space edges for a triangle region.
 * @param mesh Mesh owner.
 * @param triangleIndices Region triangles.
 * @returns Edge list.
 */
function collectRegionWorldEdges(
  mesh: THREE.Mesh,
  triangleIndices: number[]
): WorldEdge[] {
  const edges: WorldEdge[] = [];
  const seen = new Set<string>();
  const position = mesh.geometry.getAttribute('position');
  triangleIndices.forEach((faceIndex) => {
    const indices = getTriangleVertexIndices(mesh.geometry, faceIndex);
    const corners = indices.map((vertexIndex) => {
      const local = getVertexPosition(position, vertexIndex);
      return local.applyMatrix4(mesh.matrixWorld);
    });
    pushUniqueEdge(edges, seen, corners[0], corners[1]);
    pushUniqueEdge(edges, seen, corners[1], corners[2]);
    pushUniqueEdge(edges, seen, corners[2], corners[0]);
  });
  return edges;
}

/**
 * Adds an undirected edge if not already present.
 * @param edges Accumulator.
 * @param seen Dedup keys.
 * @param a First endpoint.
 * @param b Second endpoint.
 */
function pushUniqueEdge(
  edges: WorldEdge[],
  seen: Set<string>,
  a: THREE.Vector3,
  b: THREE.Vector3
): void {
  const key = edgeKey(a, b);
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({ a: a.clone(), b: b.clone() });
}

/**
 * Builds a stable key for an undirected edge.
 * @param a First point.
 * @param b Second point.
 * @returns String key.
 */
function edgeKey(a: THREE.Vector3, b: THREE.Vector3): string {
  const ka = `${a.x.toFixed(4)},${a.y.toFixed(4)},${a.z.toFixed(4)}`;
  const kb = `${b.x.toFixed(4)},${b.y.toFixed(4)},${b.z.toFixed(4)}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/**
 * Returns a shared edge when endpoints coincide within tolerance.
 * @param edgeA First edge.
 * @param edgeB Second edge.
 * @returns Canonical edge, or null.
 */
function matchEdges(edgeA: WorldEdge, edgeB: WorldEdge): WorldEdge | null {
  if (
    pointsNear(edgeA.a, edgeB.a) &&
    pointsNear(edgeA.b, edgeB.b)
  ) {
    return { a: edgeA.a.clone(), b: edgeA.b.clone() };
  }
  if (
    pointsNear(edgeA.a, edgeB.b) &&
    pointsNear(edgeA.b, edgeB.a)
  ) {
    return { a: edgeA.a.clone(), b: edgeA.b.clone() };
  }
  return null;
}

/**
 * Returns whether two points are within match tolerance.
 * @param a First point.
 * @param b Second point.
 * @returns True when near.
 */
function pointsNear(a: THREE.Vector3, b: THREE.Vector3): boolean {
  return a.distanceToSquared(b) <= EDGE_MATCH_TOLERANCE * EDGE_MATCH_TOLERANCE;
}

/**
 * Builds alignment points from plane geometry when faces do not share an edge.
 * @param sourceMesh Source mesh.
 * @param sourceTriangles Source triangles.
 * @param sourceNormal Source normal.
 * @param destNormal Destination normal.
 * @returns Alignment points and flip flag.
 */
function buildPlaneAlignmentPoints(
  sourceMesh: THREE.Mesh,
  sourceTriangles: number[],
  sourceNormal: THREE.Vector3,
  destNormal: THREE.Vector3
): { pointA: THREE.Vector3; pointB: THREE.Vector3; flipU: boolean } {
  const pointOnSource = computeRegionWorldCentroid(sourceMesh, sourceTriangles);
  const edgeDirection = new THREE.Vector3().crossVectors(sourceNormal, destNormal);
  const det = edgeDirection.lengthSq();
  const flipU = sourceNormal.dot(destNormal) < 0;
  if (det < PARALLEL_NORMAL_DET) {
    const tangent = pickStableTangent(sourceNormal);
    const pointA = pointOnSource.clone();
    const pointB = pointOnSource.clone().add(tangent);
    return { pointA, pointB, flipU };
  }
  edgeDirection.normalize();
  const pointA = pointOnSource.clone();
  const pointB = pointOnSource.clone().add(edgeDirection);
  return { pointA, pointB, flipU };
}

/**
 * Picks a unit tangent not parallel to the normal.
 * @param normal Face normal.
 * @returns Unit tangent.
 */
function pickStableTangent(normal: THREE.Vector3): THREE.Vector3 {
  const helper =
    Math.abs(normal.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(normal, helper).normalize();
}

/**
 * Average world-space centroid of region triangles.
 * @param mesh Mesh owner.
 * @param triangleIndices Region triangles.
 * @returns World centroid.
 */
function computeRegionWorldCentroid(
  mesh: THREE.Mesh,
  triangleIndices: number[]
): THREE.Vector3 {
  const position = mesh.geometry.getAttribute('position');
  const accumulator = new THREE.Vector3();
  let count = 0;
  triangleIndices.forEach((faceIndex) => {
    const indices = getTriangleVertexIndices(mesh.geometry, faceIndex);
    indices.forEach((vertexIndex) => {
      const local = getVertexPosition(position, vertexIndex);
      accumulator.add(local.applyMatrix4(mesh.matrixWorld));
      count += 1;
    });
  });
  if (count === 0) return new THREE.Vector3();
  return accumulator.multiplyScalar(1 / count);
}

/**
 * Builds the source projection basis from mapping align/rotation.
 * @param faceNormal Source face normal.
 * @param mapping Source mapping.
 * @returns Projection basis.
 */
function buildSourceBasis(
  faceNormal: THREE.Vector3,
  mapping: FaceTextureMapping
): ProjectionBasis {
  const projectionNormal = resolveProjectionNormal(faceNormal, mapping.align);
  return buildProjectionBasis(projectionNormal, mapping.rotationDeg);
}

/**
 * Solves destination mapping so both alignment points match source UVs.
 * @param destNormal Destination face normal.
 * @param sourceMapping Source mapping (scale/texture copied).
 * @param pointA First world alignment point.
 * @param pointB Second world alignment point.
 * @param uvA Source UV at point A.
 * @param uvB Source UV at point B.
 * @param flipU Whether to mirror U scale.
 * @returns Destination mapping.
 */
function solveDestinationMapping(
  destNormal: THREE.Vector3,
  sourceMapping: FaceTextureMapping,
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  uvA: { u: number; v: number },
  uvB: { u: number; v: number },
  flipU: boolean
): FaceTextureMapping {
  const mapping = createDefaultFaceTextureMapping(sourceMapping.textureId);
  mapping.align = 'face';
  mapping.scaleU = flipU ? -Math.abs(sourceMapping.scaleU) : sourceMapping.scaleU;
  mapping.scaleV = sourceMapping.scaleV;
  mapping.rotationDeg = 0;
  mapping.offsetU = 0;
  mapping.offsetV = 0;
  const projectionNormal = resolveProjectionNormal(destNormal, 'face');
  applyOffsetToMatchPoint(mapping, projectionNormal, pointA, uvA);
  const rotationDeg = measureRequiredRotation(
    mapping,
    projectionNormal,
    pointA,
    pointB,
    uvA,
    uvB
  );
  mapping.rotationDeg = rotationDeg;
  applyOffsetToMatchPoint(mapping, projectionNormal, pointA, uvA);
  return mapping;
}

/**
 * Sets offset so a world point maps to a target UV with the current rotation.
 * @param mapping Mapping to update.
 * @param projectionNormal Projection normal.
 * @param worldPoint World sample.
 * @param targetUv Desired UV.
 */
function applyOffsetToMatchPoint(
  mapping: FaceTextureMapping,
  projectionNormal: THREE.Vector3,
  worldPoint: THREE.Vector3,
  targetUv: { u: number; v: number }
): void {
  const basis = buildProjectionBasis(projectionNormal, mapping.rotationDeg);
  const scaleU = mapping.scaleU === 0 ? 1 : mapping.scaleU;
  const scaleV = mapping.scaleV === 0 ? 1 : mapping.scaleV;
  const rawU = worldPoint.dot(basis.uAxis);
  const rawV = worldPoint.dot(basis.vAxis);
  mapping.offsetU = rawU - targetUv.u * scaleU;
  mapping.offsetV = rawV - targetUv.v * scaleV;
}

/**
 * Measures rotation (degrees) so pointB UV direction matches the source.
 * @param mapping Current dest mapping (offset already set for pointA).
 * @param projectionNormal Dest projection normal.
 * @param pointA First world point.
 * @param pointB Second world point.
 * @param uvA Source UV at A.
 * @param uvB Source UV at B.
 * @returns Rotation degrees around the normal.
 */
function measureRequiredRotation(
  mapping: FaceTextureMapping,
  projectionNormal: THREE.Vector3,
  pointA: THREE.Vector3,
  pointB: THREE.Vector3,
  uvA: { u: number; v: number },
  uvB: { u: number; v: number }
): number {
  const basis = buildProjectionBasis(projectionNormal, mapping.rotationDeg);
  const destA = projectWorldPositionToUv(pointA, basis, mapping);
  const destB = projectWorldPositionToUv(pointB, basis, mapping);
  const destDir = new THREE.Vector2(destB.u - destA.u, destB.v - destA.v);
  const sourceDir = new THREE.Vector2(uvB.u - uvA.u, uvB.v - uvA.v);
  if (destDir.lengthSq() < 1e-12 || sourceDir.lengthSq() < 1e-12) {
    return 0;
  }
  destDir.normalize();
  sourceDir.normalize();
  // Angle that rotates destDir onto sourceDir in UV space.
  const angleRad = Math.atan2(
    destDir.x * sourceDir.y - destDir.y * sourceDir.x,
    destDir.x * sourceDir.x + destDir.y * sourceDir.y
  );
  // Rotating the projection basis by θ rotates UV samples by -θ, so invert.
  let angleDeg = -THREE.MathUtils.radToDeg(angleRad);
  if ((mapping.scaleU < 0) !== (mapping.scaleV < 0)) {
    angleDeg = -angleDeg;
  }
  return angleDeg;
}

/**
 * Clones a mapping for use as a smear source seed.
 * @param mapping Source mapping.
 * @returns Independent copy.
 */
export function cloneSmearSourceMapping(
  mapping: FaceTextureMapping
): FaceTextureMapping {
  return cloneFaceTextureMapping(mapping);
}
