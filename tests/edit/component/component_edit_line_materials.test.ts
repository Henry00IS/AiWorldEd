import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ComponentEditLineMaterials,
  EDIT_LINE_CAGE_COLOR_2D,
  EDIT_LINE_CAGE_COLOR_3D,
  EDIT_LINE_SELECTED_COLOR,
  EDIT_LINE_SHARED_MATERIAL_KEY,
} from '@/edit/component/component_edit_line_materials.js';

describe('ComponentEditLineMaterials', () => {
  it('reuses shared cage, solid, and half-edge materials', () => {
    expect(ComponentEditLineMaterials.getCageMaterial()).toBe(ComponentEditLineMaterials.getCageMaterial());
    expect(ComponentEditLineMaterials.getSolidSelectedMaterial()).toBe(
      ComponentEditLineMaterials.getSolidSelectedMaterial(),
    );
    expect(ComponentEditLineMaterials.getHalfSelectedMaterial()).toBe(
      ComponentEditLineMaterials.getHalfSelectedMaterial(),
    );
    expect(ComponentEditLineMaterials.getCageMaterial()).not.toBe(
      ComponentEditLineMaterials.getSolidSelectedMaterial(),
    );
  });

  it('marks materials as shared and encodes style modes for the fragment shader', () => {
    const cage = ComponentEditLineMaterials.getCageMaterial();
    const solid = ComponentEditLineMaterials.getSolidSelectedMaterial();
    const half = ComponentEditLineMaterials.getHalfSelectedMaterial();
    expect(ComponentEditLineMaterials.isSharedMaterial(cage)).toBe(true);
    expect(cage.userData[EDIT_LINE_SHARED_MATERIAL_KEY]).toBe(true);
    expect(cage.uniforms['styleMode']!.value).toBe(0);
    expect(solid.uniforms['styleMode']!.value).toBe(1);
    expect(half.uniforms['styleMode']!.value).toBe(2);
    expect(vectorToHex(cage.uniforms['cageColor3d']!.value as THREE.Vector3)).toBe(EDIT_LINE_CAGE_COLOR_3D);
    expect(vectorToHex(cage.uniforms['cageColor2d']!.value as THREE.Vector3)).toBe(EDIT_LINE_CAGE_COLOR_2D);
    expect(vectorToHex(solid.uniforms['selectedColor']!.value as THREE.Vector3)).toBe(EDIT_LINE_SELECTED_COLOR);
  });
});

/**
 * Converts a 0–1 sRGB vector back to a hex color.
 *
 * @param rgb RGB vector.
 * @returns Hex color.
 */
function vectorToHex(rgb: THREE.Vector3): number {
  return (Math.round(rgb.x * 255) << 16) | (Math.round(rgb.y * 255) << 8) | Math.round(rgb.z * 255);
}
