import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MESH_DOCUMENT_USERDATA_KEY } from '@/mesh/document/mesh_document_binding.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { createDefaultFaceTextureMapping, type FaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { fitSurfaceUvMatrixFromWorldSamples } from '@/texture/uv_matrix/surface_uv_matrix_fit.js';
import { getFaceTextureMapsLive, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { readContentMeshTextureId, readUniformTextureIdFromFaceMaps } from '@/texture/uv/content_mesh_texture.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { meshDocumentFaceIndexFromDisplayTriangle } from './mesh_document_face_triangle_map.js';

/** Position match epsilon when mapping display triangles onto document faces. */
const FACE_VERTEX_MATCH_EPSILON = 1e-4;

/** Session edit document userData key (local to avoid an edit-layer import). */
const MESH_EDIT_DOCUMENT_USERDATA_KEY = 'meshEditDocument';

/**
 * Copies per-triangle display textures onto document face surfaces so edit
 * rebuilds can restore multi-material groups after geometry replacement.
 * Display faceTextureMaps are authoritative whenever present: prior document
 * surfaces may be stale after texture assign outside edit mode.
 *
 * @param mesh Display mesh with optional faceTextureMaps.
 * @param document Editable mesh document.
 */
export function captureMeshDocumentFaceTexturesFromDisplay(mesh: THREE.Mesh, document: MeshDocument): void {
  const uniformTextureId = resolveUniformDisplayTextureId(mesh);
  if (uniformTextureId !== null) {
    assignUniformTextureToAllDocumentFaces(document, uniformTextureId);
    return;
  }
  if (getFaceTextureMapsLive(mesh).length === 0) {
    return;
  }
  const triangleCount = countGeometryTriangles(mesh.geometry);
  if (triangleCount === 0) {
    return;
  }
  const textureByTriangle = buildPerTriangleTextureIds(mesh, triangleCount);
  const multiMaterialDisplay = Array.isArray(mesh.material);
  if (!multiMaterialDisplay && assignTexturesByDocumentTriangleOrder(document, textureByTriangle)) {
    return;
  }
  assignTexturesByVertexPositionMatch(mesh, document, textureByTriangle);
}

/**
 * Resolves a single texture id for free-mesh (or otherwise uniform) display.
 *
 * @param mesh Display mesh.
 * @returns Texture id when the whole mesh uses one texture, else null.
 */
function resolveUniformDisplayTextureId(mesh: THREE.Mesh): string | null {
  const maps = getFaceTextureMapsLive(mesh);
  if (maps.length === 1 && (maps[0]?.triangleIndices.length ?? 0) === 0) {
    return maps[0]?.mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID;
  }
  const fromMaps = readUniformTextureIdFromFaceMaps(mesh);
  if (fromMaps) {
    return fromMaps;
  }
  if (typeof mesh.userData['contentMeshTextureId'] === 'string') {
    return readContentMeshTextureId(mesh);
  }
  return null;
}

/**
 * Writes one texture id onto every document face without scanning triangles.
 *
 * @param document Mesh document.
 * @param textureId Texture identity.
 */
function assignUniformTextureToAllDocumentFaces(document: MeshDocument, textureId: string): void {
  const faceCount = document.getTopology().getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    writeMeshDocumentFaceTextureId(document, faceIndex, textureId);
  }
}

/**
 * Captures display faceTextureMaps onto every MeshDocument bound on the mesh
 * (session edit document and/or persistent document).
 *
 * @param mesh Content mesh that may carry document userData.
 */
export function syncMeshDocumentTexturesFromDisplayMesh(mesh: THREE.Mesh): void {
  forEachBoundMeshDocument(mesh, (document) => {
    captureMeshDocumentFaceTexturesFromDisplay(mesh, document);
  });
}

/**
 * Copies display corner UVs onto every MeshDocument bound on the mesh when the
 * GPU vertex order still matches document half-edges.
 *
 * @param mesh Content mesh that may carry document userData.
 */
export function syncMeshDocumentCornerUvsFromDisplayMesh(mesh: THREE.Mesh): void {
  forEachBoundMeshDocument(mesh, (document) => {
    captureMeshDocumentCornerUvsFromDisplay(mesh, document);
  });
}

/**
 * Visits each distinct MeshDocument stored on a content mesh.
 *
 * @param mesh Content mesh.
 * @param visit Callback for one document.
 */
function forEachBoundMeshDocument(mesh: THREE.Mesh, visit: (document: MeshDocument) => void): void {
  const seen = new Set<MeshDocument>();
  for (const key of [MESH_EDIT_DOCUMENT_USERDATA_KEY, MESH_DOCUMENT_USERDATA_KEY]) {
    const value = mesh.userData[key];
    if (!(value instanceof MeshDocument) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    visit(value);
  }
}

/**
 * Copies display geometry UV attributes onto document corner UVs when the GPU
 * mesh still uses one expanded vertex per half-edge in document face order.
 *
 * @param mesh Display mesh.
 * @param document Editable mesh document.
 * @returns True when every corner UV was captured.
 */
export function captureMeshDocumentCornerUvsFromDisplay(mesh: THREE.Mesh, document: MeshDocument): boolean {
  const geometry = mesh.geometry;
  const uvAttribute = geometry.getAttribute('uv');
  const positionAttribute = geometry.getAttribute('position');
  if (!uvAttribute || !positionAttribute) {
    return false;
  }
  if (positionAttribute.count !== document.getTopology().getHalfEdgeCount()) {
    return false;
  }
  return captureCornerUvsByExpansionOrder(document, uvAttribute, positionAttribute);
}

/**
 * Rebuilds faceTextureMaps from document face surfaces using document-order
 * display triangulation (same expansion as meshDocumentToBufferGeometry).
 *
 * @param mesh Display mesh receiving maps.
 * @param document Source mesh document.
 */
export function writeFaceTextureMapsFromMeshDocument(mesh: THREE.Mesh, document: MeshDocument): void {
  mesh.updateMatrixWorld(true);
  const entries = buildPerFaceTextureMapEntries(mesh, document);
  setFaceTextureMaps(mesh, entries);
}

/**
 * Returns the texture id stored on a document face surface, or the default.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @returns Texture identity string.
 */
export function readMeshDocumentFaceTextureId(document: MeshDocument, faceIndex: number): string {
  const surface = document.getAttributes().getFaceSurfaces().get(faceIndex);
  if (!surface || !surface.textureId) {
    return DEFAULT_CHECKER_TEXTURE_ID;
  }
  return surface.textureId;
}

/**
 * Writes a texture id onto a document face surface, preserving UV matrix when
 * present.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @param textureId Texture identity.
 */
export function writeMeshDocumentFaceTextureId(document: MeshDocument, faceIndex: number, textureId: string): void {
  const surfaces = document.getAttributes().getFaceSurfaces();
  const existing = surfaces.get(faceIndex);
  surfaces.set(faceIndex, {
    textureId: textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: existing?.uv.clone() ?? SurfaceUvMatrix.identity(),
  });
}

/**
 * Assigns textures assuming display triangle order matches document expansion.
 *
 * @param document Mesh document.
 * @param textureByTriangle Texture id per display triangle.
 * @returns True when every face received a texture this way.
 */
function assignTexturesByDocumentTriangleOrder(document: MeshDocument, textureByTriangle: readonly string[]): boolean {
  const faceCount = document.getTopology().getFaceCount();
  let displayTriangle = 0;
  let assignedAny = false;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const triangleCount = Math.max(0, meshTopologyFaceHalfEdgeIndices(document.getTopology(), faceIndex).length - 2);
    if (triangleCount === 0) {
      continue;
    }
    if (displayTriangle + triangleCount > textureByTriangle.length) {
      return false;
    }
    const textureId = textureByTriangle[displayTriangle] ?? DEFAULT_CHECKER_TEXTURE_ID;
    writeMeshDocumentFaceTextureId(document, faceIndex, textureId);
    assignedAny = true;
    displayTriangle += triangleCount;
  }
  return assignedAny && displayTriangle === textureByTriangle.length;
}

/**
 * Assigns textures by matching display triangle corners to document faces.
 *
 * @param mesh Display mesh.
 * @param document Mesh document.
 * @param textureByTriangle Texture id per display triangle.
 */
function assignTexturesByVertexPositionMatch(
  mesh: THREE.Mesh,
  document: MeshDocument,
  textureByTriangle: readonly string[],
): void {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  if (!position) {
    return;
  }
  const votes = collectFaceTextureVotes(geometry, position, document, textureByTriangle);
  applyFaceTextureVotes(document, votes);
}

/**
 * Collects face texture votes from display triangles.
 *
 * @param geometry Display geometry.
 * @param position Position attribute.
 * @param document Mesh document.
 * @param textureByTriangle Texture id per display triangle.
 * @returns Face → texture → count votes.
 */
function collectFaceTextureVotes(
  geometry: THREE.BufferGeometry,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  document: MeshDocument,
  textureByTriangle: readonly string[],
): Map<number, Map<string, number>> {
  const votes = new Map<number, Map<string, number>>();
  for (let triangleIndex = 0; triangleIndex < textureByTriangle.length; triangleIndex++) {
    voteOneTriangleTexture(geometry, position, document, textureByTriangle, triangleIndex, votes);
  }
  return votes;
}

/**
 * Votes one display triangle's texture onto a matching document face.
 *
 * @param geometry Display geometry.
 * @param position Position attribute.
 * @param document Mesh document.
 * @param textureByTriangle Texture id per display triangle.
 * @param triangleIndex Display triangle index.
 * @param votes Accumulator.
 */
function voteOneTriangleTexture(
  geometry: THREE.BufferGeometry,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  document: MeshDocument,
  textureByTriangle: readonly string[],
  triangleIndex: number,
  votes: Map<number, Map<string, number>>,
): void {
  const corners = readTriangleCornerPositions(geometry, position, triangleIndex);
  if (!corners) {
    return;
  }
  const faceIndex =
    findDocumentFaceForTriangleCorners(document, corners) ??
    meshDocumentFaceIndexFromDisplayTriangle(document, triangleIndex);
  if (faceIndex === null) {
    return;
  }
  tallyFaceTextureVote(votes, faceIndex, textureByTriangle[triangleIndex]!);
}

/**
 * Writes majority texture votes onto document face surfaces.
 *
 * @param document Mesh document.
 * @param votes Face → texture → count.
 */
function applyFaceTextureVotes(document: MeshDocument, votes: Map<number, Map<string, number>>): void {
  for (const [faceIndex, textureVotes] of votes) {
    writeMeshDocumentFaceTextureId(document, faceIndex, pickMajorityTexture(textureVotes));
  }
}

/**
 * Tallies one texture vote for a face.
 *
 * @param votes Face → texture → count.
 * @param faceIndex Face index.
 * @param textureId Texture identity.
 */
function tallyFaceTextureVote(votes: Map<number, Map<string, number>>, faceIndex: number, textureId: string): void {
  const id = textureId || DEFAULT_CHECKER_TEXTURE_ID;
  let faceVotes = votes.get(faceIndex);
  if (!faceVotes) {
    faceVotes = new Map();
    votes.set(faceIndex, faceVotes);
  }
  faceVotes.set(id, (faceVotes.get(id) ?? 0) + 1);
}

/**
 * Picks the texture with the highest vote count.
 *
 * @param textureVotes Texture → count.
 * @returns Winning texture id.
 */
function pickMajorityTexture(textureVotes: Map<string, number>): string {
  let bestId = DEFAULT_CHECKER_TEXTURE_ID;
  let bestCount = -1;
  for (const [textureId, count] of textureVotes) {
    if (count > bestCount) {
      bestCount = count;
      bestId = textureId;
    }
  }
  return bestId;
}

/**
 * Finds a document face whose vertex positions cover all triangle corners.
 *
 * @param document Mesh document.
 * @param corners Triangle corner positions.
 * @returns Face index or null.
 */
function findDocumentFaceForTriangleCorners(document: MeshDocument, corners: readonly THREE.Vector3[]): number | null {
  const topology = document.getTopology();
  const positions = topology.getPositions();
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    if (documentFaceContainsCorners(topology, positions, faceIndex, corners)) {
      return faceIndex;
    }
  }
  return null;
}

/**
 * Returns whether every triangle corner matches a vertex on the face.
 *
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param faceIndex Face index.
 * @param corners Triangle corners.
 * @returns True when all corners match face vertices.
 */
function documentFaceContainsCorners(
  topology: import('@/mesh/topology/mesh_topology.js').MeshTopology,
  positions: Float32Array,
  faceIndex: number,
  corners: readonly THREE.Vector3[],
): boolean {
  const facePoints: THREE.Vector3[] = [];
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
    const base = vertexIndex * 3;
    facePoints.push(new THREE.Vector3(positions[base] ?? 0, positions[base + 1] ?? 0, positions[base + 2] ?? 0));
  }
  for (const corner of corners) {
    if (!facePoints.some((point) => point.distanceToSquared(corner) <= FACE_VERTEX_MATCH_EPSILON ** 2)) {
      return false;
    }
  }
  return true;
}

/**
 * Reads three corner positions for a display triangle.
 *
 * @param geometry Buffer geometry.
 * @param position Position attribute.
 * @param triangleIndex Triangle index.
 * @returns Corner positions or null.
 */
function readTriangleCornerPositions(
  geometry: THREE.BufferGeometry,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  triangleIndex: number,
): THREE.Vector3[] | null {
  const index = geometry.getIndex();
  const corners: THREE.Vector3[] = [];
  for (let corner = 0; corner < 3; corner++) {
    const vertexIndex = index ? index.getX(triangleIndex * 3 + corner) : triangleIndex * 3 + corner;
    if (vertexIndex < 0 || vertexIndex >= position.count) {
      return null;
    }
    corners.push(new THREE.Vector3(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex)));
  }
  return corners;
}

/** One face-texture map entry and the next free display triangle index. */
interface FaceTextureMapBuildStep {
  entry: { triangleIndices: number[]; mapping: FaceTextureMapping };
  nextTriangle: number;
}

/**
 * Builds one faceTextureMaps entry per document face in expansion order.
 *
 * @param mesh Display mesh supplying the world matrix.
 * @param document Mesh document.
 * @returns Face texture map entries.
 */
function buildPerFaceTextureMapEntries(
  mesh: THREE.Mesh,
  document: MeshDocument,
): Array<{ triangleIndices: number[]; mapping: FaceTextureMapping }> {
  const inverseWorld = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const entries: Array<{ triangleIndices: number[]; mapping: FaceTextureMapping }> = [];
  let displayTriangle = 0;
  const faceCount = document.getTopology().getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const step = buildOneFaceTextureMapEntry(mesh, document, faceIndex, displayTriangle, inverseWorld);
    if (!step) {
      continue;
    }
    entries.push(step.entry);
    displayTriangle = step.nextTriangle;
  }
  return entries;
}

/**
 * Builds the map entry for one document face.
 *
 * @param mesh Display mesh.
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @param displayTriangle First display triangle index for the face.
 * @param inverseWorld Inverse of the mesh world matrix.
 * @returns Entry and the following triangle index, or null when the face has no
 *   triangles.
 */
function buildOneFaceTextureMapEntry(
  mesh: THREE.Mesh,
  document: MeshDocument,
  faceIndex: number,
  displayTriangle: number,
  inverseWorld: THREE.Matrix4,
): FaceTextureMapBuildStep | null {
  const triangleCount = documentFaceTriangleCount(document, faceIndex);
  if (triangleCount === 0) {
    return null;
  }
  return {
    entry: {
      triangleIndices: displayTriangleRange(displayTriangle, triangleCount),
      mapping: resolveDocumentFaceMapping(mesh, document, faceIndex, inverseWorld),
    },
    nextTriangle: displayTriangle + triangleCount,
  };
}

/**
 * Counts display triangles for one document face.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @returns Triangle count.
 */
function documentFaceTriangleCount(document: MeshDocument, faceIndex: number): number {
  const cornerCount = meshTopologyFaceHalfEdgeIndices(document.getTopology(), faceIndex).length;
  return Math.max(0, cornerCount - 2);
}

/**
 * Builds a contiguous display triangle index list.
 *
 * @param start First triangle index.
 * @param triangleCount Number of triangles.
 * @returns Triangle indices.
 */
function displayTriangleRange(start: number, triangleCount: number): number[] {
  const indices: number[] = [];
  for (let offset = 0; offset < triangleCount; offset++) {
    indices.push(start + offset);
  }
  return indices;
}

/**
 * Resolves a world-space UV mapping that reproduces one face's corner UVs.
 *
 * @param mesh Display mesh.
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @param inverseWorld Inverse of the mesh world matrix.
 * @returns Face mapping.
 */
function resolveDocumentFaceMapping(
  mesh: THREE.Mesh,
  document: MeshDocument,
  faceIndex: number,
  inverseWorld: THREE.Matrix4,
): FaceTextureMapping {
  const textureId = readMeshDocumentFaceTextureId(document, faceIndex);
  const fromSurface = mappingFromMatchingSurface(document, faceIndex, textureId, inverseWorld);
  if (fromSurface) {
    return fromSurface;
  }
  return mappingFromCornerUvFit(mesh, document, faceIndex, textureId);
}

/**
 * Returns a world mapping when the stored local surface matches corner UVs.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @param textureId Texture identity.
 * @param inverseWorld Inverse of the mesh world matrix.
 * @returns Mapping, or null when the surface is missing or stale.
 */
function mappingFromMatchingSurface(
  document: MeshDocument,
  faceIndex: number,
  textureId: string,
  inverseWorld: THREE.Matrix4,
): FaceTextureMapping | null {
  const surface = document.getAttributes().getFaceSurfaces().get(faceIndex);
  if (!surface || !surfaceMatchesCornerUvs(document, faceIndex, surface.uv)) {
    return null;
  }
  return {
    textureId,
    uv: surface.uv.multiplyMatrix4(inverseWorld),
    align: 'face',
  };
}

/**
 * Fits a world UV matrix to one face's corner UVs.
 *
 * @param mesh Display mesh.
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @param textureId Texture identity.
 * @returns Fitted mapping, or a default mapping when the fit is degenerate.
 */
function mappingFromCornerUvFit(
  mesh: THREE.Mesh,
  document: MeshDocument,
  faceIndex: number,
  textureId: string,
): FaceTextureMapping {
  const fitted = fitSurfaceUvMatrixFromWorldSamples(collectFaceWorldUvSamples(mesh, document, faceIndex));
  if (!fitted) {
    return createDefaultFaceTextureMapping(textureId);
  }
  return { textureId, uv: fitted, align: 'face' };
}

/**
 * Returns whether a local surface matrix reproduces the face corner UVs.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @param uv Local surface matrix.
 * @returns True when every corner matches.
 */
function surfaceMatchesCornerUvs(
  document: MeshDocument,
  faceIndex: number,
  uv: import('@/texture/uv_matrix/surface_uv_matrix.js').SurfaceUvMatrix,
): boolean {
  const topology = document.getTopology();
  const positions = topology.getPositions();
  const store = document.getAttributes().getCornerUvs();
  const scratch = { 0: 0, 1: 0, length: 2 } as { 0: number; 1: number; length: number };
  const point = new THREE.Vector3();
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    if (!cornerMatchesSurfaceUv(topology, positions, store, halfEdgeIndex, uv, point, scratch)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns whether one corner UV matches a local surface projection.
 *
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param store Corner UV store.
 * @param halfEdgeIndex Half-edge index.
 * @param uv Local surface matrix.
 * @param point Scratch position.
 * @param scratch UV read buffer.
 * @returns True when the projected UV matches the stored corner.
 */
function cornerMatchesSurfaceUv(
  topology: import('@/mesh/topology/mesh_topology.js').MeshTopology,
  positions: Float32Array,
  store: import('@/mesh/attribute/mesh_face_corner_uv.js').MeshFaceCornerUvStore,
  halfEdgeIndex: number,
  uv: import('@/texture/uv_matrix/surface_uv_matrix.js').SurfaceUvMatrix,
  point: THREE.Vector3,
  scratch: { 0: number; 1: number; length: number },
): boolean {
  const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
  const base = vertexIndex * 3;
  point.set(positions[base] ?? 0, positions[base + 1] ?? 0, positions[base + 2] ?? 0);
  store.read(halfEdgeIndex, scratch);
  const projected = uv.project(point);
  if (Math.abs(projected.u - scratch[0]) > 1e-3) {
    return false;
  }
  return Math.abs(projected.v - scratch[1]) <= 1e-3;
}

/**
 * Collects world position and corner UV samples for one document face.
 *
 * @param mesh Display mesh.
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @returns Samples for a planar fit.
 */
function collectFaceWorldUvSamples(
  mesh: THREE.Mesh,
  document: MeshDocument,
  faceIndex: number,
): Array<{ world: THREE.Vector3; u: number; v: number }> {
  const samples: Array<{ world: THREE.Vector3; u: number; v: number }> = [];
  const topology = document.getTopology();
  const positions = topology.getPositions();
  const store = document.getAttributes().getCornerUvs();
  const scratch = { 0: 0, 1: 0, length: 2 } as { 0: number; 1: number; length: number };
  for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
    samples.push(readFaceCornerWorldSample(mesh, topology, positions, store, halfEdgeIndex, scratch));
  }
  return samples;
}

/**
 * Reads one face corner as a world UV sample.
 *
 * @param mesh Display mesh.
 * @param topology Mesh topology.
 * @param positions Packed positions.
 * @param store Corner UV store.
 * @param halfEdgeIndex Half-edge index.
 * @param scratch UV read buffer.
 * @returns World sample.
 */
function readFaceCornerWorldSample(
  mesh: THREE.Mesh,
  topology: import('@/mesh/topology/mesh_topology.js').MeshTopology,
  positions: Float32Array,
  store: import('@/mesh/attribute/mesh_face_corner_uv.js').MeshFaceCornerUvStore,
  halfEdgeIndex: number,
  scratch: { 0: number; 1: number; length: number },
): { world: THREE.Vector3; u: number; v: number } {
  const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
  const base = vertexIndex * 3;
  const world = new THREE.Vector3(positions[base] ?? 0, positions[base + 1] ?? 0, positions[base + 2] ?? 0);
  world.applyMatrix4(mesh.matrixWorld);
  store.read(halfEdgeIndex, scratch);
  return { world, u: scratch[0], v: scratch[1] };
}

/**
 * Builds per-triangle texture ids from mesh face maps.
 *
 * @param mesh Content mesh.
 * @param triangleCount Triangle count.
 * @returns Texture id per triangle.
 */
function buildPerTriangleTextureIds(mesh: THREE.Mesh, triangleCount: number): string[] {
  const ids = new Array<string>(triangleCount).fill(DEFAULT_CHECKER_TEXTURE_ID);
  for (const entry of getFaceTextureMapsLive(mesh)) {
    const textureId = entry.mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID;
    for (const triangleIndex of entry.triangleIndices) {
      if (triangleIndex >= 0 && triangleIndex < triangleCount) {
        ids[triangleIndex] = textureId;
      }
    }
  }
  return ids;
}

/**
 * Counts triangles in a buffer geometry.
 *
 * @param geometry Buffer geometry.
 * @returns Triangle count.
 */
function countGeometryTriangles(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) {
    return Math.floor(index.count / 3);
  }
  const position = geometry.getAttribute('position');
  if (!position) {
    return 0;
  }
  return Math.floor(position.count / 3);
}

/**
 * Writes display UVs onto document corners assuming expansion vertex order.
 *
 * @param document Mesh document.
 * @param uvAttribute Display UV attribute.
 * @param positionAttribute Display position attribute.
 * @returns True when every half-edge position matched the expansion slot.
 */
function captureCornerUvsByExpansionOrder(
  document: MeshDocument,
  uvAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  positionAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
): boolean {
  const topology = document.getTopology();
  const positions = topology.getPositions();
  const cornerUvs = document.getAttributes().getCornerUvs().getValues();
  let expansionIndex = 0;
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
      if (!positionsMatchExpansionSlot(topology, halfEdgeIndex, expansionIndex, positions, positionAttribute)) {
        return false;
      }
      const uvBase = halfEdgeIndex * 2;
      cornerUvs[uvBase] = uvAttribute.getX(expansionIndex);
      cornerUvs[uvBase + 1] = uvAttribute.getY(expansionIndex);
      expansionIndex += 1;
    }
  }
  document.markAttributesDirty();
  return true;
}

/**
 * Returns whether a display expansion vertex matches the topology half-edge
 * position.
 *
 * @param topology Mesh topology.
 * @param halfEdgeIndex Half-edge index.
 * @param expansionIndex Display vertex index.
 * @param topologyPositions Packed topology positions.
 * @param positionAttribute Display positions.
 * @returns True when positions match within epsilon.
 */
function positionsMatchExpansionSlot(
  topology: import('@/mesh/topology/mesh_topology.js').MeshTopology,
  halfEdgeIndex: number,
  expansionIndex: number,
  topologyPositions: Float32Array,
  positionAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
): boolean {
  const vertexIndex = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
  const base = vertexIndex * 3;
  const dx = (topologyPositions[base] ?? 0) - positionAttribute.getX(expansionIndex);
  const dy = (topologyPositions[base + 1] ?? 0) - positionAttribute.getY(expansionIndex);
  const dz = (topologyPositions[base + 2] ?? 0) - positionAttribute.getZ(expansionIndex);
  return dx * dx + dy * dy + dz * dz <= FACE_VERTEX_MATCH_EPSILON ** 2;
}
