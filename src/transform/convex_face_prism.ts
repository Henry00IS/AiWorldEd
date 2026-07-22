import * as THREE from 'three';
import {
  computeTriangleNormal,
  getTriangleVertexIndices,
  getVertexPosition
} from '../selection/triangle_geometry_utils.js';
import { Theme } from '../theme.js';
import {
  enableFlatShadingOnMesh,
  prepareFlatShadedGeometry,
  rebuildDecorativeEdges
} from '../utils/mesh_edge_sync.js';
import { createContentMaterial } from '../materials/content_material_factory.js';
import { initializeMeshTextureUVs } from '../texture/face_texture_applier.js';

/**
 * Builds a new convex prism mesh by extruding a coplanar face polygon.
 * The source mesh is never modified. Because the face is convex and extrusion
 * is along a single normal, the resulting solid is always convex.
 */

/**
 * Creates a convex prism mesh from selected coplanar face triangles.
 * @param sourceMesh The mesh that owns the face (used for world transform).
 * @param faceIndices Coplanar triangle indices of the face region.
 * @param distance Positive extrude distance along the face normal.
 * @param objectName Name assigned to the new mesh.
 * @returns A new mesh in world space, not yet parented, or null on failure.
 */
export function createConvexPrismFromFace(
  sourceMesh: THREE.Mesh,
  faceIndices: number[],
  distance: number,
  objectName: string
): THREE.Mesh | null {
  if (faceIndices.length === 0) return null;
  if (Math.abs(distance) < 1e-8) return null;
  sourceMesh.updateMatrixWorld(true);
  const worldPolygon = collectWorldFacePolygon(sourceMesh, faceIndices);
  if (worldPolygon.length < 3) return null;
  const worldNormal = computeWorldFaceNormal(sourceMesh, faceIndices[0]);
  if (worldNormal.lengthSq() < 1e-10) return null;
  const orderedPolygon = orderConvexPolygon(worldPolygon, worldNormal);
  if (orderedPolygon.length < 3) return null;
  const signedDistance = distance;
  const geometry = buildPrismGeometry(orderedPolygon, worldNormal, signedDistance);
  const flatGeometry = prepareFlatShadedGeometry(geometry);
  geometry.dispose();
  const mesh = buildPrismMesh(flatGeometry, objectName);
  centerMeshAtGeometryOrigin(mesh);
  // Edges must be built after centering so local outline matches mesh.geometry.
  rebuildDecorativeEdges(mesh);
  return mesh;
}

/**
 * Collects unique face vertices transformed into world space.
 * @param sourceMesh The source mesh.
 * @param faceIndices Selected triangle indices.
 * @returns Unique world-space points on the face.
 */
function collectWorldFacePolygon(
  sourceMesh: THREE.Mesh,
  faceIndices: number[]
): THREE.Vector3[] {
  const positions = sourceMesh.geometry.getAttribute('position');
  const unique = new Map<string, THREE.Vector3>();
  faceIndices.forEach((faceIndex) => {
    const [i0, i1, i2] = getTriangleVertexIndices(sourceMesh.geometry, faceIndex);
    [i0, i1, i2].forEach((vertexIndex) => {
      const local = getVertexPosition(positions, vertexIndex);
      const world = local.applyMatrix4(sourceMesh.matrixWorld);
      const key = quantizePointKey(world);
      if (!unique.has(key)) {
        unique.set(key, world);
      }
    });
  });
  return Array.from(unique.values());
}

/**
 * Computes the face normal in world space.
 * @param sourceMesh The source mesh.
 * @param faceIndex Any triangle on the face.
 * @returns Normalized world-space normal.
 */
function computeWorldFaceNormal(
  sourceMesh: THREE.Mesh,
  faceIndex: number
): THREE.Vector3 {
  const localNormal = computeTriangleNormal(sourceMesh.geometry, faceIndex);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(sourceMesh.matrixWorld);
  return localNormal.applyMatrix3(normalMatrix).normalize();
}

/**
 * Orders coplanar points into a convex polygon winding around the normal.
 * @param points Unique coplanar points.
 * @param normal Face normal defining outward orientation.
 * @returns Convex polygon vertices in counter-clockwise order when viewed along normal.
 */
export function orderConvexPolygon(
  points: THREE.Vector3[],
  normal: THREE.Vector3
): THREE.Vector3[] {
  if (points.length <= 3) return points.slice();
  const centroid = computeCentroid(points);
  const basis = buildPlaneBasis(normal);
  const scored = points.map((point) => {
    const relative = point.clone().sub(centroid);
    const x = relative.dot(basis.xAxis);
    const y = relative.dot(basis.yAxis);
    return { point, angle: Math.atan2(y, x) };
  });
  scored.sort((a, b) => a.angle - b.angle);
  return scored.map((entry) => entry.point);
}

/**
 * Builds a prism BufferGeometry from a base polygon and extrusion.
 * Geometry is in world coordinates before centering.
 * @param basePolygon Ordered base polygon in world space.
 * @param normal Extrusion direction.
 * @param distance Signed extrusion distance.
 * @returns Non-centered prism geometry.
 */
function buildPrismGeometry(
  basePolygon: THREE.Vector3[],
  normal: THREE.Vector3,
  distance: number
): THREE.BufferGeometry {
  const offset = normal.clone().multiplyScalar(distance);
  const topPolygon = basePolygon.map((point) => point.clone().add(offset));
  const triangles: number[] = [];
  const positions: number[] = [];
  appendPolygonCap(basePolygon, normal, false, positions, triangles);
  appendPolygonCap(topPolygon, normal, true, positions, triangles);
  appendPrismSides(basePolygon, topPolygon, positions, triangles);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(positions), 3)
  );
  geometry.setIndex(triangles);
  return geometry;
}

/**
 * Appends a fan-triangulated polygon cap.
 * @param polygon Ordered polygon vertices.
 * @param normal Face normal for winding.
 * @param outward Whether this is the extruded outward cap.
 * @param positions Flat position array being built.
 * @param triangles Flat index array being built.
 */
function appendPolygonCap(
  polygon: THREE.Vector3[],
  normal: THREE.Vector3,
  outward: boolean,
  positions: number[],
  triangles: number[]
): void {
  const baseIndex = positions.length / 3;
  polygon.forEach((point) => {
    positions.push(point.x, point.y, point.z);
  });
  for (let i = 1; i < polygon.length - 1; i++) {
    if (outward) {
      triangles.push(baseIndex, baseIndex + i, baseIndex + i + 1);
    } else {
      triangles.push(baseIndex, baseIndex + i + 1, baseIndex + i);
    }
  }
  void normal;
}

/**
 * Appends side walls between base and top polygons.
 * @param basePolygon Ordered base ring.
 * @param topPolygon Ordered top ring.
 * @param positions Flat position array.
 * @param triangles Flat index array.
 */
function appendPrismSides(
  basePolygon: THREE.Vector3[],
  topPolygon: THREE.Vector3[],
  positions: number[],
  triangles: number[]
): void {
  const count = basePolygon.length;
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    const baseIndex = positions.length / 3;
    const a = basePolygon[i];
    const b = basePolygon[next];
    const c = topPolygon[next];
    const d = topPolygon[i];
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    triangles.push(baseIndex, baseIndex + 1, baseIndex + 2);
    triangles.push(baseIndex, baseIndex + 2, baseIndex + 3);
  }
}

/**
 * Creates a flat-shaded mesh without edge children.
 * Decorative edges are added after geometry centering.
 * @param geometry The prism geometry.
 * @param objectName Mesh name.
 * @returns Configured mesh.
 */
function buildPrismMesh(
  geometry: THREE.BufferGeometry,
  objectName: string
): THREE.Mesh {
  const material = createContentMaterial(Theme.boxColor);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = objectName;
  enableFlatShadingOnMesh(mesh);
  initializeMeshTextureUVs(mesh);
  return mesh;
}

/**
 * Centers geometry at the origin and moves the mesh to the previous center.
 * Does not touch child outlines — rebuild those after this call.
 * @param mesh The mesh to center.
 */
function centerMeshAtGeometryOrigin(mesh: THREE.Mesh): void {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box) return;
  const center = box.getCenter(new THREE.Vector3());
  mesh.geometry.translate(-center.x, -center.y, -center.z);
  mesh.position.copy(center);
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
}

/**
 * Averages a list of points.
 * @param points The points to average.
 * @returns Centroid vector.
 */
function computeCentroid(points: THREE.Vector3[]): THREE.Vector3 {
  const centroid = new THREE.Vector3();
  points.forEach((point) => centroid.add(point));
  return centroid.multiplyScalar(1 / Math.max(points.length, 1));
}

/**
 * Builds a 2D basis on the plane perpendicular to a normal.
 * @param normal Unit plane normal.
 * @returns Orthogonal x/y axes on the plane.
 */
function buildPlaneBasis(
  normal: THREE.Vector3
): { xAxis: THREE.Vector3; yAxis: THREE.Vector3 } {
  const reference = Math.abs(normal.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const xAxis = new THREE.Vector3().crossVectors(reference, normal).normalize();
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
  return { xAxis, yAxis };
}

/**
 * Quantizes a point for unique keying of nearly identical vertices.
 * @param point The point to quantize.
 * @returns A string key.
 */
function quantizePointKey(point: THREE.Vector3): string {
  const scale = 1e5;
  return `${Math.round(point.x * scale)}_${Math.round(point.y * scale)}_${Math.round(point.z * scale)}`;
}
