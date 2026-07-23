import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  captureGeometrySourceIfNeeded,
  getGeometrySource,
  resolveGeometrySourceParams,
  resolveGeometrySourceType
} from '../../src/texture/geometry_source.js';
import { ensureUniqueTriangleVertices } from '../../src/texture/planar_uv_projector.js';

describe('geometry_source', () => {
  it('should detect typed box geometry parameters', () => {
    const geometry = new THREE.BoxGeometry(2, 3, 4);
    expect(resolveGeometrySourceType(geometry)).toBe('box');
    expect(resolveGeometrySourceParams(geometry)).toEqual({
      width: 2,
      height: 3,
      depth: 4
    });
  });

  it('should retain source identity after de-indexing for UVs', () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1, 2, 16));
    captureGeometrySourceIfNeeded(mesh);
    ensureUniqueTriangleVertices(mesh);
    expect(mesh.geometry).not.toBeInstanceOf(THREE.CylinderGeometry);
    expect(resolveGeometrySourceType(mesh.geometry)).toBe('cylinder');
    const source = getGeometrySource(mesh.geometry);
    expect(source?.params.radiusTop).toBe(0.5);
    expect(source?.params.radiusBottom).toBe(1);
    expect(source?.params.height).toBe(2);
  });
});
