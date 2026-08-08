import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { rebuildDecorativeEdges, DECORATIVE_EDGE_USERDATA_KEY } from '@/utils/mesh_edge_sync.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import {
  EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY,
  isEditModeWireframeSuppressed,
} from '@/utils/edit_mode_wireframe_suppress.js';
import { EditModeObjectWireframeHide } from '@/edit/session/edit_mode_object_wireframe_hide.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushEdgeBatch, SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY } from '@/solid/model/solid_brush_edge_batch.js';
import { SOLID_BRUSH_EDGE_USERDATA_KEY } from '@/solid/model/solid_brush_edge_materials.js';

describe('EditModeObjectWireframeHide', () => {
  it('hides decorative content edges for domain meshes and restores them', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    rebuildDecorativeEdges(mesh);
    const decorative = mesh.children.find(
      (child) => child.userData[DECORATIVE_EDGE_USERDATA_KEY] === true,
    ) as THREE.Object3D;
    expect(decorative).toBeDefined();
    expect(decorative.visible).toBe(true);
    const hide = new EditModeObjectWireframeHide();
    hide.hideForDomain([{ kind: 'content_mesh', mesh, targetId: mesh.uuid }]);
    expect(decorative.visible).toBe(false);
    expect(isEditModeWireframeSuppressed(decorative)).toBe(true);
    hide.restore();
    expect(decorative.visible).toBe(true);
    expect(isEditModeWireframeSuppressed(decorative)).toBe(false);
    mesh.geometry.dispose();
  });

  it('hides selection outline groups and unmarked line helpers on domain meshes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const outlineGroup = new THREE.Group();
    outlineGroup.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] = true;
    const outlineLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xff0000 }),
    );
    outlineGroup.add(outlineLine);
    mesh.add(outlineGroup);
    const unmarked = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 1),
      new THREE.LineBasicMaterial({ color: 0xaaaaaa }),
    );
    mesh.add(unmarked);
    const hide = new EditModeObjectWireframeHide();
    hide.hideForDomain([{ kind: 'content_mesh', mesh, targetId: mesh.uuid }]);
    expect(outlineGroup.visible).toBe(false);
    expect(unmarked.visible).toBe(false);
    expect(outlineGroup.userData[EDIT_MODE_WIREFRAME_SUPPRESSED_USERDATA_KEY]).toBe(true);
    hide.restore();
    expect(outlineGroup.visible).toBe(true);
    expect(unmarked.visible).toBe(true);
    mesh.geometry.dispose();
    unmarked.geometry.dispose();
  });

  it('keeps sibling brush wireframe batches when only one brush is in domain', () => {
    const model = new SolidModel('EditWireframeSolid');
    const brushA = model.addBoxBrush(2, SolidOperation.Additive);
    const brushB = model.addBoxBrush(2, SolidOperation.Additive);
    brushB.mesh!.position.set(4, 0, 0);
    brushB.mesh!.updateMatrixWorld(true);
    model.rebuild(true);
    SolidBrushEdgeBatch.rebuildForSolidRoot(model.root);
    const batchesBefore = model.root.children.filter(
      (child) => child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true,
    );
    expect(batchesBefore.length).toBeGreaterThan(0);
    const hide = new EditModeObjectWireframeHide();
    hide.hideForDomain([
      {
        kind: 'brush',
        solidModel: model,
        brushId: brushA.id,
        targetId: `brush:${brushA.id}`,
        resultMesh: model.getResultMesh(),
      },
    ]);
    const personalOnA = brushA.mesh!.children.filter((child) => child.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true);
    expect(personalOnA.length).toBeGreaterThan(0);
    personalOnA.forEach((edge) => {
      expect(edge.visible).toBe(false);
      expect(isEditModeWireframeSuppressed(edge)).toBe(true);
    });
    const batches = model.root.children.filter((child) => child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true);
    expect(batches.length).toBeGreaterThan(0);
    batches.forEach((batch) => {
      expect(batch.visible).toBe(true);
      expect(isEditModeWireframeSuppressed(batch)).toBe(false);
    });
    hide.restore();
  });

  it('removes static batches when every brush of the solid is in domain', () => {
    const model = new SolidModel('EditWireframeWholeSolid');
    const brushA = model.addBoxBrush(2, SolidOperation.Additive);
    const brushB = model.addBoxBrush(2, SolidOperation.Additive);
    brushB.mesh!.position.set(3, 0, 0);
    brushB.mesh!.updateMatrixWorld(true);
    model.rebuild(true);
    SolidBrushEdgeBatch.rebuildForSolidRoot(model.root);
    expect(model.root.children.some((child) => child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true)).toBe(
      true,
    );
    const hide = new EditModeObjectWireframeHide();
    hide.hideForDomain([
      {
        kind: 'brush',
        solidModel: model,
        brushId: brushA.id,
        targetId: `brush:${brushA.id}`,
        resultMesh: model.getResultMesh(),
      },
      {
        kind: 'brush',
        solidModel: model,
        brushId: brushB.id,
        targetId: `brush:${brushB.id}`,
        resultMesh: model.getResultMesh(),
      },
    ]);
    const liveBatches = model.root.children.filter(
      (child) => child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true,
    );
    for (const batch of liveBatches) {
      expect(batch.visible).toBe(false);
      expect(isEditModeWireframeSuppressed(batch)).toBe(true);
    }
    const personalEdges = [...brushA.mesh!.children, ...brushB.mesh!.children].filter(
      (child) => child.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] === true,
    );
    expect(personalEdges.length).toBeGreaterThan(0);
    personalEdges.forEach((edge) => {
      expect(edge.visible).toBe(false);
      expect(isEditModeWireframeSuppressed(edge)).toBe(true);
    });
    hide.restore();
  });
});
