import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshDocumentFromPolygonList } from './mesh_from_polygon_list.js';
import {
  meshTopologyFaceVertexIndices,
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
  meshTopologyHalfEdgeDestinationVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import type { MeshTopology } from '@/mesh/topology/mesh_topology.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import { readMeshDocumentFaceTextureId, writeMeshDocumentFaceTextureId } from './mesh_document_face_texture_sync.js';

/**
 * Minimum n·seed for two face normals to count as matching. Kept near 1 so
 * curved tessellations (UV spheres) do not flood-merge neighboring triangles.
 */
const COPLANAR_NORMAL_DOT = 0.999999;

/**
 * Max plane-distance error (world units) for coplanarity. Absolute so flat
 * authored boxes still merge while curved mesh sagitta rejects neighbors.
 */
const COPLANAR_PLANE_TOLERANCE = 1e-6;

/**
 * Merges edge-connected coplanar faces that share a texture into n-gon loops.
 *
 * @param document Source mesh document whose faces may be merged.
 * @returns A new document with coplanar regions merged, or the same document
 *   when the merge would not change face topology.
 */
export function mergeCoplanarMeshDocumentFaces(document: MeshDocument): MeshDocument {
  const topology = document.getTopology();
  const faceCount = topology.getFaceCount();
  if (faceCount === 0) {
    return document;
  }
  const positions = topology.getPositions();
  const regions = collectCoplanarFaceRegions(document, positions);
  const mergedFaces = buildMergedPolygonFaces(topology, regions);
  const polygonFaces = mergedFaces.map((entry) => entry.vertices);
  if (!didMergeChangeFaceTopology(topology, polygonFaces)) {
    return document;
  }
  const cornerUvs = buildMergedCornerUvs(document, mergedFaces);
  const merged = meshDocumentFromPolygonList(new Float32Array(positions), polygonFaces, cornerUvs);
  copyMergedFaceTextures(document, merged, mergedFaces);
  return merged;
}

/** One merged (or retained) polygon with the source faces it came from. */
interface MergedPolygonFace {
  vertices: number[];
  sourceFaces: number[];
}

/**
 * Builds face-order corner UVs for merged polygons by sampling original
 * half-edge UVs for each boundary vertex from its coplanar region.
 *
 * @param document Source triangle document with corner UVs.
 * @param mergedFaces Merged polygons with source face sets.
 * @returns Interleaved corner u,v, or undefined when no UVs exist.
 */
function buildMergedCornerUvs(
  document: MeshDocument,
  mergedFaces: readonly MergedPolygonFace[],
): Float32Array | undefined {
  const sourceUvs = document.getAttributes().getCornerUvs().getValues();
  if (sourceUvs.length === 0) {
    return undefined;
  }
  const topology = document.getTopology();
  const values: number[] = [];
  for (const face of mergedFaces) {
    const regionSet = new Set(face.sourceFaces);
    for (const vertexIndex of face.vertices) {
      const uv = sampleVertexCornerUv(topology, sourceUvs, regionSet, vertexIndex);
      values.push(uv.u, uv.v);
    }
  }
  return values.length > 0 ? new Float32Array(values) : undefined;
}

/**
 * Samples a corner UV for a vertex from any original half-edge in the region.
 *
 * @param topology Source topology.
 * @param sourceUvs Original interleaved corner UVs.
 * @param regionSet Faces that contributed to the merged polygon.
 * @param vertexIndex Boundary vertex index.
 * @returns Sampled UV pair.
 */
function sampleVertexCornerUv(
  topology: MeshTopology,
  sourceUvs: Float32Array,
  regionSet: ReadonlySet<number>,
  vertexIndex: number,
): { u: number; v: number } {
  for (const faceIndex of regionSet) {
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
      if (meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex) !== vertexIndex) {
        continue;
      }
      const base = halfEdgeIndex * 2;
      return { u: sourceUvs[base] ?? 0, v: sourceUvs[base + 1] ?? 0 };
    }
  }
  return { u: 0, v: 0 };
}

/**
 * Collects edge-connected coplanar face regions that share the same texture.
 *
 * @param document Mesh document.
 * @param positions Packed vertex positions.
 * @returns Regions as face-index arrays.
 */
function collectCoplanarFaceRegions(document: MeshDocument, positions: Float32Array): number[][] {
  const topology = document.getTopology();
  const faceCount = topology.getFaceCount();
  const adjacency = buildFaceAdjacencyBySharedEdge(topology);
  const visited = new Set<number>();
  const regions: number[][] = [];
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    if (visited.has(faceIndex)) {
      continue;
    }
    regions.push(floodCoplanarRegion(document, positions, adjacency, faceIndex, visited));
  }
  return regions;
}

/**
 * Flood-fills one coplanar, same-texture connected region from a seed face.
 *
 * @param document Mesh document.
 * @param positions Packed positions.
 * @param adjacency Face adjacency.
 * @param seedFaceIndex Seed face.
 * @param visited Shared visited set.
 * @returns Face indices in the region.
 */
function floodCoplanarRegion(
  document: MeshDocument,
  positions: Float32Array,
  adjacency: Map<number, number[]>,
  seedFaceIndex: number,
  visited: Set<number>,
): number[] {
  const topology = document.getTopology();
  const region: number[] = [];
  const queue = [seedFaceIndex];
  visited.add(seedFaceIndex);
  const seed = buildCoplanarFloodSeed(document, topology, positions, seedFaceIndex);
  while (queue.length > 0) {
    const current = queue.shift()!;
    region.push(current);
    enqueueCoplanarNeighbors(document, topology, positions, adjacency, current, seed, visited, queue);
  }
  return region;
}

/** Seed plane and texture used while flooding a coplanar region. */
interface CoplanarFloodSeed {
  normal: THREE.Vector3;
  planeConstant: number;
  textureId: string;
}

/**
 * Builds the coplanar flood seed for a face.
 *
 * @param document Mesh document.
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param seedFaceIndex Seed face.
 * @returns Seed plane and texture.
 */
function buildCoplanarFloodSeed(
  document: MeshDocument,
  topology: MeshTopology,
  positions: Float32Array,
  seedFaceIndex: number,
): CoplanarFloodSeed {
  const normal = computeFaceUnitNormal(topology, positions, seedFaceIndex);
  const point = readFirstFaceVertex(topology, positions, seedFaceIndex);
  return {
    normal,
    planeConstant: normal.dot(point),
    textureId: readMeshDocumentFaceTextureId(document, seedFaceIndex),
  };
}

/**
 * Enqueues coplanar same-texture neighbors of the current face.
 *
 * @param document Mesh document.
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param adjacency Face adjacency.
 * @param current Current face.
 * @param seed Flood seed.
 * @param visited Visited faces.
 * @param queue BFS queue.
 */
function enqueueCoplanarNeighbors(
  document: MeshDocument,
  topology: MeshTopology,
  positions: Float32Array,
  adjacency: Map<number, number[]>,
  current: number,
  seed: CoplanarFloodSeed,
  visited: Set<number>,
  queue: number[],
): void {
  const neighbors = adjacency.get(current);
  if (!neighbors) {
    return;
  }
  for (const neighbor of neighbors) {
    if (!canEnqueueCoplanarNeighbor(document, topology, positions, neighbor, seed, visited)) {
      continue;
    }
    visited.add(neighbor);
    queue.push(neighbor);
  }
}

/**
 * Returns whether a neighbor may join the coplanar flood region.
 *
 * @param document Mesh document.
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param neighbor Neighbor face.
 * @param seed Flood seed.
 * @param visited Visited faces.
 * @returns True when the neighbor matches seed texture and plane.
 */
function canEnqueueCoplanarNeighbor(
  document: MeshDocument,
  topology: MeshTopology,
  positions: Float32Array,
  neighbor: number,
  seed: CoplanarFloodSeed,
  visited: Set<number>,
): boolean {
  if (visited.has(neighbor)) {
    return false;
  }
  if (readMeshDocumentFaceTextureId(document, neighbor) !== seed.textureId) {
    return false;
  }
  return isFaceCoplanarWithSeed(topology, positions, neighbor, seed.normal, seed.planeConstant);
}

/**
 * Copies authored texture ids from source faces onto the merged document faces.
 *
 * @param source Source document before merge.
 * @param merged Merged document.
 * @param mergedFaces Merged polygon descriptors.
 */
function copyMergedFaceTextures(
  source: MeshDocument,
  merged: MeshDocument,
  mergedFaces: readonly MergedPolygonFace[],
): void {
  const sourceSurfaces = source.getAttributes().getFaceSurfaces();
  for (let faceIndex = 0; faceIndex < mergedFaces.length; faceIndex++) {
    const sourceFace = mergedFaces[faceIndex]!.sourceFaces[0] ?? 0;
    if (!sourceSurfaces.get(sourceFace)) {
      continue;
    }
    writeMeshDocumentFaceTextureId(merged, faceIndex, readMeshDocumentFaceTextureId(source, sourceFace));
  }
}

/**
 * Builds undirected face adjacency from shared topology edges.
 *
 * @param topology Mesh topology.
 * @returns Face index → neighbor face indices.
 */
function buildFaceAdjacencyBySharedEdge(topology: MeshTopology): Map<number, number[]> {
  const edgeToFaces = new Map<string, number[]>();
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
      const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
      const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
      const edgeKey = buildComponentEdgeKey(a, b);
      const list = edgeToFaces.get(edgeKey);
      if (list) {
        list.push(faceIndex);
      } else {
        edgeToFaces.set(edgeKey, [faceIndex]);
      }
    }
  }
  const adjacency = new Map<number, number[]>();
  for (const faces of edgeToFaces.values()) {
    if (faces.length !== 2) {
      continue;
    }
    const a = faces[0]!;
    const b = faces[1]!;
    if (a === b) {
      continue;
    }
    appendUniqueNeighbor(adjacency, a, b);
    appendUniqueNeighbor(adjacency, b, a);
  }
  return adjacency;
}

/**
 * Appends a neighbor face if not already listed.
 *
 * @param adjacency Adjacency map.
 * @param faceIndex Source face.
 * @param neighbor Neighbor face.
 */
function appendUniqueNeighbor(adjacency: Map<number, number[]>, faceIndex: number, neighbor: number): void {
  const list = adjacency.get(faceIndex);
  if (!list) {
    adjacency.set(faceIndex, [neighbor]);
    return;
  }
  if (!list.includes(neighbor)) {
    list.push(neighbor);
  }
}

/**
 * Returns whether a face is coplanar with a seed plane and normal.
 *
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param faceIndex Candidate face.
 * @param seedNormal Seed unit normal.
 * @param seedPlaneConstant Seed plane constant.
 * @returns True when coplanar and same orientation.
 */
function isFaceCoplanarWithSeed(
  topology: MeshTopology,
  positions: Float32Array,
  faceIndex: number,
  seedNormal: THREE.Vector3,
  seedPlaneConstant: number,
): boolean {
  const normal = computeFaceUnitNormal(topology, positions, faceIndex);
  if (normal.dot(seedNormal) < COPLANAR_NORMAL_DOT) {
    return false;
  }
  return areAllFaceVerticesOnSeedPlane(topology, positions, faceIndex, seedNormal, seedPlaneConstant);
}

/**
 * Returns whether every corner of a face lies on the seed plane.
 *
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param faceIndex Candidate face.
 * @param seedNormal Seed unit normal.
 * @param seedPlaneConstant Seed plane constant.
 * @returns True when every vertex is within plane tolerance.
 */
function areAllFaceVerticesOnSeedPlane(
  topology: MeshTopology,
  positions: Float32Array,
  faceIndex: number,
  seedNormal: THREE.Vector3,
  seedPlaneConstant: number,
): boolean {
  for (const vertexIndex of meshTopologyFaceVertexIndices(topology, faceIndex)) {
    const point = readVertex(positions, vertexIndex);
    if (Math.abs(seedNormal.dot(point) - seedPlaneConstant) > COPLANAR_PLANE_TOLERANCE) {
      return false;
    }
  }
  return true;
}

/**
 * Computes a unit face normal from the first three corners.
 *
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param faceIndex Face index.
 * @returns Unit normal (defaults to +Y when degenerate).
 */
function computeFaceUnitNormal(topology: MeshTopology, positions: Float32Array, faceIndex: number): THREE.Vector3 {
  const vertices = meshTopologyFaceVertexIndices(topology, faceIndex);
  if (vertices.length < 3) {
    return new THREE.Vector3(0, 1, 0);
  }
  const a = readVertex(positions, vertices[0]!);
  const b = readVertex(positions, vertices[1]!);
  const c = readVertex(positions, vertices[2]!);
  const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (normal.lengthSq() < 1e-20) {
    return new THREE.Vector3(0, 1, 0);
  }
  return normal.normalize();
}

/**
 * Reads the first corner of a face into a vector.
 *
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param faceIndex Face index.
 * @returns World-local vertex position.
 */
function readFirstFaceVertex(topology: MeshTopology, positions: Float32Array, faceIndex: number): THREE.Vector3 {
  const vertices = meshTopologyFaceVertexIndices(topology, faceIndex);
  return readVertex(positions, vertices[0] ?? 0);
}

/**
 * Reads one packed vertex.
 *
 * @param positions Packed positions.
 * @param vertexIndex Vertex index.
 * @returns Vector3.
 */
function readVertex(positions: Float32Array, vertexIndex: number): THREE.Vector3 {
  const base = vertexIndex * 3;
  return new THREE.Vector3(positions[base] ?? 0, positions[base + 1] ?? 0, positions[base + 2] ?? 0);
}

/**
 * Builds outer polygon loops for each coplanar region.
 *
 * @param topology Mesh topology.
 * @param regions Face regions.
 * @returns Merged polygons with source face indices.
 */
function buildMergedPolygonFaces(topology: MeshTopology, regions: readonly number[][]): MergedPolygonFace[] {
  const polygons: MergedPolygonFace[] = [];
  for (const region of regions) {
    if (region.length === 1) {
      const faceIndex = region[0]!;
      polygons.push({
        vertices: meshTopologyFaceVertexIndices(topology, faceIndex),
        sourceFaces: [faceIndex],
      });
      continue;
    }
    const loop = extractOuterBoundaryLoop(topology, region);
    if (loop && loop.length >= 3) {
      polygons.push({ vertices: loop, sourceFaces: region.slice() });
      continue;
    }
    for (const faceIndex of region) {
      polygons.push({
        vertices: meshTopologyFaceVertexIndices(topology, faceIndex),
        sourceFaces: [faceIndex],
      });
    }
  }
  return polygons;
}

/**
 * Extracts the outer boundary vertex loop of a coplanar face region.
 *
 * @param topology Mesh topology.
 * @param region Face indices in the region.
 * @returns Ordered vertex loop, or null when no closed boundary is found.
 */
function extractOuterBoundaryLoop(topology: MeshTopology, region: readonly number[]): number[] | null {
  const regionSet = new Set(region);
  const boundaryDirected = collectBoundaryDirectedEdges(topology, regionSet);
  if (boundaryDirected.length === 0) {
    return null;
  }
  return walkBoundaryLoop(boundaryDirected);
}

/**
 * Collects directed boundary edges that appear on exactly one region face.
 *
 * @param topology Mesh topology.
 * @param regionSet Region face set.
 * @returns Directed edges as [from, to] pairs.
 */
function collectBoundaryDirectedEdges(topology: MeshTopology, regionSet: ReadonlySet<number>): Array<[number, number]> {
  const undirectedUse = new Map<string, number>();
  const directed: Array<[number, number]> = [];
  for (const faceIndex of regionSet) {
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
      const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
      const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
      const key = buildComponentEdgeKey(a, b);
      undirectedUse.set(key, (undirectedUse.get(key) ?? 0) + 1);
      directed.push([a, b]);
    }
  }
  return directed.filter(([a, b]) => (undirectedUse.get(buildComponentEdgeKey(a, b)) ?? 0) === 1);
}

/**
 * Walks directed boundary edges into a single closed loop.
 *
 * @param boundaryDirected Directed boundary edges.
 * @returns Ordered vertex indices, or null when incomplete.
 */
function walkBoundaryLoop(boundaryDirected: ReadonlyArray<[number, number]>): number[] | null {
  const outgoing = new Map<number, number[]>();
  for (const [from, to] of boundaryDirected) {
    const list = outgoing.get(from);
    if (list) {
      list.push(to);
    } else {
      outgoing.set(from, [to]);
    }
  }
  const start = boundaryDirected[0]![0];
  const loop: number[] = [start];
  let current = start;
  const safety = boundaryDirected.length + 2;
  for (let step = 0; step < safety; step++) {
    const options = outgoing.get(current);
    if (!options || options.length === 0) {
      return null;
    }
    const next = options.shift()!;
    if (next === start) {
      return loop.length >= 3 ? loop : null;
    }
    loop.push(next);
    current = next;
  }
  return null;
}

/**
 * Returns whether the merged face list differs in face count or per-face corner
 * count from the original topology.
 *
 * @param topology Original topology.
 * @param polygonFaces Merged polygon vertex loops.
 * @returns True when face count differs or any face has a different vertex
 *   count.
 */
function didMergeChangeFaceTopology(topology: MeshTopology, polygonFaces: readonly number[][]): boolean {
  if (polygonFaces.length !== topology.getFaceCount()) {
    return true;
  }
  for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
    const original = meshTopologyFaceVertexIndices(topology, faceIndex);
    const merged = polygonFaces[faceIndex]!;
    if (original.length !== merged.length) {
      return true;
    }
  }
  return false;
}
