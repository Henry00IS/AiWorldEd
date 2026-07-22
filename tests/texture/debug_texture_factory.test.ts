import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  getDebugCheckerTexture,
  disposeDebugCheckerTexture,
  getDebugCheckerCellCount
} from '../../src/texture/debug_texture_factory.js';

describe('debug_texture_factory', () => {
  afterEach(() => {
    disposeDebugCheckerTexture();
  });

  it('should return a shared canvas texture', () => {
    const a = getDebugCheckerTexture();
    const b = getDebugCheckerTexture();
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(THREE.CanvasTexture);
  });

  it('should use repeat wrapping and nearest filtering', () => {
    const texture = getDebugCheckerTexture();
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    expect(texture.magFilter).toBe(THREE.NearestFilter);
  });

  it('should use a 4x4 checker cell layout', () => {
    expect(getDebugCheckerCellCount()).toBe(4);
  });
});
