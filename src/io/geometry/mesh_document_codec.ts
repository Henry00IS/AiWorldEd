import type { MeshDocumentData } from '@/io/scene/io_types.js';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';
import { meshTopologyFaceHalfEdgeIndices } from '@/mesh/topology/mesh_topology_query.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** Planar surface of one face as stored in a document payload. */
type MeshDocumentSurfaceData = NonNullable<MeshDocumentData['surfaces']>[number];

/**
 * Encodes and decodes the editable polygon document of a mesh, so a rebuilt
 * mesh keeps the creator's faces, corner UVs and planar face surfaces.
 */
export class MeshDocumentCodec {
  /**
   * Converts a document into a JSON-safe payload.
   *
   * @param document Source document.
   * @returns Positions, face loops, corner UVs and face surfaces.
   */
  encode(document: MeshDocument): MeshDocumentData {
    const topology = document.getTopology();
    const halfEdgesByFace: number[][] = [];
    for (let face = 0; face < topology.getFaceCount(); face++) {
      halfEdgesByFace.push(meshTopologyFaceHalfEdgeIndices(topology, face));
    }
    const data: MeshDocumentData = {
      position: Array.from(topology.getPositions()),
      faces: halfEdgesByFace.map((loop) => loop.map((halfEdge) => topology.getHalfEdge(halfEdge).vertexIndex)),
    };
    const uv = this.encodeCornerUvs(document, halfEdgesByFace);
    if (uv !== null) data.uv = uv;
    const surfaces = this.encodeSurfaces(document);
    if (surfaces !== null) data.surfaces = surfaces;
    return data;
  }

  /**
   * Rebuilds a document from a payload.
   *
   * @param data Encoded document.
   * @returns New document.
   */
  decode(data: MeshDocumentData): MeshDocument {
    const uv = data.uv === undefined ? undefined : new Float32Array(data.uv);
    const document = meshDocumentFromPolygonList(new Float32Array(data.position), data.faces, uv);
    const surfaces = document.getAttributes().getFaceSurfaces();
    (data.surfaces ?? []).forEach((surface, face) => {
      if (surface === null || face >= document.getTopology().getFaceCount()) return;
      surfaces.set(face, { textureId: surface.textureId, uv: SurfaceUvMatrix.fromSerialized(surface.uv) });
    });
    return document;
  }

  /**
   * Reads corner UVs in face order.
   *
   * @param document Source document.
   * @param halfEdgesByFace Half-edge loop of every face.
   * @returns Interleaved u, v values, or null when the document has none.
   */
  private encodeCornerUvs(document: MeshDocument, halfEdgesByFace: readonly number[][]): number[] | null {
    const values = document.getAttributes().getCornerUvs().getValues();
    if (values.length === 0) return null;
    const uv: number[] = [];
    for (const loop of halfEdgesByFace) {
      for (const halfEdge of loop) uv.push(values[halfEdge * 2] ?? 0, values[halfEdge * 2 + 1] ?? 0);
    }
    return uv;
  }

  /**
   * Reads the planar surface of every face.
   *
   * @param document Source document.
   * @returns Surface per face, or null when no face has one.
   */
  private encodeSurfaces(document: MeshDocument): MeshDocumentSurfaceData[] | null {
    const store = document.getAttributes().getFaceSurfaces();
    const surfaces: MeshDocumentSurfaceData[] = [];
    for (let face = 0; face < document.getTopology().getFaceCount(); face++) {
      const surface = store.get(face);
      surfaces.push(surface === undefined ? null : { textureId: surface.textureId, uv: surface.uv.serialize() });
    }
    return surfaces.some((surface) => surface !== null) ? surfaces : null;
  }
}

/**
 * Returns whether a document payload is well formed: finite positions, faces of
 * at least three in-range vertices and corner UVs for every corner.
 *
 * @param data Candidate payload.
 * @returns True when the payload can be decoded safely.
 */
export function meshDocumentDataValid(data: MeshDocumentData): boolean {
  if (!numbersFinite(data.position) || data.position.length % 3 !== 0 || !Array.isArray(data.faces)) return false;
  const vertexCount = data.position.length / 3;
  let cornerCount = 0;
  for (const face of data.faces) {
    if (!Array.isArray(face) || face.length < 3) return false;
    if (!face.every((index) => Number.isInteger(index) && index >= 0 && index < vertexCount)) return false;
    cornerCount += face.length;
  }
  if (data.uv !== undefined && (!numbersFinite(data.uv) || data.uv.length !== cornerCount * 2)) return false;
  if (data.surfaces === undefined) return true;
  return Array.isArray(data.surfaces) && data.surfaces.length <= data.faces.length && data.surfaces.every(surfaceValid);
}

/**
 * Returns whether a stored face surface is empty or a texture id with a full
 * planar UV matrix.
 *
 * @param surface Candidate surface.
 * @returns True when the surface can be decoded.
 */
function surfaceValid(surface: MeshDocumentSurfaceData): boolean {
  if (surface === null) return true;
  if (typeof surface !== 'object' || typeof surface.textureId !== 'string' || typeof surface.uv !== 'object')
    return false;
  return (
    numbersFinite(surface.uv.u) && surface.uv.u.length === 4 && numbersFinite(surface.uv.v) && surface.uv.v.length === 4
  );
}

/**
 * Returns whether a value is an array of finite numbers.
 *
 * @param values Candidate.
 * @returns True when every entry is a finite number.
 */
function numbersFinite(values: unknown): values is number[] {
  return Array.isArray(values) && values.every((value) => typeof value === 'number' && Number.isFinite(value));
}
