import { describe, expect, it } from 'vitest';
import { MeshDocumentCodec, meshDocumentDataValid } from '@/io/geometry/mesh_document_codec.js';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';
import { SurfaceUvMatrix, type SurfaceUvMatrixSerialized } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { MeshDocumentData } from '@/io/scene/io_types.js';

/** A unit quad and a triangle sharing one edge, with distinct corner UVs. */
const QUAD_AND_TRIANGLE: MeshDocumentData = {
  position: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 2, 0.5, 0],
  faces: [
    [0, 1, 2, 3],
    [1, 4, 2],
  ],
  uv: [0, 0, 1, 0, 1, 1, 0, 1, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75],
};

describe('MeshDocumentCodec', () => {
  const codec = new MeshDocumentCodec();

  it('round-trips polygon faces and corner UVs without triangulating them', () => {
    const document = codec.decode(QUAD_AND_TRIANGLE);
    expect(document.getTopology().getFaceCount()).toBe(2);
    expect(codec.encode(document)).toEqual(QUAD_AND_TRIANGLE);
  });

  it('round-trips planar face surfaces', () => {
    const document = meshDocumentFromPolygonList(new Float32Array(QUAD_AND_TRIANGLE.position), QUAD_AND_TRIANGLE.faces);
    const uv: SurfaceUvMatrixSerialized = { u: [1, 0, 0, 0.25], v: [0, 1, 0, 0.5] };
    document
      .getAttributes()
      .getFaceSurfaces()
      .set(1, { textureId: 'walls/brick.png', uv: SurfaceUvMatrix.fromSerialized(uv) });
    const encoded = codec.encode(document);
    expect(encoded.surfaces).toEqual([null, { textureId: 'walls/brick.png', uv }]);
    expect(codec.encode(codec.decode(encoded))).toEqual(encoded);
  });

  it('omits surfaces when no face has one', () => {
    const document = meshDocumentFromPolygonList(new Float32Array(QUAD_AND_TRIANGLE.position), QUAD_AND_TRIANGLE.faces);
    const encoded = codec.encode(document);
    expect(encoded.surfaces).toBeUndefined();
    expect(codec.encode(codec.decode(encoded))).toEqual(encoded);
  });

  it('accepts well formed payloads and rejects ones that would read out of range', () => {
    expect(meshDocumentDataValid(QUAD_AND_TRIANGLE)).toBe(true);
    const broken: MeshDocumentData[] = [
      { ...QUAD_AND_TRIANGLE, faces: [[0, 1, 9]] },
      { ...QUAD_AND_TRIANGLE, faces: [[0, 1]] },
      { ...QUAD_AND_TRIANGLE, position: [0, 0] },
      { ...QUAD_AND_TRIANGLE, uv: [0, 0] },
      { ...QUAD_AND_TRIANGLE, position: [Number.NaN, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 2, 0.5, 0] },
    ];
    broken.forEach((data) => expect(meshDocumentDataValid(data)).toBe(false));
  });
});
