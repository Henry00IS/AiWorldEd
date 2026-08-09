import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createUvTransformSession,
  sampleUvTransformSession,
  seedUvTransformRadialStart,
} from '@/texture/interactive/uv_transform_session.js';
import { createDefaultFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';

/**
 * Builds a minimal scale session with a radial dead zone.
 *
 * @param minRadialStartDistance Dead-zone radius.
 * @returns Session ready for sampling.
 */
function createScaleSession(minRadialStartDistance: number) {
  const mapping = createDefaultFaceTextureMapping();
  return createUvTransformSession(
    'scale',
    [
      {
        mesh: new THREE.Mesh(),
        triangleIndices: [0],
        baselineMapping: mapping,
        worldNormal: new THREE.Vector3(0, 1, 0),
      },
    ],
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 1, 0),
    { enabled: false, translationInterval: 1, rotationSnapDegrees: 15, scaleSnapInterval: 0.1 },
    minRadialStartDistance,
  );
}

describe('uv_transform_session radial dead zone', () => {
  it('does not lock scale reference inside the dead zone', () => {
    const session = createScaleSession(1);
    const locked = seedUvTransformRadialStart(session, new THREE.Vector3(0.25, 0, 0));
    expect(locked).toBe(false);
    expect(session.hasRadialReference).toBe(false);
    const sample = sampleUvTransformSession(session, new THREE.Vector3(0.25, 0, 0));
    expect(sample.mappings[0]!.uv.u.toArray()).toEqual(session.targets[0]!.baselineMapping.uv.u.toArray());
  });

  it('locks scale reference past the dead zone and then scales', () => {
    const session = createScaleSession(0.5);
    const baselineUx = session.targets[0]!.baselineMapping.uv.u.x;
    expect(seedUvTransformRadialStart(session, new THREE.Vector3(1, 0, 0))).toBe(true);
    expect(session.hasRadialReference).toBe(true);
    expect(session.startRadius).toBeCloseTo(1, 5);
    const sample = sampleUvTransformSession(session, new THREE.Vector3(2, 0, 0));
    expect(sample.mappings[0]!.uv.u.x).not.toBeCloseTo(baselineUx, 4);
  });
});
