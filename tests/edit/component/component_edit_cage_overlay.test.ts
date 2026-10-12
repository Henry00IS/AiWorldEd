import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ComponentEditCageOverlay } from '@/edit/component/component_edit_cage_overlay.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import { meshTopologyFaceVertexIndices } from '@/mesh/topology/mesh_topology_query.js';

describe('ComponentEditCageOverlay', () => {
  it('draws vertex dots after transparent cage wires so selection stays visible', () => {
    const scene = new THREE.Scene();
    const overlay = new ComponentEditCageOverlay(scene);
    const group = scene.children.find((child) => child.userData['isEditComponentCage'] === true);
    expect(group).toBeInstanceOf(THREE.Group);
    if (!(group instanceof THREE.Group)) {
      return;
    }
    const points = group.children.find((child) => child instanceof THREE.Points);
    const lines = group.children.filter((child) => child instanceof THREE.LineSegments);
    expect(points).toBeInstanceOf(THREE.Points);
    expect(lines.length).toBeGreaterThan(0);
    if (!(points instanceof THREE.Points)) {
      return;
    }
    const pointMaterial = points.material as THREE.PointsMaterial;
    expect(pointMaterial.transparent).toBe(true);
    expect(pointMaterial.opacity).toBe(1);
    expect(pointMaterial.depthWrite).toBe(false);
    for (const line of lines) {
      expect(points.renderOrder).toBeGreaterThan(line.renderOrder);
    }
    overlay.dispose();
  });

  it('rewrites a selected face outline in place when only positions change', () => {
    const scene = new THREE.Scene();
    const overlay = new ComponentEditCageOverlay(scene);
    const document = createMeshDocumentBox(2, 2, 2);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    const source = { targetId: mesh.uuid, mesh, document };
    const selected = [{ targetId: mesh.uuid, kind: 'face' as const, componentKey: '0' }];
    overlay.update([source], [], selected);
    const outline = findLineWithPositions(scene, 1001);
    const attribute = outline.geometry.getAttribute('position');
    const movedX = moveFaceCornerX(document, 0, 5);
    overlay.update([source], [], selected);
    expect(outline.geometry.getAttribute('position')).toBe(attribute);
    expect(positionBufferHasX(attribute, movedX)).toBe(true);
    overlay.dispose();
  });

  it('rebuilds cage edges when a replacement document reuses the topology generation', () => {
    const scene = new THREE.Scene();
    const overlay = new ComponentEditCageOverlay(scene);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    const first = buildOpenQuadDocument([0, 1, 2, 3]);
    const source = { targetId: 'mesh', mesh, document: first };
    overlay.update([source], [], []);
    const cage = findLineWithPositions(scene, 1000);
    const start = readDocumentVertex(first, 0);
    const end = readDocumentVertex(first, 1);
    expect(positionBufferHasSegment(cage.geometry.getAttribute('position'), start, end)).toBe(true);
    source.document = buildOpenQuadDocument([0, 2, 1, 3]);
    overlay.update([source], [], []);
    const rebuilt = cage.geometry.getAttribute('position');
    const nextStart = readDocumentVertex(source.document, 0);
    const nextEnd = readDocumentVertex(source.document, 1);
    expect(positionBufferHasSegment(rebuilt, nextStart, nextEnd)).toBe(false);
    overlay.dispose();
  });
});

/**
 * Builds an open quad whose corners are a unit square on Z = 0.
 *
 * @param loop Corner vertex indices.
 * @returns Mesh document.
 */
function buildOpenQuadDocument(loop: readonly number[]): MeshDocument {
  const builder = new MeshTopologyBuilder();
  builder.appendVertex(0, 0, 0);
  builder.appendVertex(1, 0, 0);
  builder.appendVertex(1, 1, 0);
  builder.appendVertex(0, 1, 0);
  builder.appendFace(loop);
  return new MeshDocument(builder.build());
}

/**
 * Moves one corner of a face along local X.
 *
 * @param document Mesh document.
 * @param faceIndex Face index.
 * @param deltaX Added local X.
 * @returns The corner's new local X.
 */
function moveFaceCornerX(document: MeshDocument, faceIndex: number, deltaX: number): number {
  const corner = meshTopologyFaceVertexIndices(document.getTopology(), faceIndex)[0] ?? 0;
  const positions = document.getTopology().getPositions();
  const base = corner * 3;
  positions[base] = (positions[base] ?? 0) + deltaX;
  document.markPositionsDirty();
  return positions[base] ?? 0;
}

/**
 * Reads one document vertex as a vector.
 *
 * @param document Mesh document.
 * @param vertexIndex Vertex index.
 * @returns Local position.
 */
function readDocumentVertex(document: MeshDocument, vertexIndex: number): THREE.Vector3 {
  const positions = document.getTopology().getPositions();
  const base = vertexIndex * 3;
  return new THREE.Vector3(positions[base] ?? 0, positions[base + 1] ?? 0, positions[base + 2] ?? 0);
}

/**
 * Finds a line whose render order matches and whose position buffer is not
 * empty.
 *
 * @param scene Scene that owns the overlay.
 * @param renderOrder Render order to match.
 * @returns Line segments.
 */
function findLineWithPositions(scene: THREE.Scene, renderOrder: number): THREE.LineSegments {
  const group = scene.children.find((child) => child.userData['isEditComponentCage'] === true);
  if (!(group instanceof THREE.Group)) {
    throw new Error('missing cage group');
  }
  const line = group.children.find(
    (child) =>
      child instanceof THREE.LineSegments &&
      child.renderOrder === renderOrder &&
      child.geometry.getAttribute('position').count > 0,
  );
  if (!(line instanceof THREE.LineSegments)) {
    throw new Error('missing line');
  }
  return line;
}

/**
 * Returns whether a position buffer contains an X coordinate.
 *
 * @param attribute Position attribute.
 * @param x Local or world X.
 * @returns True when a vertex stores that X.
 */
function positionBufferHasX(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, x: number): boolean {
  for (let index = 0; index < attribute.count; index++) {
    if (Math.abs(attribute.getX(index) - x) < 1e-5) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether a line buffer contains a segment between two positions.
 *
 * @param attribute Position attribute.
 * @param start Segment start.
 * @param end Segment end.
 * @returns True when either endpoint order is present.
 */
function positionBufferHasSegment(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  start: THREE.Vector3,
  end: THREE.Vector3,
): boolean {
  for (let index = 0; index + 1 < attribute.count; index += 2) {
    const forward = attributePointMatches(attribute, index, start) && attributePointMatches(attribute, index + 1, end);
    const reverse = attributePointMatches(attribute, index, end) && attributePointMatches(attribute, index + 1, start);
    if (forward || reverse) {
      return true;
    }
  }
  return false;
}

/**
 * Returns whether one buffer vertex matches a position.
 *
 * @param attribute Position attribute.
 * @param index Vertex index.
 * @param point Expected position.
 * @returns True when each component matches.
 */
function attributePointMatches(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
  point: THREE.Vector3,
): boolean {
  return (
    Math.abs(attribute.getX(index) - point.x) < 1e-5 &&
    Math.abs(attribute.getY(index) - point.y) < 1e-5 &&
    Math.abs(attribute.getZ(index) - point.z) < 1e-5
  );
}
