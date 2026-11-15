import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { SolidModelPanel } from '@/solid/ui/panel/solid_model_panel.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { EditorOrientation } from '@/navigation/orientation/editor_orientation.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import {
  buildDefaultWorldBasis,
  buildEdgeAlignedOrientation,
} from '@/navigation/orientation/editor_orientation_edge_align.js';

/**
 * Builds a solid model controller with a selected solid and mocked panel.
 *
 * @param world World root.
 * @param model Solid model parented under world.
 * @returns Controller under test.
 */
function createController(world: THREE.Group, model: SolidModel): SolidModelController {
  const selection = new ManagerSelection();
  const panel = {
    refresh: vi.fn(),
    isOpen: () => false,
    toggle: vi.fn(),
    bindModel: vi.fn(),
    setModel: vi.fn(),
  } as unknown as SolidModelPanel;
  const controller = new SolidModelController(world, new CommandStack(16), selection, panel);
  world.add(model.root);
  const brushMesh = model.getBrushes()[0]?.mesh;
  if (brushMesh) {
    selection.selectObject(brushMesh);
  }
  return controller;
}

describe('SolidModelController box brush grid orientation', () => {
  it('orients a new box brush to the working grid axes', () => {
    const world = new THREE.Group();
    const model = new SolidModel('OrientedSpawn');
    model.addBoxBrush(2, SolidOperation.Additive);
    const controller = createController(world, model);
    const edge = new THREE.Vector3(1, 0, 1).normalize();
    const outcome = buildEdgeAlignedOrientation('z', edge, buildDefaultWorldBasis(), edge, new THREE.Vector3());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const orientation = new EditorOrientation();
    orientation.setOrientationAndFrame(outcome.quaternion, outcome.planeFrame);
    controller.setGridOrientationProvider(() => orientation);
    controller.setActiveCameraProvider(() => {
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      camera.position.set(0, 5, 12);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      return camera;
    });
    controller.setGridIntervalProvider(() => 1);
    const beforeCount = model.getBrushCount();
    controller.addBrush();
    expect(model.getBrushCount()).toBe(beforeCount + 1);
    const created = model.getBrushes()[model.getBrushCount() - 1]!;
    created.mesh!.updateMatrixWorld(true);
    const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(created.mesh!.quaternion);
    const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(created.mesh!.quaternion);
    const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(created.mesh!.quaternion);
    expect(localX.distanceTo(outcome.basis.xAxis)).toBeLessThan(1e-5);
    expect(localY.distanceTo(outcome.basis.yAxis)).toBeLessThan(1e-5);
    expect(localZ.distanceTo(outcome.basis.zAxis)).toBeLessThan(1e-5);
  });

  it('snaps the spawn position onto the oriented grid lattice', () => {
    const world = new THREE.Group();
    const model = new SolidModel('OrientedSnap');
    model.addBoxBrush(2, SolidOperation.Additive);
    const controller = createController(world, model);
    const orientation = new EditorOrientation();
    orientation.setPlaneOrigin(new THREE.Vector3(0.5, 0, 0.5));
    const gridSnap = new GridSnap(true, 1);
    gridSnap.setPlaneFrame(orientation.getPlaneFrame());
    controller.setGridOrientationProvider(() => orientation);
    controller.setGridSnapProvider(() => gridSnap);
    controller.setActiveCameraProvider(() => {
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      camera.position.set(0, 4, 10);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      return camera;
    });
    controller.addBrush();
    const created = model.getBrushes()[model.getBrushCount() - 1]!;
    const position = created.position.clone();
    gridSnap.snapWorldPosition(position);
    expect(created.position.distanceTo(position)).toBeLessThan(1e-6);
  });
});
