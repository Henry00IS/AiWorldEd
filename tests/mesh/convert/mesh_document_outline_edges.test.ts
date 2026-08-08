import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';
import { meshDocumentToBufferGeometry } from '@/mesh/convert/mesh_to_buffer_geometry.js';
import { writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import {
  buildMeshDocumentOutlineEdgeGeometry,
  getOrBuildMeshDocumentOutlineEdges,
} from '@/mesh/convert/mesh_document_outline_edges.js';
import { getOrBuildSelectionEdgeGeometry } from '@/selection/object/selection_edge_geometry.js';

describe('mesh_document_outline_edges', () => {
  it('emits twelve undirected edges for a box document (six quads)', () => {
    const document = createMeshDocumentBox(1, 1, 1);
    const edges = buildMeshDocumentOutlineEdgeGeometry(document);
    const positions = edges.getAttribute('position');
    expect(positions.count).toBe(24);
    edges.dispose();
  });

  it('does not emit ear-clip diagonals for an n-gon face', () => {
    const positions = new Float32Array([0, 0, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0, 1, 2, 0, 0, 2, 0]);
    const document = meshDocumentFromPolygonList(positions, [[0, 1, 2, 3, 4, 5]]);
    const edges = buildMeshDocumentOutlineEdgeGeometry(document);
    const attribute = edges.getAttribute('position');
    expect(attribute.count).toBe(12);
    edges.dispose();
  });

  it('is used by selection outlines when a persistent document is bound', () => {
    const document = createMeshDocumentBox(1, 1, 1);
    const mesh = new THREE.Mesh(meshDocumentToBufferGeometry(document));
    writePersistentMeshDocument(mesh, document);
    const documentEdges = getOrBuildMeshDocumentOutlineEdges(mesh);
    const selectionEdges = getOrBuildSelectionEdgeGeometry(mesh);
    expect(documentEdges).toBeTruthy();
    expect(selectionEdges).toBe(documentEdges);
    mesh.geometry.dispose();
  });

  it('caches outline edges across repeated builds', () => {
    const document = createMeshDocumentBox(1, 1, 1);
    const mesh = new THREE.Mesh(meshDocumentToBufferGeometry(document));
    writePersistentMeshDocument(mesh, document);
    const first = getOrBuildMeshDocumentOutlineEdges(mesh);
    const second = getOrBuildMeshDocumentOutlineEdges(mesh);
    expect(second).toBe(first);
    mesh.geometry.dispose();
  });

  it('builds document outlines when document is bound before decorative edges', () => {
    const document = createMeshDocumentBox(1, 1, 1);
    const mesh = new THREE.Mesh(meshDocumentToBufferGeometry(document));
    writePersistentMeshDocument(mesh, document);
    const outline = getOrBuildMeshDocumentOutlineEdges(mesh);
    expect(outline).toBeTruthy();
    expect(outline!.getAttribute('position').count).toBe(24);
    mesh.geometry.dispose();
  });
});
