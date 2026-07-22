import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  DECORATIVE_EDGE_USERDATA_KEY,
  isDecorativeEdge,
  isEditorHelperObject
} from '../../src/utils/mesh_edge_sync.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../../src/selection/selection_highlight.js';

describe('isEditorHelperObject', () => {
  it('should treat decorative edges as helpers', () => {
    const line = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial()
    );
    line.userData[DECORATIVE_EDGE_USERDATA_KEY] = true;
    expect(isEditorHelperObject(line)).toBe(true);
    expect(isDecorativeEdge(line)).toBe(true);
  });

  it('should treat selection outlines as helpers', () => {
    const line = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial()
    );
    line.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] = true;
    expect(isEditorHelperObject(line)).toBe(true);
  });

  it('should treat wireframe overlays as helpers', () => {
    const line = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial()
    );
    line.userData.isWireframeOverlay = true;
    expect(isEditorHelperObject(line)).toBe(true);
  });

  it('should not treat content meshes as helpers', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    expect(isEditorHelperObject(mesh)).toBe(false);
  });
});
