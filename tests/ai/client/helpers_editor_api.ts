import * as THREE from 'three';
import { EditorApi } from '@/ai/client/editor_api.js';
import type { EditorApiHost } from '@/ai/client/editor_api_host.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ManagerSnap } from '@/transform/snap/manager_snap.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { SolidModelPanel } from '@/solid/ui/panel/solid_model_panel.js';

/** Editor API bound to a fresh world, with the parts tests inspect. */
export interface EditorApiFixture {
  api: EditorApi;
  world: THREE.Group;
  stack: CommandStack;
  host: EditorApiHost;
}

/**
 * Builds an editor API over an empty world with snapping off, so tests place
 * values exactly.
 *
 * @param overrides Host fields to replace.
 * @returns Fixture.
 */
export function editorApiFixtureCreate(overrides: Partial<EditorApiHost> = {}): EditorApiFixture {
  const world = new THREE.Group();
  const stack = new CommandStack(256);
  const selection = new ManagerSelection();
  const panel = new SolidModelPanel(document.createElement('div'), { onAddBoxBrush: () => undefined });
  const host: EditorApiHost = {
    worldObject: world,
    commandStack: stack,
    selectionManager: selection,
    solidModelController: new SolidModelController(world, stack, selection, panel),
    gridSnap: new GridSnap(false, 0.25),
    snapManager: new ManagerSnap(0.25),
    getUserSnapEnabled: () => false,
    refreshAfterWorldMutation: () => undefined,
    refreshOutliner: () => undefined,
    showStatus: () => undefined,
    ...overrides,
  };
  return { api: new EditorApi(host), world, stack, host };
}
