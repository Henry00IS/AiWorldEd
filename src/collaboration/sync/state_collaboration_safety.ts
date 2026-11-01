import type { BufferGeometryData, ObjectEntry } from '@/io/scene/io_types.js';
import { meshDocumentDataValid } from '@/io/geometry/mesh_document_codec.js';
import type { SerializedSolidBrush } from '@/solid/io/solid_model_codec.js';
import type {
  NodeCollaborationBrushData,
  NodeCollaborationEntryData,
  NodeCollaborationState,
} from '@/collaboration/scene/node_collaboration_types.js';

/** Largest magnitude a relayed number may have. */
export const STATE_SAFE_MAGNITUDE = 1e9;

/** Largest segment count a relayed primitive may ask for. */
export const STATE_SAFE_SEGMENTS = 256;

/** Most vertices a relayed brush may have. */
export const STATE_SAFE_BRUSH_VERTICES = 4096;

const SEGMENT_KEYS: readonly string[] = ['widthSegments', 'heightSegments', 'radialSegments', 'segments'];

/**
 * Returns whether a value is an integer in [min, max).
 *
 * @param value Candidate.
 * @param min Inclusive lower bound.
 * @param max Exclusive upper bound.
 * @returns True when in range.
 */
function intIn(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value < max;
}

/**
 * Returns whether an optional array only holds integers in [0, max).
 *
 * @param values Candidate array.
 * @param max Exclusive upper bound.
 * @returns True when absent or valid.
 */
function indicesIn(values: unknown, max: number): boolean {
  if (values === undefined) return true;
  return Array.isArray(values) && values.every((value) => intIn(value, 0, max));
}

/**
 * Returns whether every number in a JSON value is finite and of sane magnitude.
 *
 * @param value Parsed JSON value.
 * @returns True when every number is safe.
 */
export function stateNumbersSafe(value: unknown): boolean {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const item = stack.pop();
    if (typeof item === 'number' && !(Math.abs(item) <= STATE_SAFE_MAGNITUDE)) return false;
    if (typeof item === 'object' && item !== null) stack.push(...Object.values(item));
  }
  return true;
}

/**
 * Returns whether primitive parameters ask for a sane amount of geometry.
 *
 * @param params Geometry parameters.
 * @returns True when every segment count is bounded.
 */
function paramsSafe(params: unknown): boolean {
  if (params === undefined) return true;
  if (typeof params !== 'object' || params === null) return false;
  const record = params as Record<string, unknown>;
  return SEGMENT_KEYS.every((key) => record[key] === undefined || intIn(record[key], 0, STATE_SAFE_SEGMENTS + 1));
}

/**
 * Returns whether buffer geometry arrays are consistent.
 *
 * @param data Geometry arrays.
 * @returns True when lengths and indices match the vertex count.
 */
function bufferSafe(data: BufferGeometryData | undefined): boolean {
  if (data === undefined) return true;
  if (typeof data !== 'object' || data === null || !Array.isArray(data.position)) return false;
  const count = data.position.length / 3;
  if (!Number.isInteger(count)) return false;
  if (data.normal !== undefined && (!Array.isArray(data.normal) || data.normal.length !== count * 3)) return false;
  if (data.uv !== undefined && (!Array.isArray(data.uv) || data.uv.length !== count * 2)) return false;
  if (data.index !== undefined && (!Array.isArray(data.index) || data.index.length % 3 !== 0)) return false;
  return indicesIn(data.index, count) && groupsSafe(data);
}

/**
 * Returns whether optional material groups stay inside the drawn range.
 *
 * @param data Geometry arrays.
 * @returns True when absent or every group is a bounded integer range.
 */
function groupsSafe(data: BufferGeometryData): boolean {
  if (data.groups === undefined) return true;
  if (!Array.isArray(data.groups)) return false;
  const drawn = data.index?.length ?? data.position.length / 3;
  return data.groups.every(
    (group) =>
      typeof group === 'object' &&
      group !== null &&
      intIn(group.start, 0, drawn + 1) &&
      intIn(group.count, 0, drawn - group.start + 1) &&
      intIn(group.materialIndex, 0, STATE_SAFE_SEGMENTS),
  );
}

/**
 * Returns whether face texture maps only name existing triangles.
 *
 * @param entry Object entry.
 * @returns True when every triangle index is in range.
 */
function faceMapsSafe(entry: ObjectEntry): boolean {
  const maps = entry.faceTextureMaps;
  if (maps === undefined) return true;
  if (!Array.isArray(maps)) return false;
  const data = entry.geometryData;
  const triangles = data === undefined ? Number.MAX_SAFE_INTEGER : (data.index?.length ?? data.position.length / 3) / 3;
  return maps.every((map) => typeof map === 'object' && map !== null && indicesIn(map.triangleIndices, triangles));
}

/**
 * Returns whether an optional editable document payload is well formed.
 *
 * @param entry Object entry.
 * @returns True when absent or decodable.
 */
function meshDocumentSafe(entry: ObjectEntry): boolean {
  const document = entry.meshDocument;
  if (document === undefined) return true;
  return typeof document === 'object' && document !== null && meshDocumentDataValid(document);
}

/**
 * Returns whether an optional content texture id is a string.
 *
 * @param value Candidate.
 * @returns True when absent or a string.
 */
function contentTextureIdSafe(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

/**
 * Returns whether an entry payload is safe to build.
 *
 * @param data Entry payload.
 * @returns True when the mesh geometry is bounded and consistent.
 */
function entrySafe(data: NodeCollaborationEntryData): boolean {
  const entry = data.entry;
  if (typeof entry !== 'object' || entry === null) return true;
  if (!uvSafe(data.uv)) return false;
  return (
    paramsSafe(entry.geometryParams) &&
    bufferSafe(entry.geometryData) &&
    faceMapsSafe(entry) &&
    meshDocumentSafe(entry) &&
    contentTextureIdSafe(entry.contentTextureId)
  );
}

/**
 * Returns whether literal primitive UVs are an even list of numbers.
 *
 * @param uv Candidate UV components.
 * @returns True when absent or valid.
 */
function uvSafe(uv: unknown): boolean {
  if (uv === undefined) return true;
  return Array.isArray(uv) && uv.length % 2 === 0 && uv.every((value) => typeof value === 'number');
}

/**
 * Returns an optional array, an empty array when absent, or null when the value
 * is not an array.
 *
 * @param value Candidate.
 * @returns Array, or null.
 */
function listOf(value: unknown): unknown[] | null {
  if (value === undefined) return [];
  return Array.isArray(value) ? (value as unknown[]) : null;
}

/**
 * Returns whether wing edges only name existing vertices and edges.
 *
 * @param edges Wing edges.
 * @param vertices Vertex count.
 * @returns True when every index is in range.
 */
function wingEdgesSafe(edges: unknown[], vertices: number): boolean {
  return edges.every((edge) => {
    if (typeof edge !== 'object' || edge === null) return false;
    const record = edge as Record<string, unknown>;
    return intIn(record['vertexIndex'], 0, vertices) && intIn(record['twinIndex'], 0, edges.length);
  });
}

/**
 * Returns whether faces cover in-range runs of at least three wing edges.
 *
 * @param faces Faces.
 * @param edges Wing edge count.
 * @returns True when every run is in range.
 */
function facesSafe(faces: unknown[], edges: number): boolean {
  return faces.every((face) => {
    if (typeof face !== 'object' || face === null) return false;
    const record = face as Record<string, unknown>;
    const count = record['edgeCount'];
    if (!intIn(count, 3, edges + 1)) return false;
    return intIn(record['firstEdge'], 0, edges - (count as number) + 1);
  });
}

/**
 * Returns whether a brush payload is safe to build: bounded vertex count and a
 * wing-edge topology whose indices stay in range.
 *
 * @param data Brush payload.
 * @returns True when the brush is bounded and consistent.
 */
function brushSafe(data: NodeCollaborationBrushData): boolean {
  const brush = data.brush as Partial<SerializedSolidBrush> | undefined;
  if (typeof brush !== 'object' || brush === null) return true;
  const vertices = listOf(brush.vertices);
  const edges = listOf(brush.wingEdges);
  const faces = listOf(brush.faces);
  if (vertices === null || edges === null || faces === null) return false;
  if (vertices.length % 3 !== 0 || vertices.length > STATE_SAFE_BRUSH_VERTICES * 3) return false;
  if (!wingEdgesSafe(edges, vertices.length / 3) || !facesSafe(faces, edges.length)) return false;
  return indicesIn(brush.edgeFaceIndices, Math.max(faces.length, 1));
}

/**
 * Returns whether a relayed node state is safe to apply: every number finite
 * and bounded, primitive segment counts capped and mesh and brush indices in
 * range, so a hostile member cannot hang or crash the other members.
 *
 * @param state Parsed state.
 * @returns True when the payload is safe.
 */
export function stateCollaborationSafe(state: NodeCollaborationState): boolean {
  if (!stateNumbersSafe(state.data)) return false;
  if (state.kind === 'entry') return entrySafe(state.data as NodeCollaborationEntryData);
  if (state.kind === 'brush') return brushSafe(state.data as NodeCollaborationBrushData);
  return true;
}
