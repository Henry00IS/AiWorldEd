import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  TEXTURE_UV_PROJECT_FRONT,
  TEXTURE_UV_PROJECT_OVERHEAD,
  TEXTURE_UV_PROJECT_SIDE,
  textureUvProjectAxis,
  textureUvProjectPoint,
  textureUvProjectView,
} from '@/texture/uv_project/texture_uv_project_view.js';

/**
 * Projects a point with a matrix and rounds the result.
 *
 * @param matrix UV matrix.
 * @param point Position.
 * @returns Rounded U and V.
 */
function projected(matrix: ReturnType<typeof textureUvProjectView>, point: THREE.Vector3): [number, number] {
  const uv = matrix.project(point);
  return [Math.round(uv.u * 1e6) / 1e6, Math.round(uv.v * 1e6) / 1e6];
}

describe('textureUvProjectView', () => {
  const point = new THREE.Vector3(2, 5, 3);

  it('maps Overhead from X and Z, Front from X and Y, and Side from Z and Y', () => {
    expect(projected(textureUvProjectView(TEXTURE_UV_PROJECT_OVERHEAD, 1), point)).toEqual([2, 3]);
    expect(projected(textureUvProjectView(TEXTURE_UV_PROJECT_FRONT, 1), point)).toEqual([2, 5]);
    expect(projected(textureUvProjectView(TEXTURE_UV_PROJECT_SIDE, 1), point)).toEqual([3, 5]);
  });

  it('scales by Size and subtracts the origin, the same way a world-unit bevel view does at size 1', () => {
    expect(projected(textureUvProjectView(TEXTURE_UV_PROJECT_FRONT, 2), point)).toEqual([1, 2.5]);
    const origin = new THREE.Vector3(2, 5, 0);
    expect(projected(textureUvProjectView(TEXTURE_UV_PROJECT_FRONT, 1, origin), point)).toEqual([0, 0]);
  });

  it('picks Axis from the same views Bevel Axis uses: Overhead, Front or Side', () => {
    expect(textureUvProjectAxis(new THREE.Vector3(0, 1, 0), 1)).toEqual(
      textureUvProjectView(TEXTURE_UV_PROJECT_OVERHEAD, 1),
    );
    expect(textureUvProjectAxis(new THREE.Vector3(0, 0, -1), 1)).toEqual(
      textureUvProjectView(TEXTURE_UV_PROJECT_FRONT, 1),
    );
    expect(textureUvProjectAxis(new THREE.Vector3(1, 0, 0), 1)).toEqual(
      textureUvProjectView(TEXTURE_UV_PROJECT_SIDE, 1),
    );
  });

  it('evaluates a point on an Axis mapping', () => {
    expect(textureUvProjectPoint(textureUvProjectAxis(new THREE.Vector3(0, 0, 1), 2), point)).toEqual([1, 2.5]);
  });
});
