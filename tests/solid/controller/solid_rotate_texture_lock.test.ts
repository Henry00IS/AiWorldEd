import { describe, it, expect } from 'vitest';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { TransformMode } from '@/types/transform_mode.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModelPanel } from '@/solid/ui/panel/solid_model_panel.js';
import * as THREE from 'three';

/**
 * Rotation must force full texture stick so unlocked stretch/pos does not
 * rewrite UV matrices mid-orbit.
 */
describe('SolidModelController rotate texture locks', () => {
  it('forces both texture locks on while transform mode is rotate', () => {
    const world = new THREE.Group();
    const stack = new CommandStack(16);
    const selection = new ManagerSelection();
    const panelHost = document.createElement('div');
    const panel = new SolidModelPanel(panelHost, { onAddBrush: () => undefined }, panelHost);
    const controller = new SolidModelController(world, stack, selection, panel);
    let mode = TransformMode.SCALE;
    controller.setTransformModeProvider(() => mode);
    // Access private method via bracket for unit coverage of lock policy.
    const getLocks = (
      controller as unknown as {
        getTextureLockFlagsForActiveTransform: () => { positionLock: boolean; stretchLock: boolean };
      }
    ).getTextureLockFlagsForActiveTransform.bind(controller);
    mode = TransformMode.SCALE;
    // Without texture lock settings, scale mode returns both off.
    expect(getLocks()).toEqual({ positionLock: false, stretchLock: false });
    mode = TransformMode.ROTATE;
    expect(getLocks()).toEqual({ positionLock: true, stretchLock: true });
    mode = TransformMode.BOUNDS;
    expect(getLocks()).toEqual({ positionLock: false, stretchLock: false });
  });
});
