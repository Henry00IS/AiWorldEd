import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { textureUvProjectPlanar } from '@/texture/uv_project/texture_uv_project_planar.js';
import { textureUvProjectPoint } from '@/texture/uv_project/texture_uv_project_view.js';

describe('textureUvProjectPlanar', () => {
  it('maps the origin to (0, 0) and measures metres along the face', () => {
    const origin = new THREE.Vector3(1, 2, 3);
    const matrix = textureUvProjectPlanar(new THREE.Vector3(0, 1, 0), 2, origin);
    expect(textureUvProjectPoint(matrix, origin)).toEqual([0, 0]);
    const stepped = textureUvProjectPoint(matrix, origin.clone().add(new THREE.Vector3(2, 0, 0)));
    const length = Math.hypot(stepped[0], stepped[1]);
    expect(Math.round(length * 1e6) / 1e6).toBe(1);
  });
});
