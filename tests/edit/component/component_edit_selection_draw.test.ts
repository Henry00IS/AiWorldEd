import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { meshDocumentFromBufferGeometryWelded } from '@/edit/mesh/mesh_edit_weld.js';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import {
  buildComponentCageDrawBuffers,
  buildComponentSelectionDrawBuffers,
  EDIT_CAGE_COLOR,
  EDIT_SELECTED_VERTEX_COLOR,
} from '@/edit/component/component_edit_selection_draw.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
  meshTopologyHalfEdgeDestinationVertex,
} from '@/mesh/topology/mesh_topology_query.js';

describe('buildComponentSelectionDrawBuffers', () => {
  it('draws full-edge gradient segments with fadeT 0→1 for a selected vertex', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const buffers = buildComponentSelectionDrawBuffers(
      [{ targetId: mesh.uuid, mesh, document }],
      [],
      [{ targetId: mesh.uuid, kind: 'vertex', componentKey: '0' }],
    );
    expect(buffers.halfEdgeCoords.length).toBeGreaterThan(0);
    expect(buffers.halfEdgeFadeT.length).toBe(buffers.halfEdgeCoords.length / 3);
    expect(buffers.fullEdgeCoords.length).toBe(0);
    expect(buffers.halfEdgeFadeT[0]).toBe(0);
    expect(buffers.halfEdgeFadeT[1]).toBe(1);
    const start = new THREE.Vector3(buffers.halfEdgeCoords[0], buffers.halfEdgeCoords[1], buffers.halfEdgeCoords[2]);
    const end = new THREE.Vector3(buffers.halfEdgeCoords[3], buffers.halfEdgeCoords[4], buffers.halfEdgeCoords[5]);
    expect(start.distanceTo(end)).toBeGreaterThan(0.4);
    geometry.dispose();
  });

  it('omits half-selected edges from the black cage so the gradient owns the full segment', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const sources = [{ targetId: mesh.uuid, mesh, document }];
    const empty = buildComponentCageDrawBuffers(sources, [], []);
    const withVert = buildComponentCageDrawBuffers(
      sources,
      [],
      [{ targetId: mesh.uuid, kind: 'vertex', componentKey: '0' }],
    );
    expect(withVert.edgeCoords.length).toBeLessThan(empty.edgeCoords.length);
    geometry.dispose();
  });

  it('draws a full selected edge without half-edge fade data', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const topology = document.getTopology();
    const halfEdge = meshTopologyFaceHalfEdgeIndices(topology, 0)[0]!;
    const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdge);
    const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdge);
    const edgeKey = buildComponentEdgeKey(a, b);
    const buffers = buildComponentSelectionDrawBuffers(
      [{ targetId: mesh.uuid, mesh, document }],
      [],
      [{ targetId: mesh.uuid, kind: 'edge', componentKey: edgeKey }],
    );
    expect(buffers.fullEdgeCoords.length).toBe(6);
    expect(buffers.halfEdgeCoords.length).toBe(0);
    expect(buffers.halfEdgeFadeT.length).toBe(0);
    geometry.dispose();
  });

  it('fills selected faces without inventing edge colors in CPU buffers', () => {
    const document = createMeshDocumentBox(1, 1, 1);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const buffers = buildComponentSelectionDrawBuffers(
      [{ targetId: mesh.uuid, mesh, document }],
      [],
      [{ targetId: mesh.uuid, kind: 'face', componentKey: '0' }],
    );
    expect(buffers.faceCoords.length).toBeGreaterThan(0);
    geometry.dispose();
  });

  it('highlights corner vertices when a face is selected', () => {
    const document = createMeshDocumentBox(1, 1, 1);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const sources = [{ targetId: mesh.uuid, mesh, document }];
    const cage = buildComponentCageDrawBuffers(sources, [], [{ targetId: mesh.uuid, kind: 'face', componentKey: '0' }]);
    const white = hexToRgb(EDIT_SELECTED_VERTEX_COLOR);
    let whiteCount = 0;
    for (let index = 0; index < cage.vertexColors.length; index += 3) {
      if (
        cage.vertexColors[index] === white[0] &&
        cage.vertexColors[index + 1] === white[1] &&
        cage.vertexColors[index + 2] === white[2]
      ) {
        whiteCount += 1;
      }
    }
    expect(whiteCount).toBe(4);
    geometry.dispose();
  });
});

describe('buildComponentCageDrawBuffers', () => {
  it('keeps every vertex and recolors selected ones white on the same layer', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const vertexCount = document.getTopology().getVertexCount();
    const sources = [{ targetId: mesh.uuid, mesh, document }];
    const empty = buildComponentCageDrawBuffers(sources, [], []);
    const withVert = buildComponentCageDrawBuffers(
      sources,
      [],
      [{ targetId: mesh.uuid, kind: 'vertex', componentKey: '0' }],
    );
    expect(empty.vertexCoords.length).toBe(vertexCount * 3);
    expect(withVert.vertexCoords.length).toBe(vertexCount * 3);
    expect(withVert.vertexColors.length).toBe(vertexCount * 3);
    expect(empty.vertexColors.slice(0, 3)).toEqual(hexToRgb(EDIT_CAGE_COLOR));
    expect(withVert.vertexColors.slice(0, 3)).toEqual(hexToRgb(EDIT_SELECTED_VERTEX_COLOR));
    expect(withVert.vertexColors.slice(3, 6)).toEqual(hexToRgb(EDIT_CAGE_COLOR));
    geometry.dispose();
  });

  it('omits a fully selected edge from the cage lines', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.updateMatrixWorld(true);
    const document = meshDocumentFromBufferGeometryWelded(geometry);
    const topology = document.getTopology();
    const halfEdge = meshTopologyFaceHalfEdgeIndices(topology, 0)[0]!;
    const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdge);
    const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdge);
    const edgeKey = buildComponentEdgeKey(a, b);
    const sources = [{ targetId: mesh.uuid, mesh, document }];
    const empty = buildComponentCageDrawBuffers(sources, [], []);
    const withEdge = buildComponentCageDrawBuffers(
      sources,
      [],
      [{ targetId: mesh.uuid, kind: 'edge', componentKey: edgeKey }],
    );
    expect(withEdge.edgeCoords.length).toBe(empty.edgeCoords.length - 6);
    geometry.dispose();
  });

  it('draws n-gon cage edges for polygon documents', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const document = meshDocumentFromPolygonList(positions, [[0, 1, 2, 3]]);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    mesh.updateMatrixWorld(true);
    const buffers = buildComponentCageDrawBuffers([{ targetId: mesh.uuid, mesh, document }], [], []);
    expect(buffers.edgeCoords.length).toBeGreaterThan(0);
  });
});

/**
 * Converts a hex color to packed 0–1 rgb components matching draw buffers.
 *
 * @param hex Hex color.
 * @returns R, g, b floats.
 */
function hexToRgb(hex: number): number[] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
