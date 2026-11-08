import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ManagerShadingMode } from '@/viewports/shading/manager_shading_mode.js';
import { ShadingMode } from '@/types/shading_mode.js';
import { clearSharedContentMaterialStoreForTests } from '@/viewports/shared/shared_content_material_store.js';
import { isContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';
import { Theme } from '@/theme.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';

describe('ShadingModeManager', () => {
  let scene: THREE.Scene;
  let manager: ManagerShadingMode;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;
  let materialA: THREE.MeshStandardMaterial;
  let materialB: THREE.MeshStandardMaterial;

  beforeEach(() => {
    clearSharedContentMaterialStoreForTests();
    scene = new THREE.Scene();
    manager = new ManagerShadingMode(scene);
    materialA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    materialB = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materialA);
    meshB = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), materialB);
  });

  afterEach(() => {
    manager.dispose();
    clearSharedContentMaterialStoreForTests();
  });

  describe('snapshotMaterials', () => {
    it('should capture materials after meshes are added', () => {
      scene.add(meshA);
      scene.add(meshB);
      manager.snapshotMaterials();
      expect(materialA.wireframe).toBe(false);
      expect(materialB.wireframe).toBe(false);
    });

    it('should handle multiple meshes correctly', () => {
      const meshC = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x0000ff }));
      scene.add(meshA);
      scene.add(meshB);
      scene.add(meshC);
      manager.snapshotMaterials();
      manager.setMode(ShadingMode.WIREFRAME);
      expect((meshA.material as THREE.Material).colorWrite).toBe(false);
      expect((meshB.material as THREE.Material).colorWrite).toBe(false);
      expect((meshC.material as THREE.Material).colorWrite).toBe(false);
    });
  });

  describe('WIREFRAME mode', () => {
    beforeEach(() => {
      scene.add(meshA);
      scene.add(meshB);
      manager.snapshotMaterials();
    });

    it('should replace materials with outline-only surface materials', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
      expect(meshB.material instanceof THREE.MeshBasicMaterial).toBe(true);
      expect((meshA.material as THREE.Material).colorWrite).toBe(false);
      expect((meshB.material as THREE.Material).colorWrite).toBe(false);
    });

    it('should not use triangle wireframe on content materials', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      expect((meshA.material as THREE.MeshBasicMaterial).wireframe).toBe(false);
      expect((meshB.material as THREE.MeshBasicMaterial).wireframe).toBe(false);
    });

    it('does not write depth so wire lines stay visible through invisible shells', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      expect((meshA.material as THREE.Material).depthWrite).toBe(false);
      expect((meshB.material as THREE.Material).depthWrite).toBe(false);
      expect((meshA.material as THREE.Material).depthTest).toBe(false);
      expect((meshB.material as THREE.Material).depthTest).toBe(false);
    });

    it('should leave decorative edge children visible', () => {
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(meshA.geometry),
        new THREE.LineBasicMaterial({ color: 0xffffff }),
      );
      edge.userData['isDecorativeEdge'] = true;
      meshA.add(edge);
      manager.setMode(ShadingMode.WIREFRAME);
      expect(edge.visible).toBe(true);
      expect(edge.parent).toBe(meshA);
    });
  });

  describe('FLAT mode', () => {
    beforeEach(() => {
      scene.add(meshA);
      scene.add(meshB);
      manager.snapshotMaterials();
    });

    it('should replace materials with unlit MeshBasicMaterial', () => {
      manager.setMode(ShadingMode.FLAT);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
      expect(meshB.material instanceof THREE.MeshBasicMaterial).toBe(true);
    });

    it('should not capture wireframe overrides as content for another manager', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      const second = new ManagerShadingMode(scene);
      second.snapshotMaterials();
      second.setMode(ShadingMode.FLAT);
      expect((meshA.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xff0000);
      expect((meshA.material as THREE.Material).colorWrite).not.toBe(false);
      second.dispose();
    });

    it('should keep content albedo colors at full brightness (unlit)', () => {
      manager.setMode(ShadingMode.FLAT);
      const colorA = (meshA.material as THREE.MeshBasicMaterial).color;
      const colorB = (meshB.material as THREE.MeshBasicMaterial).color;
      expect(colorA.getHex()).toBe(0xff0000);
      expect(colorB.getHex()).toBe(0x00ff00);
    });

    it('should use independent flat material instances per mesh', () => {
      manager.setMode(ShadingMode.FLAT);
      expect(meshA.material).not.toBe(meshB.material);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
      expect(meshB.material instanceof THREE.MeshBasicMaterial).toBe(true);
    });

    it('should not let disposing one flat mesh material affect the other', () => {
      manager.setMode(ShadingMode.FLAT);
      const materialB = meshB.material as THREE.MeshBasicMaterial;
      (meshA.material as THREE.Material).dispose();
      expect(materialB.color.getHex()).toBe(0x00ff00);
    });
  });

  describe('SOLID mode', () => {
    beforeEach(() => {
      scene.add(meshA);
      scene.add(meshB);
      manager.snapshotMaterials();
    });

    it('should restore original materials after WIREFRAME', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(meshB.material).toBe(materialB);
      expect(materialA.wireframe).toBe(false);
      expect(materialB.wireframe).toBe(false);
    });

    it('should restore original materials after FLAT', () => {
      manager.setMode(ShadingMode.FLAT);
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(meshB.material).toBe(materialB);
    });

    it('should restore original color after FLAT mode', () => {
      manager.setMode(ShadingMode.FLAT);
      manager.setMode(ShadingMode.SOLID);
      expect(materialA.color.getHex()).toBe(0xff0000);
      expect(materialB.color.getHex()).toBe(0x00ff00);
    });

    it('should be a no-op when already in SOLID mode', () => {
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(materialA.wireframe).toBe(false);
    });
  });

  describe('roundtrip', () => {
    beforeEach(() => {
      scene.add(meshA);
      scene.add(meshB);
      manager.snapshotMaterials();
    });

    it('should survive SOLID to WIREFRAME to SOLID roundtrip', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      expect((meshA.material as THREE.Material).colorWrite).toBe(false);
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(materialA.wireframe).toBe(false);
      expect((meshA.material as THREE.Material).colorWrite).toBe(true);
    });

    it('should survive SOLID to FLAT to SOLID roundtrip', () => {
      manager.setMode(ShadingMode.FLAT);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(materialA.color.getHex()).toBe(0xff0000);
    });

    it('should survive SOLID to WIREFRAME to FLAT to SOLID roundtrip', () => {
      manager.setMode(ShadingMode.WIREFRAME);
      manager.setMode(ShadingMode.FLAT);
      manager.setMode(ShadingMode.SOLID);
      expect(meshA.material).toBe(materialA);
      expect(meshB.material).toBe(materialB);
      expect(materialA.wireframe).toBe(false);
    });

    it('should survive FLAT to WIREFRAME to FLAT roundtrip', () => {
      manager.setMode(ShadingMode.FLAT);
      manager.setMode(ShadingMode.WIREFRAME);
      manager.setMode(ShadingMode.FLAT);
      expect(meshA.material instanceof THREE.MeshBasicMaterial).toBe(true);
      expect((meshA.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xff0000);
    });
  });

  describe('editor helper exclusion', () => {
    it('should not apply outline-only materials to bounds resize handles', () => {
      const gizmoRoot = new THREE.Group();
      gizmoRoot.name = 'gizmo_transform_viewport';
      const handleMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const handleMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), handleMaterial);
      handleMesh.name = 'bounds_handle_pos_x';
      handleMesh.userData['handleId'] = 1;
      gizmoRoot.add(handleMesh);
      scene.add(meshA);
      scene.add(gizmoRoot);
      manager.snapshotMaterials();
      manager.setMode(ShadingMode.WIREFRAME);
      expect((meshA.material as THREE.Material).colorWrite).toBe(false);
      expect(handleMesh.material).toBe(handleMaterial);
      expect(handleMaterial.colorWrite).toBe(true);
      manager.setMode(ShadingMode.SOLID);
      expect(handleMesh.material).toBe(handleMaterial);
    });

    it('should not replace bounds handle materials in FLAT mode', () => {
      const gizmoRoot = new THREE.Group();
      gizmoRoot.name = 'gizmo_bounds';
      const handleMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const handleMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), handleMaterial);
      handleMesh.userData['handleId'] = 2;
      gizmoRoot.add(handleMesh);
      scene.add(meshA);
      scene.add(gizmoRoot);
      manager.snapshotMaterials();
      manager.setMode(ShadingMode.FLAT);
      expect(meshA.material).not.toBe(materialA);
      expect(handleMesh.material).toBe(handleMaterial);
    });

    it('should leave shared gizmo materials solid after content wireframe roundtrip', () => {
      const masterMaterial = new THREE.MeshBasicMaterial({ color: 0x3366ff });
      const masterHandle = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), masterMaterial);
      masterHandle.userData['handleId'] = 3;
      const viewportClone = masterHandle.clone(true);
      const gizmoRoot = new THREE.Group();
      gizmoRoot.name = 'gizmo_transform_viewport';
      gizmoRoot.add(viewportClone);
      scene.add(meshA);
      scene.add(gizmoRoot);
      manager.snapshotMaterials();
      manager.setMode(ShadingMode.WIREFRAME);
      manager.setMode(ShadingMode.SOLID);
      expect(masterMaterial.wireframe).toBe(false);
      expect((viewportClone.material as THREE.MeshBasicMaterial).wireframe).toBe(false);
    });

    it('should report bounds handles as shading-exempt', () => {
      const handleMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      handleMesh.userData['handleId'] = 9;
      expect(manager.isShadingExempt(handleMesh)).toBe(true);
      expect(manager.isShadingExempt(meshA)).toBe(false);
    });

    it('should report solid brush helpers as shading-exempt', () => {
      const brushMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      brushMesh.userData['isSolidBrush'] = true;
      expect(manager.isShadingExempt(brushMesh)).toBe(true);
    });
  });
});

describe('ShadingModeManager CLAY mode and modifier volume boxes', () => {
  let scene: THREE.Scene;
  let manager: ManagerShadingMode;
  let content: THREE.Mesh;
  let contentMaterial: THREE.MeshStandardMaterial;

  beforeEach(() => {
    clearSharedContentMaterialStoreForTests();
    scene = new THREE.Scene();
    manager = new ManagerShadingMode(scene);
    contentMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, map: new THREE.Texture() });
    content = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), contentMaterial);
    scene.add(content);
  });

  afterEach(() => {
    manager.dispose();
    clearSharedContentMaterialStoreForTests();
  });

  it('CLAY replaces content with an untextured neutral lit material and keeps smoothing normals', () => {
    const normalsBefore = content.geometry.getAttribute('normal');
    manager.snapshotMaterials();
    manager.setMode(ShadingMode.CLAY);
    const clay = content.material as THREE.Material;
    expect(isContentViewLitMaterial(clay)).toBe(true);
    if (!isContentViewLitMaterial(clay)) return;
    expect(clay.map).toBeNull();
    expect(clay.color.getHex()).toBe(Theme.shadingClaySurfaceColor);
    expect(content.geometry.getAttribute('normal')).toBe(normalsBefore);
  });

  it('CLAY restores the original material when switching back to SOLID', () => {
    manager.snapshotMaterials();
    manager.setMode(ShadingMode.CLAY);
    manager.setMode(ShadingMode.SOLID);
    expect(content.material).toBe(contentMaterial);
  });

  it('CLAY leaves brush helper hulls and their wires untouched', () => {
    const brush = SolidBrushVisual.createBoxPreview('clay_brush', 1, SolidOperation.Additive);
    const brushMaterial = brush.material;
    scene.add(brush);
    manager.snapshotMaterials();
    manager.setMode(ShadingMode.CLAY);
    expect(brush.material).toBe(brushMaterial);
  });

  it.each([ModifierVolume.create({}), ModifierVolume.create({ role: 'generator' })])(
    'never draws a modifier volume or generator box fill opaquely in any mode',
    (volume) => {
      scene.add(volume);
      manager.snapshotMaterials();
      for (const mode of Object.values(ShadingMode)) {
        manager.setMode(mode);
        const materials = Array.isArray(volume.material) ? volume.material : [volume.material];
        for (const material of materials) {
          expect(material.transparent || !material.colorWrite).toBe(true);
        }
      }
    },
  );

  it.each(Object.values(ShadingMode))(
    '%s keeps modifier volume and generator boxes on their own fill and outline, like brush hulls',
    (mode) => {
      const volume = ModifierVolume.create({});
      const generator = ModifierVolume.create({ role: 'generator' });
      const ownMaterials = [volume.material, generator.material];
      scene.add(volume, generator);
      manager.snapshotMaterials();
      manager.setMode(mode);
      expect(volume.material).toBe(ownMaterials[0]);
      expect(generator.material).toBe(ownMaterials[1]);
      expect(manager.isShadingExempt(volume)).toBe(true);
      for (const node of [volume, generator]) {
        expect((node.material as THREE.Material).visible).toBe(false);
        expect(node.children.find((child) => child instanceof THREE.LineSegments)?.visible).toBe(true);
      }
    },
  );
});
