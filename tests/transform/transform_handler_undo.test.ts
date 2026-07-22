import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { TransformMode, GizmoAxis } from '../../src/types/transform_mode.js';
import { TransformGizmo } from '../../src/transform/transform_gizmo.js';
import { GizmoRaycaster } from '../../src/transform/gizmo_raycaster.js';
import { TransformExecutor } from '../../src/transform/transform_executor.js';
import { TransformConstraint } from '../../src/transform/transform_constraint.js';
import { GridSnap } from '../../src/transform/grid_snap.js';
import { TransformHandler } from '../../src/transform/transform_handler.js';
import { CommandStack } from '../../src/commands/command_stack.js';

describe('TransformHandler undo/redo', () => {
  let handler: TransformHandler;
  let gizmo: TransformGizmo;
  let raycaster: GizmoRaycaster;
  let executor: TransformExecutor;
  let constraint: TransformConstraint;
  let commandStack: CommandStack;

  beforeEach(() => {
    constraint = new TransformConstraint();
    executor = new TransformExecutor(new GridSnap(false, 1.0));
    raycaster = new GizmoRaycaster();
    gizmo = new TransformGizmo(Theme);
    commandStack = new CommandStack(64);
    handler = new TransformHandler(gizmo, raycaster, executor, constraint, commandStack);
  });

  it('should start with no commands in stack', () => {
    expect(commandStack.getUndoCount()).toBe(0);
    expect(commandStack.getRedoCount()).toBe(0);
  });

  it('should work without command stack', () => {
    const handlerNoStack = new TransformHandler(gizmo, raycaster, executor, constraint, null);
    expect(handlerNoStack.isDragging()).toBe(false);
    expect(handlerNoStack.isBusy()).toBe(false);
  });

  it('should onPointerUp with no drag produce no command', () => {
    const pivot = new THREE.Vector3();
    handler.onPointerUp(pivot, []);
    expect(commandStack.getUndoCount()).toBe(0);
  });

  it('should onPointerDown not produce a command without a handle pick', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    const handles = gizmo.getHandles();
    const mockCanvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    const mockRenderer = { domElement: mockCanvas } as unknown as THREE.WebGLRenderer;
    handler.onPointerDown(
      new THREE.PerspectiveCamera(),
      mockRenderer,
      new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }),
      handles,
      [mesh]
    );
    handler.onPointerUp(new THREE.Vector3(), [mesh]);
    expect(commandStack.getUndoCount()).toBe(0);
  });
});
