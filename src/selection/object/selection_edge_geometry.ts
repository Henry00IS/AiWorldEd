import * as THREE from 'three';
import { getTriangleCount } from '@/selection/pick/utils_triangle_geometry.js';
import { buildGeometryPickStamp } from '@/selection/pick/mesh_pick_acceleration.js';
import { getOrBuildMeshDocumentOutlineEdges } from '@/mesh/convert/mesh_document_outline_edges.js';

/** UserData cache for selection outline edge buffers. */
const SELECTION_EDGE_CACHE_USERDATA_KEY = 'selectionEdgeGeometryCache';

/**
 * Triangle count above which full EdgesGeometry is skipped in favor of a
 * bounding-box outline (keeps selection of million-triangle meshes
 * interactive).
 */
export const SELECTION_EDGE_DENSE_TRIANGLE_THRESHOLD = 24_000;

/**
 * Angle threshold (degrees) for EdgesGeometry when building dense-safe
 * outlines. Only used when no MeshDocument is available.
 */
const SELECTION_EDGE_ANGLE_THRESHOLD = 20;

/** Cached edge geometry tied to a geometry content stamp. */
interface SelectionEdgeGeometryCache {
  stamp: string;
  edges: THREE.BufferGeometry;
}

/**
 * Returns a selection outline geometry for a mesh. Prefers MeshDocument
 * wing-edge topology (same lines as Edit Mode) so n-gon ear-clip diagonals are
 * not drawn. Falls back to cached EdgesGeometry / AABB for document-less
 * meshes.
 *
 * @param mesh Mesh being highlighted.
 * @returns Edge buffer geometry (owned by a cache; do not dispose unless
 *   clearing the cache).
 */
export function getOrBuildSelectionEdgeGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const documentEdges = getOrBuildMeshDocumentOutlineEdges(mesh);
  if (documentEdges) {
    return documentEdges;
  }
  return getOrBuildGpuSelectionEdgeGeometry(mesh);
}

/**
 * Returns GPU-derived selection edges with content-stamp caching.
 *
 * @param mesh Mesh being highlighted.
 * @returns Cached edge geometry.
 */
function getOrBuildGpuSelectionEdgeGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const geometry = mesh.geometry;
  const stamp = buildGeometryPickStamp(geometry);
  const existing = geometry.userData[SELECTION_EDGE_CACHE_USERDATA_KEY] as SelectionEdgeGeometryCache | undefined;
  if (existing && existing.stamp === stamp) {
    return existing.edges;
  }
  if (existing) {
    existing.edges.dispose();
  }
  const edges = buildSelectionEdgeGeometry(geometry);
  geometry.userData[SELECTION_EDGE_CACHE_USERDATA_KEY] = { stamp, edges } satisfies SelectionEdgeGeometryCache;
  return edges;
}

/**
 * Builds edge outline geometry for selection when no MeshDocument exists. Dense
 * meshes use the local AABB wireframe instead of walking every triangle.
 *
 * @param geometry Source mesh geometry.
 * @returns New edge buffer geometry.
 */
function buildSelectionEdgeGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const triangleCount = getTriangleCount(geometry);
  if (triangleCount >= SELECTION_EDGE_DENSE_TRIANGLE_THRESHOLD) {
    return createBoundingBoxEdgeGeometry(geometry);
  }
  return new THREE.EdgesGeometry(geometry, SELECTION_EDGE_ANGLE_THRESHOLD);
}

/**
 * Builds a 12-edge wireframe from the geometry bounding box.
 *
 * @param geometry Source geometry.
 * @returns Line segment geometry for the AABB.
 */
function createBoundingBoxEdgeGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  const box =
    geometry.boundingBox ?? new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  const min = box.min;
  const max = box.max;
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, max.z),
    new THREE.Vector3(min.x, max.y, max.z),
  ];
  const pairs: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const positions = new Float32Array(pairs.length * 6);
  let write = 0;
  for (const [a, b] of pairs) {
    const start = corners[a]!;
    const end = corners[b]!;
    positions[write++] = start.x;
    positions[write++] = start.y;
    positions[write++] = start.z;
    positions[write++] = end.x;
    positions[write++] = end.y;
    positions[write++] = end.z;
  }
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return lineGeometry;
}
