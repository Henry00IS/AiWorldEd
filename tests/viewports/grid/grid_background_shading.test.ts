import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GridBackgroundShading } from '@/viewports/grid/grid_background_shading.js';
import { getThemeViewportPalette } from '@/viewports/theme/theme_viewport_palette.js';

/**
 * Builds a camera looking down -Z whose view spans -10..10 on both axes.
 *
 * @returns Updated orthographic camera.
 */
function cameraCreate(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

describe('GridBackgroundShading', () => {
  it('passes colors through unchanged when the theme has no gradient', () => {
    const shading = new GridBackgroundShading();
    shading.sync(getThemeViewportPalette('dark'), cameraCreate());
    const line = new THREE.Color(0.3, 0.4, 0.5);
    const result = shading.endpointColor(new THREE.Vector3(0, 10, 0), line, 1, new THREE.Color());
    expect(shading.isActive()).toBe(false);
    expect(result.equals(line)).toBe(true);
  });

  it('swaps the flat background share for the gradient color at screen height', () => {
    const palette = getThemeViewportPalette('light');
    const shading = new GridBackgroundShading();
    shading.sync(palette, cameraCreate());
    const flat = new THREE.Color().setHex(palette.viewportBackground);
    const top = shading.endpointColor(new THREE.Vector3(0, 10, 0), flat, 1, new THREE.Color());
    const bottom = shading.endpointColor(new THREE.Vector3(0, -10, 0), flat, 1, new THREE.Color());
    const expectedTop = new THREE.Color().setHex(palette.viewportGradientTop ?? 0);
    const expectedBottom = new THREE.Color().setHex(palette.viewportGradientBottom ?? 0);
    expect(shading.isActive()).toBe(true);
    expect(top.r).toBeCloseTo(expectedTop.r, 5);
    expect(top.b).toBeCloseTo(expectedTop.b, 5);
    expect(bottom.g).toBeCloseTo(expectedBottom.g, 5);
  });

  it('leaves full-strength line colors untouched on a gradient', () => {
    const shading = new GridBackgroundShading();
    shading.sync(getThemeViewportPalette('light'), cameraCreate());
    const line = new THREE.Color(0.2, 0.2, 0.2);
    const result = shading.endpointColor(new THREE.Vector3(0, 10, 0), line, 0, new THREE.Color());
    expect(result.equals(line)).toBe(true);
  });
});
