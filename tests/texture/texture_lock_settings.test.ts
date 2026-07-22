import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { TextureLockSettings } from '../../src/texture/texture_lock_settings.js';
import { initializeMeshTextureUVs } from '../../src/texture/face_texture_applier.js';

describe('TextureLockSettings', () => {
  let settings: TextureLockSettings;

  beforeEach(() => {
    settings = new TextureLockSettings(true);
  });

  it('should start locked by default', () => {
    expect(settings.isLocked()).toBe(true);
  });

  it('should toggle lock state', () => {
    expect(settings.toggle()).toBe(false);
    expect(settings.isLocked()).toBe(false);
    expect(settings.toggle()).toBe(true);
  });

  it('should expand world UV range when mesh scale grows under lock', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const maxUBefore = maxAbsUvComponent(mesh, 0);
    mesh.scale.x = 2;
    mesh.updateMatrixWorld(true);
    settings.rebakeMeshesIfLocked([mesh]);
    const maxUAfter = maxAbsUvComponent(mesh, 0);
    expect(maxUAfter).toBeGreaterThan(maxUBefore + 0.2);
  });

  it('should not rebake when lock is off', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    initializeMeshTextureUVs(mesh);
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const before = uv.getX(0);
    settings.setLocked(false);
    mesh.scale.set(3, 3, 3);
    settings.rebakeMeshesIfLocked([mesh]);
    expect(uv.getX(0)).toBe(before);
  });
});

/**
 * Returns the maximum absolute UV component on an axis across all vertices.
 * @param mesh Mesh with UV attribute.
 * @param component 0 for U, 1 for V.
 * @returns Max absolute component value.
 */
function maxAbsUvComponent(mesh: THREE.Mesh, component: number): number {
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
  let maxAbs = 0;
  for (let i = 0; i < uv.count; i++) {
    const value = component === 0 ? uv.getX(i) : uv.getY(i);
    maxAbs = Math.max(maxAbs, Math.abs(value));
  }
  return maxAbs;
}
