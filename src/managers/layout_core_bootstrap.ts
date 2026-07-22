import * as THREE from 'three';
import { Theme } from '../theme.js';
import { InputManager } from './input_manager.js';
import { SelectionManager } from './selection_manager.js';
import { HierarchyReparentHandler } from './hierarchy_reparent_handler.js';
import { PrimitiveCreationTool } from './primitive_creation_tool.js';
import { TransformGizmo } from '../transform/transform_gizmo.js';
import { GizmoRaycaster } from '../transform/gizmo_raycaster.js';
import { TransformExecutor } from '../transform/transform_executor.js';
import { TransformHandler } from '../transform/transform_handler.js';
import { TransformConstraint } from '../transform/transform_constraint.js';
import { GridSnap } from '../transform/grid_snap.js';
import { SnapManager } from '../transform/snap_manager.js';
import { CommandStack } from '../commands/command_stack.js';
import { TextureLockSettings } from '../texture/texture_lock_settings.js';
import { ClipPlaneTool } from './clip_plane_tool.js';
import { TerrainGenerator } from '../terrain/terrain_generator.js';
import {
  DEFAULT_COMMAND_STACK_MAX_SIZE,
  DEFAULT_GRID_SNAP_INTERVAL
} from '../types/editor_config.js';

/**
 * Core editor services created before the DOM shell exists.
 */
export interface LayoutCoreSystems {
  inputManager: InputManager;
  worldObject: THREE.Group;
  selectionManager: SelectionManager;
  primitiveTool: PrimitiveCreationTool;
  gridSnap: GridSnap;
  userSnapEnabled: boolean;
  snapManager: SnapManager;
  transformConstraint: TransformConstraint;
  transformExecutor: TransformExecutor;
  transformGizmo: TransformGizmo;
  gizmoRaycaster: GizmoRaycaster;
  commandStack: CommandStack;
  transformHandler: TransformHandler;
  textureLock: TextureLockSettings;
  hierarchyReparentHandler: HierarchyReparentHandler;
  clipPlaneTool: ClipPlaneTool;
  terrainGenerator: TerrainGenerator;
  lastTime: number;
  animationFrameId: number | null;
  resizeObserver: ResizeObserver | null;
  isDisposed: boolean;
  isRunning: boolean;
}

/**
 * Constructs core managers that do not depend on DOM layout.
 * @returns Bundle of core editor services and runtime flags.
 */
export function createLayoutCoreSystems(): LayoutCoreSystems {
  const worldObject = new THREE.Group();
  const snapBundle = createSnapAndTransformStack();
  const textureLock = new TextureLockSettings(true);
  snapBundle.transformHandler.setTextureLockSettings(textureLock);
  return {
    ...createRuntimeState(),
    ...createSceneRootServices(worldObject, snapBundle.commandStack),
    ...snapBundle,
    textureLock,
    clipPlaneTool: new ClipPlaneTool(),
    terrainGenerator: new TerrainGenerator(),
    userSnapEnabled: true
  };
}

/**
 * Creates runtime loop flags shared by the layout manager.
 * @returns Runtime state fields for core systems.
 */
function createRuntimeState(): Pick<
  LayoutCoreSystems,
  | 'inputManager'
  | 'lastTime'
  | 'animationFrameId'
  | 'resizeObserver'
  | 'isDisposed'
  | 'isRunning'
> {
  return {
    inputManager: new InputManager(),
    lastTime: performance.now(),
    animationFrameId: null,
    resizeObserver: null,
    isDisposed: false,
    isRunning: false
  };
}

/**
 * Creates world root, selection, primitive tool, and hierarchy services.
 * @param worldObject Scene root group.
 * @param commandStack Shared undo stack.
 * @returns Scene hierarchy service fields.
 */
function createSceneRootServices(
  worldObject: THREE.Group,
  commandStack: CommandStack
): Pick<
  LayoutCoreSystems,
  | 'worldObject'
  | 'selectionManager'
  | 'primitiveTool'
  | 'hierarchyReparentHandler'
> {
  return {
    worldObject,
    selectionManager: new SelectionManager(),
    primitiveTool: new PrimitiveCreationTool(worldObject),
    hierarchyReparentHandler: new HierarchyReparentHandler(
      worldObject,
      commandStack
    )
  };
}

/**
 * Creates grid snap, command stack, and transform gizmo services.
 * @returns Snap and transform subsystem bundle.
 */
function createSnapAndTransformStack(): Pick<
  LayoutCoreSystems,
  | 'gridSnap'
  | 'snapManager'
  | 'transformConstraint'
  | 'transformExecutor'
  | 'transformGizmo'
  | 'gizmoRaycaster'
  | 'commandStack'
  | 'transformHandler'
> {
  const gridSnap = new GridSnap(true, DEFAULT_GRID_SNAP_INTERVAL);
  const transformGizmo = new TransformGizmo(Theme);
  const gizmoRaycaster = new GizmoRaycaster();
  const transformConstraint = new TransformConstraint();
  const transformExecutor = new TransformExecutor(gridSnap);
  const commandStack = new CommandStack(DEFAULT_COMMAND_STACK_MAX_SIZE);
  return {
    gridSnap,
    snapManager: new SnapManager(DEFAULT_GRID_SNAP_INTERVAL),
    transformConstraint,
    transformExecutor,
    transformGizmo,
    gizmoRaycaster,
    commandStack,
    transformHandler: new TransformHandler(
      transformGizmo,
      gizmoRaycaster,
      transformExecutor,
      transformConstraint,
      commandStack
    )
  };
}
