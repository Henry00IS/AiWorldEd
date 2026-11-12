import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import {
  solidResultTriangleIsDerived,
  solidTriangleSourceIsDerived,
} from '@/solid/model/solid_triangle_source_derived.js';

describe('solid_triangle_source_derived', () => {
  it('tells modifier output triangle sources from authored ones', () => {
    expect(solidTriangleSourceIsDerived({ derivedId: 'brush#copy' })).toBe(true);
    expect(solidTriangleSourceIsDerived({})).toBe(false);
    expect(solidTriangleSourceIsDerived(undefined)).toBe(false);
  });

  it('reads the derived flag of one result mesh triangle', () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] = [
      { brushId: 'brush', surfaceIndex: 0 },
      { brushId: 'brush', surfaceIndex: 0, derivedId: 'brush#copy' },
    ];
    expect(solidResultTriangleIsDerived(mesh, 0)).toBe(false);
    expect(solidResultTriangleIsDerived(mesh, 1)).toBe(true);
    expect(solidResultTriangleIsDerived(mesh, 5)).toBe(false);
    expect(solidResultTriangleIsDerived(new THREE.Mesh(), 0)).toBe(false);
  });
});
