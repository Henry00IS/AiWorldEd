import { describe, it, expect, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { DeleteObjectCommand, type DeleteSnapshot } from '../../src/commands/object/delete_object_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';
import { SelectionManager } from '../../src/selection/object/selection_manager.js';
import { installE2eTestBridge, isE2eModeEnabled } from '../../src/e2e_bridge/test_bridge.js';
import { installAppE2eTestBridge } from '../../src/e2e_bridge/app_test_bridge.js';
import type { ViewportLayoutManager } from '../../src/managers/layout/viewport_layout_manager.js';
import {
  E2E_BRIDGE_WINDOW_KEY,
  E2E_READY_WINDOW_KEY,
  type E2eTestBridgeHost,
} from '../../src/e2e_bridge/test_bridge_types.js';

/**
 * Creates a bridge host backed by real editor primitives (group, command stack,
 * selection manager) plus spied refresh and delete callbacks.
 *
 * @returns Host and the live systems used to build it.
 */
function createTestHost() {
  const worldObject = new THREE.Group();
  const commandStack = new CommandStack(50);
  const selectionManager = new SelectionManager();
  const perspectiveCamera = new THREE.PerspectiveCamera();
  const calls = { refresh: 0, delete: 0, undo: 0, redo: 0 };
  const host: E2eTestBridgeHost = {
    worldObject,
    commandStack,
    selectionManager,
    getPerspectiveCamera: () => perspectiveCamera,
    runAfterNextRender: (callback) => callback(),
    createBoxMesh: (size) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
      mesh.name = `created-box-${mesh.uuid}`;
      return mesh;
    },
    refreshAfterWorldMutation: () => calls.refresh++,
    deleteSelectedObjects: () => {
      calls.delete++;
      const snapshots = Array.from(selectionManager.getSelectedObjects(), buildDeleteSnapshot);
      commandStack.push(new DeleteObjectCommand(snapshots));
      calls.refresh++;
    },
    undoLastCommand: () => {
      calls.undo++;
      commandStack.undo();
    },
    redoLastCommand: () => {
      calls.redo++;
      commandStack.redo();
    },
  };
  return { host, worldObject, commandStack, selectionManager, perspectiveCamera, calls };
}

/**
 * Captures full mesh state for deletion, matching production snapshots.
 *
 * @param mesh Mesh about to be deleted.
 * @returns Delete command snapshot for that mesh.
 */
function buildDeleteSnapshot(mesh: THREE.Mesh): DeleteSnapshot {
  return {
    mesh,
    parent: mesh.parent,
    siblingIndex: mesh.parent ? mesh.parent.children.indexOf(mesh) : 0,
    position: mesh.position.clone(),
    rotation: mesh.quaternion.clone(),
    scale: mesh.scale.clone(),
    name: mesh.name,
    geometry: mesh.geometry.clone(),
    material: (mesh.material as THREE.Material).clone(),
  };
}

/** Removes bridge globals so every test starts from a clean window. */
function clearBridgeGlobals(): void {
  delete window[E2E_BRIDGE_WINDOW_KEY];
  delete window[E2E_READY_WINDOW_KEY];
}

afterEach(clearBridgeGlobals);

describe('isE2eModeEnabled', () => {
  it('activates only when the e2e query parameter is present', () => {
    expect(isE2eModeEnabled('?e2e=1')).toBe(true);
    expect(isE2eModeEnabled('?e2e')).toBe(true);
    expect(isE2eModeEnabled('?scene=test&e2e=1')).toBe(true);
    expect(isE2eModeEnabled('')).toBe(false);
    expect(isE2eModeEnabled('?')).toBe(false);
    expect(isE2eModeEnabled('?other=2')).toBe(false);
  });
});

describe('installE2eTestBridge gating', () => {
  it('does not access editor internals when the build flag is disabled', () => {
    const getComponentsForTesting = vi.fn();
    const layoutManager = { getComponentsForTesting } as unknown as ViewportLayoutManager;
    const bridge = installAppE2eTestBridge(layoutManager, false);
    expect(bridge).toBeNull();
    expect(getComponentsForTesting).not.toHaveBeenCalled();
  });

  it('leaves the window untouched when e2e mode is disabled', () => {
    const { host } = createTestHost();
    const bridge = installE2eTestBridge(host, '?scene=test');
    expect(bridge).toBeNull();
    expect(window[E2E_BRIDGE_WINDOW_KEY]).toBeUndefined();
    expect(window[E2E_READY_WINDOW_KEY]).toBeUndefined();
  });

  it('installs the bridge and flips the ready flag after a rendered frame', async () => {
    const { host } = createTestHost();
    const bridge = installE2eTestBridge(host, '?e2e=1');
    expect(bridge).not.toBeNull();
    expect(window[E2E_BRIDGE_WINDOW_KEY]).toBe(bridge);
    expect(window[E2E_READY_WINDOW_KEY]).toBe(true);
    expect(bridge?.isReady()).toBe(true);
    await expect(bridge!.whenReady()).resolves.toBeUndefined();
  });
});

describe('bridge scene actions', () => {
  it('reports the live perspective camera transform', () => {
    const { host, perspectiveCamera } = createTestHost();
    const bridge = installE2eTestBridge(host, '?e2e=1')!;
    expect(bridge.getPerspectiveCameraSummary()).toEqual({
      position: perspectiveCamera.position.toArray(),
      quaternion: perspectiveCamera.quaternion.toArray(),
    });
  });

  it('creates boxes through the command stack and reports them', () => {
    const { host, worldObject, selectionManager, calls } = createTestHost();
    const bridge = installE2eTestBridge(host, '?e2e=1')!;
    const initialChildCount = worldObject.children.length;
    const pendingName = `bridge-box-${worldObject.uuid}`;
    const summary = bridge.createBox({ name: pendingName });
    expect(summary.name).toBe(pendingName);
    expect(summary.type).toBe('Mesh');
    expect(worldObject.children.length).toBe(initialChildCount + 1);
    expect(worldObject.children.at(-1)?.name).toBe(pendingName);
    expect(selectionManager.getSelectedObjects().size).toBe(1);
    expect(bridge.getSelectedNames()).toEqual([pendingName]);
    expect(bridge.getSceneSummary().objects.map((object) => object.name)).toContain(pendingName);
    expect(calls.refresh).toBe(1);
    expect(bridge.canUndo()).toBe(true);
  });

  it('falls back to a production mesh name when none is provided', () => {
    const { host } = createTestHost();
    const bridge = installE2eTestBridge(host, '?e2e=1')!;
    const summary = bridge.createBox();
    expect(summary.name.length).toBeGreaterThan(0);
    expect(bridge.getSceneSummary().objects.map((object) => object.name)).toContain(summary.name);
  });

  it('selects world meshes by name and reports misses', () => {
    const { host } = createTestHost();
    const bridge = installE2eTestBridge(host, '?e2e=1')!;
    const first = bridge.createBox();
    const second = bridge.createBox();
    expect(bridge.selectByName(second.name)).toBe(true);
    expect(bridge.getSelectedNames()).toEqual([second.name]);
    expect(bridge.selectByName(first.name)).toBe(true);
    expect(bridge.getSelectedNames()).toEqual([first.name]);
    expect(bridge.selectByName(`missing-${first.name}-${second.name}`)).toBe(false);
    expect(bridge.getSelectedNames()).toEqual([first.name]);
  });

  it('undoes creation and redoes it through the host callbacks', () => {
    const { host, worldObject, calls } = createTestHost();
    const bridge = installE2eTestBridge(host, '?e2e=1')!;
    const created = bridge.createBox();
    bridge.undo();
    expect(calls.undo).toBe(1);
    expect(worldObject.children.some((child) => child.name === created.name)).toBe(false);
    expect(bridge.canRedo()).toBe(true);
    bridge.redo();
    expect(calls.redo).toBe(1);
    expect(worldObject.children.some((child) => child.name === created.name)).toBe(true);
  });

  it('deletes the selection with full undo support', () => {
    const { host, worldObject, calls } = createTestHost();
    const bridge = installE2eTestBridge(host, '?e2e=1')!;
    const kept = bridge.createBox();
    const deleted = bridge.createBox();
    expect(bridge.selectByName(deleted.name)).toBe(true);
    bridge.deleteSelected();
    expect(calls.delete).toBe(1);
    expect(worldObject.children.some((child) => child.name === deleted.name)).toBe(false);
    expect(worldObject.children.some((child) => child.name === kept.name)).toBe(true);
    bridge.undo();
    expect(worldObject.children.some((child) => child.name === deleted.name)).toBe(true);
  });
});
