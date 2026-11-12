import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ensureMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import { meshDocumentFaceIndexFromDisplayTriangle } from '@/mesh/convert/mesh_document_face_triangle_map.js';
import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';
import { getFaceTextureMapsLive } from '@/texture/uv/face_texture_storage.js';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';

/**
 * A vertex dragged past its neighbour folds the quads around it. Picking and
 * face texture maps count corners - 2 display triangles per face, so the
 * display must keep that count even for faces that are no longer simple.
 */
describe('display geometry of folded faces', () => {
  it('keeps two triangles per quad after a corner is moved past its neighbour', () => {
    const mesh = new ToolPrimitiveCreation(new THREE.Group()).createBox(1, 1, 1);
    const document = ensureMeshEditDocument(mesh);
    if (document === null) throw new Error('box without document');
    const positions = document.getTopology().getPositions().slice();
    positions[0] = (positions[0] ?? 0) + 2;
    document.getTopology().setPositions(positions);
    writeMeshDocumentDisplayGeometry(mesh, document);
    const triangles = (mesh.geometry.index?.count ?? 0) / 3;
    expect(triangles).toBe(12);
    expect(meshDocumentFaceIndexFromDisplayTriangle(document, triangles - 1)).toBe(5);
    const mapped = getFaceTextureMapsLive(mesh).flatMap((map) => map.triangleIndices);
    expect(Math.max(...mapped)).toBeLessThan(triangles);
  });
});
