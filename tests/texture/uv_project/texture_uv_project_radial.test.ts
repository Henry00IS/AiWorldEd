import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  textureUvProjectCylinderPoint,
  textureUvProjectFitFace,
  textureUvProjectSpherePoint,
} from '@/texture/uv_project/texture_uv_project_radial.js';

describe('texture UV radial projection', () => {
  const axis = new THREE.Vector3(0, 1, 0);
  const centre = new THREE.Vector3();

  it('measures cylinder height along the axis and arc length around it', () => {
    const [u, v] = textureUvProjectCylinderPoint(new THREE.Vector3(1, 2, 0), axis, centre, 1, 1);
    expect(Math.round(v * 1e6) / 1e6).toBe(2);
    expect(Math.abs(u)).toBeLessThan(1e-6);
  });

  it('puts the +axis pole of a sphere at V 0', () => {
    const [, v] = textureUvProjectSpherePoint(new THREE.Vector3(0, 1, 0), axis, centre, 1, 1);
    expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it('fits a planar matrix to a face so its corners keep the radial mapping', () => {
    const corners = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(1, 0, 1),
    ];
    const matrix = textureUvProjectFitFace(corners, (point) =>
      textureUvProjectCylinderPoint(point, axis, centre, 1, 1),
    );
    if (!matrix) throw new Error('Expected a fitted matrix');
    for (const corner of corners) {
      const exact = textureUvProjectCylinderPoint(corner, axis, centre, 1, 1);
      const fitted = matrix.project(corner);
      expect(Math.abs(fitted.u - exact[0])).toBeLessThan(1e-6);
      expect(Math.abs(fitted.v - exact[1])).toBeLessThan(1e-6);
    }
  });
});
