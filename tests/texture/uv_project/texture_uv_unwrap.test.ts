import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { textureUvProjectPoint } from '@/texture/uv_project/texture_uv_project_view.js';
import { textureUvUnwrapFace } from '@/texture/uv_project/texture_uv_unwrap.js';

describe('textureUvUnwrapFace', () => {
  it('puts the lowest corner at (0, 0) and keeps a square face square', () => {
    const corners = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(2, 0, 2),
      new THREE.Vector3(0, 0, 2),
    ];
    const matrix = textureUvUnwrapFace(corners, new THREE.Vector3(0, 1, 0), 1, 0);
    if (!matrix) throw new Error('Expected an unwrap');
    const uvs = corners.map((corner) => textureUvProjectPoint(matrix, corner));
    const minU = Math.min(...uvs.map(([u]) => u));
    const minV = Math.min(...uvs.map(([, v]) => v));
    expect(Math.abs(minU)).toBeLessThan(1e-6);
    expect(Math.abs(minV)).toBeLessThan(1e-6);
    const width = Math.max(...uvs.map(([u]) => u)) - minU;
    const height = Math.max(...uvs.map(([, v]) => v)) - minV;
    expect(Math.round(width * 1e6) / 1e6).toBe(2);
    expect(Math.round(height * 1e6) / 1e6).toBe(2);
  });
});
