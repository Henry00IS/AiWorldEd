import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ManagerShadingMode } from '@/viewports/shading/manager_shading_mode.js';
import { ShadingMode } from '@/types/shading_mode.js';
import {
  captureSharedContentMaterials,
  clearSharedContentMaterialStoreForTests,
  releaseSharedContentMaterials,
} from '@/viewports/shared/shared_content_material_store.js';

/**
 * Snapshots content materials and applies a shading mode, like one multi-view
 * pane pass does through the shared shading pass.
 *
 * @param manager Shading manager under test.
 * @param mode Shading mode for the pass.
 */
function applyPaneShadingPass(manager: ManagerShadingMode, mode: ShadingMode): void {
  manager.snapshotMaterials();
  manager.setMode(mode);
}

/**
 * Tracks whether a material has been disposed.
 *
 * @param material Material to watch.
 * @returns Function that reports whether dispose has fired.
 */
function watchDisposal(material: THREE.Material): () => boolean {
  let disposed = false;
  material.addEventListener('dispose', () => {
    disposed = true;
  });
  return () => disposed;
}

describe('cache_shading_override_materials', () => {
  let scene: THREE.Scene;
  let manager: ManagerShadingMode;
  let mesh: THREE.Mesh;
  let contentMaterial: THREE.MeshStandardMaterial;

  beforeEach(() => {
    clearSharedContentMaterialStoreForTests();
    scene = new THREE.Scene();
    manager = new ManagerShadingMode(scene);
    contentMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), contentMaterial);
    scene.add(mesh);
  });

  afterEach(() => {
    manager.dispose();
    clearSharedContentMaterialStoreForTests();
  });

  it('should reuse one wireframe override without disposing it while panes alternate Solid and Wireframe', () => {
    applyPaneShadingPass(manager, ShadingMode.WIREFRAME);
    const wireframeOverride = mesh.material as THREE.Material;
    const isWireframeOverrideDisposed = watchDisposal(wireframeOverride);
    for (let frame = 0; frame < 50; frame++) {
      applyPaneShadingPass(manager, ShadingMode.SOLID);
      expect(mesh.material).toBe(contentMaterial);
      applyPaneShadingPass(manager, ShadingMode.WIREFRAME);
      expect(mesh.material).toBe(wireframeOverride);
    }
    expect(isWireframeOverrideDisposed()).toBe(false);
  });

  it('should mirror in-place color and map edits onto the cached flat override and flag a rebuild when the map appears', () => {
    applyPaneShadingPass(manager, ShadingMode.FLAT);
    const flatOverride = mesh.material as THREE.MeshBasicMaterial;
    expect(flatOverride.color.getHex()).toBe(contentMaterial.color.getHex());
    const versionBeforeEdit = flatOverride.version;
    const albedoMap = new THREE.Texture();
    contentMaterial.color.setHex(0x00ff00);
    contentMaterial.map = albedoMap;
    applyPaneShadingPass(manager, ShadingMode.SOLID);
    applyPaneShadingPass(manager, ShadingMode.FLAT);
    expect(mesh.material).toBe(flatOverride);
    expect(flatOverride.color.getHex()).toBe(contentMaterial.color.getHex());
    expect(flatOverride.map).toBe(albedoMap);
    expect(flatOverride.version).toBeGreaterThan(versionBeforeEdit);
  });

  it('should follow a side change on the content material and flag a rebuild', () => {
    applyPaneShadingPass(manager, ShadingMode.WIREFRAME);
    const wireframeOverride = mesh.material as THREE.Material;
    const versionBeforeEdit = wireframeOverride.version;
    contentMaterial.side = THREE.DoubleSide;
    applyPaneShadingPass(manager, ShadingMode.SOLID);
    applyPaneShadingPass(manager, ShadingMode.WIREFRAME);
    expect(wireframeOverride.side).toBe(contentMaterial.side);
    expect(wireframeOverride.version).toBeGreaterThan(versionBeforeEdit);
  });

  it('should dispose the override of a replaced content material on the next override pass', () => {
    applyPaneShadingPass(manager, ShadingMode.WIREFRAME);
    const staleOverride = mesh.material as THREE.Material;
    const isStaleOverrideDisposed = watchDisposal(staleOverride);
    applyPaneShadingPass(manager, ShadingMode.SOLID);
    mesh.material = new THREE.MeshStandardMaterial({ color: 0x0000ff });
    captureSharedContentMaterials(mesh);
    applyPaneShadingPass(manager, ShadingMode.WIREFRAME);
    expect(isStaleOverrideDisposed()).toBe(true);
    expect(mesh.material).not.toBe(staleOverride);
  });

  it('should dispose the override of a removed mesh on the next override pass', () => {
    applyPaneShadingPass(manager, ShadingMode.WIREFRAME);
    const isOverrideDisposed = watchDisposal(mesh.material as THREE.Material);
    applyPaneShadingPass(manager, ShadingMode.SOLID);
    scene.remove(mesh);
    releaseSharedContentMaterials(mesh.uuid);
    applyPaneShadingPass(manager, ShadingMode.WIREFRAME);
    expect(isOverrideDisposed()).toBe(true);
  });

  it('should build a fresh override when other code disposed the cached one', () => {
    applyPaneShadingPass(manager, ShadingMode.WIREFRAME);
    const externallyDisposedOverride = mesh.material as THREE.Material;
    externallyDisposedOverride.dispose();
    applyPaneShadingPass(manager, ShadingMode.SOLID);
    applyPaneShadingPass(manager, ShadingMode.WIREFRAME);
    expect(mesh.material).not.toBe(externallyDisposedOverride);
  });

  it('should restore content materials and dispose every cached override on dispose', () => {
    contentMaterial.map = new THREE.Texture();
    applyPaneShadingPass(manager, ShadingMode.FLAT);
    const flatOverride = mesh.material as THREE.MeshBasicMaterial;
    const isFlatOverrideDisposed = watchDisposal(flatOverride);
    manager.dispose();
    expect(isFlatOverrideDisposed()).toBe(true);
    expect(mesh.material).toBe(contentMaterial);
    expect(flatOverride.map).toBe(null);
    expect(contentMaterial.map).not.toBe(null);
  });
});
