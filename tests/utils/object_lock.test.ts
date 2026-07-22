import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  filterUnlockedObjects,
  isObjectLocked,
  isObjectOrAncestorLocked,
  setObjectLocked,
  toggleObjectLocked
} from '../../src/utils/object_lock.js';

describe('object_lock', () => {
  it('should default objects to unlocked', () => {
    const mesh = new THREE.Mesh();
    expect(isObjectLocked(mesh)).toBe(false);
  });

  it('should set and clear the lock flag', () => {
    const mesh = new THREE.Mesh();
    setObjectLocked(mesh, true);
    expect(isObjectLocked(mesh)).toBe(true);
    setObjectLocked(mesh, false);
    expect(isObjectLocked(mesh)).toBe(false);
  });

  it('should toggle lock state', () => {
    const mesh = new THREE.Mesh();
    expect(toggleObjectLocked(mesh)).toBe(true);
    expect(isObjectLocked(mesh)).toBe(true);
    expect(toggleObjectLocked(mesh)).toBe(false);
    expect(isObjectLocked(mesh)).toBe(false);
  });

  it('should treat descendants of locked groups as locked', () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh();
    group.add(mesh);
    setObjectLocked(group, true);
    expect(isObjectOrAncestorLocked(mesh)).toBe(true);
  });

  it('should filter locked objects from a list', () => {
    const free = new THREE.Mesh();
    const locked = new THREE.Mesh();
    setObjectLocked(locked, true);
    const result = filterUnlockedObjects([free, locked]);
    expect(result).toEqual([free]);
  });
});
