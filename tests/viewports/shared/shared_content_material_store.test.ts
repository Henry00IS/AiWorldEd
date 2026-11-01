import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
  captureSharedContentMaterials,
  clearSharedContentMaterialStoreForTests,
  currentSharedContentMaterialList,
  markShadingOverrideMaterial,
} from '@/viewports/shared/shared_content_material_store.js';

afterEach(clearSharedContentMaterialStoreForTests);

/**
 * Builds a temporary shading override material.
 *
 * @returns Override material.
 */
function overrideMaterial(): THREE.Material {
  const material = new THREE.MeshBasicMaterial();
  markShadingOverrideMaterial(material);
  return material;
}

describe('currentSharedContentMaterialList', () => {
  it('returns live content materials', () => {
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(new THREE.BoxGeometry(), material);
    expect(currentSharedContentMaterialList(mesh)).toEqual([material]);
  });

  it('returns the stored content while an override is shown', () => {
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(new THREE.BoxGeometry(), material);
    captureSharedContentMaterials(mesh);
    mesh.material = overrideMaterial();
    expect(currentSharedContentMaterialList(mesh)).toEqual([material]);
  });

  it('prefers a new live content material over an older snapshot', () => {
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial(),
    );
    captureSharedContentMaterials(mesh);
    const replaced = new THREE.MeshStandardMaterial();
    mesh.material = replaced;
    expect(currentSharedContentMaterialList(mesh)).toEqual([replaced]);
  });

  it('returns nothing for an override without a snapshot', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), overrideMaterial());
    expect(currentSharedContentMaterialList(mesh)).toEqual([]);
  });
});
