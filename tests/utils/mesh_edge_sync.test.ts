import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  DECORATIVE_EDGE_USERDATA_KEY,
  prepareFlatShadedGeometry,
  rebuildDecorativeEdges,
  removeDecorativeEdges,
  enableFlatShadingOnMesh
} from '../../src/utils/mesh_edge_sync.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../../src/selection/selection_highlight.js';

describe('mesh_edge_sync', () => {
  let mesh: THREE.Mesh;

  beforeEach(() => {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
  });

  it('should create a decorative edge child from current geometry', () => {
    rebuildDecorativeEdges(mesh);
    const edges = mesh.children.filter(
      (child) => child.userData[DECORATIVE_EDGE_USERDATA_KEY] === true
    );
    expect(edges.length).toBe(1);
  });

  it('should replace stale decorative edges when rebuilt', () => {
    rebuildDecorativeEdges(mesh);
    const first = mesh.children[0] as THREE.LineSegments;
    mesh.geometry = new THREE.BoxGeometry(2, 2, 2);
    rebuildDecorativeEdges(mesh);
    const edges = mesh.children.filter(
      (child) => child.userData[DECORATIVE_EDGE_USERDATA_KEY] === true
    );
    expect(edges.length).toBe(1);
    expect(edges[0]).not.toBe(first);
  });

  it('should not remove selection highlights when rebuilding decorative edges', () => {
    const highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0xff0000 })
    );
    highlight.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] = true;
    mesh.add(highlight);
    rebuildDecorativeEdges(mesh);
    const stillThere = mesh.children.some(
      (child) => child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true
    );
    expect(stillThere).toBe(true);
  });

  it('should remove decorative edges on request', () => {
    rebuildDecorativeEdges(mesh);
    removeDecorativeEdges(mesh);
    const edges = mesh.children.filter(
      (child) => child.userData[DECORATIVE_EDGE_USERDATA_KEY] === true
    );
    expect(edges.length).toBe(0);
  });

  it('should produce non-indexed flat shaded geometry', () => {
    const indexed = new THREE.BoxGeometry(1, 1, 1);
    expect(indexed.index).not.toBeNull();
    const flat = prepareFlatShadedGeometry(indexed);
    expect(flat.index).toBeNull();
    expect(flat.getAttribute('normal')).toBeDefined();
  });

  it('should enable flatShading on standard materials', () => {
    enableFlatShadingOnMesh(mesh);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.flatShading).toBe(true);
  });
});
