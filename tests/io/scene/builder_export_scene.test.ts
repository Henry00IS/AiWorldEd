import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { buildExportScene, shouldOmitFromExport } from '@/io/scene/builder_export_scene.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import { DECORATIVE_EDGE_USERDATA_KEY } from '@/utils/mesh_edge_sync.js';

describe('export_scene_builder', () => {
  let world: THREE.Group;

  beforeEach(() => {
    world = new THREE.Group();
  });

  it('exports regular content meshes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    mesh.name = 'Cube';
    world.add(mesh);
    const exportRoot = buildExportScene(world);
    expect(exportRoot.children.length).toBe(1);
    expect(exportRoot.children[0]).toBeInstanceOf(THREE.Mesh);
    expect(exportRoot.children[0]!.name).toBe('Cube');
  });

  it('omits solid brush helpers and keeps only CSG result under solid models', () => {
    const model = new SolidModel('ExportSolid');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    world.add(model.root);
    expect(SolidBrushVisual.isBrushObject(brush.mesh!)).toBe(true);
    expect(SolidModel.isResultMesh(model.getResultMesh())).toBe(true);

    const exportRoot = buildExportScene(world);
    expect(exportRoot.children.length).toBe(1);
    const result = exportRoot.children[0] as THREE.Mesh;
    expect(result).toBeInstanceOf(THREE.Mesh);
    expect(result.name).toBe('ExportSolid');
    expect(result.children.length).toBe(0);
    expect(SolidBrushVisual.isBrushObject(result)).toBe(false);
    // Live solid root has brush + result; export must not carry brush helpers.
    const liveMeshes: THREE.Mesh[] = [];
    model.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) liveMeshes.push(obj);
    });
    expect(liveMeshes.length).toBeGreaterThan(1);
    const exportMeshes: THREE.Mesh[] = [];
    exportRoot.traverse((obj) => {
      if (obj instanceof THREE.Mesh) exportMeshes.push(obj);
    });
    expect(exportMeshes.length).toBe(1);
  });

  it('strips selection highlights and decorative edges from content meshes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
    const outline = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xff0000 }),
    );
    outline.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] = true;
    const edges = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff }));
    edges.userData[DECORATIVE_EDGE_USERDATA_KEY] = true;
    mesh.add(outline);
    mesh.add(edges);
    world.add(mesh);

    const exportRoot = buildExportScene(world);
    const exported = exportRoot.children[0] as THREE.Mesh;
    expect(exported.children.length).toBe(0);
  });

  it('keeps content meshes parented to a mesh and drops its helpers', () => {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
    marker.name = 'Marker';
    marker.position.set(0, 1.5, 0);
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    ghost.userData['isGizmoOccludedGhost'] = true;
    crate.add(marker, ghost);
    world.add(crate);

    const exported = buildExportScene(world).children[0] as THREE.Mesh;
    expect(exported.children.map((child) => child.name)).toEqual(['Marker']);
    expect(exported.children[0]!.position.y).toBe(1.5);
  });

  it('keeps a material shared by several meshes shared, so exports name it once', () => {
    const red = new THREE.MeshStandardMaterial({ color: 0xff0000, name: 'RedMat' });
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [red, new THREE.MeshStandardMaterial()]);
    world.add(a, b);

    const [exportedA, exportedB] = buildExportScene(world).children as THREE.Mesh[];
    expect(exportedA!.material).not.toBe(red);
    expect((exportedB!.material as THREE.Material[])[0]).toBe(exportedA!.material);
  });

  it('omits clip plane previews and bare brush objects', () => {
    const preview = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    preview.userData['isClipPlanePreview'] = true;
    const brush = SolidBrushVisual.createBoxPreview('Helper', 1, SolidOperation.Additive);
    world.add(preview);
    world.add(brush);
    expect(shouldOmitFromExport(preview)).toBe(true);
    expect(shouldOmitFromExport(brush)).toBe(true);
    const exportRoot = buildExportScene(world);
    expect(exportRoot.children.length).toBe(0);
  });

  it('preserves regular groups that still have content children', () => {
    const group = new THREE.Group();
    group.name = 'Props';
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshStandardMaterial());
    group.add(mesh);
    world.add(group);
    const exportRoot = buildExportScene(world);
    expect(exportRoot.children.length).toBe(1);
    expect(exportRoot.children[0]!.name).toBe('Props');
    expect((exportRoot.children[0] as THREE.Group).children.length).toBe(1);
  });
});
