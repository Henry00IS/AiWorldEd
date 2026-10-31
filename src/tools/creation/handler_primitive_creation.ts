import * as THREE from 'three';
import { ToolPrimitiveCreation } from './tool_primitive_creation.js';
import { CommandPrimitiveCreate } from '@/tools/creation/commands/command_primitive_create.js';
import { CommandModifierBevelVolumeCreate } from '@/modifier/volume/command_modifier_bevel_volume_create.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import {
  computeOcclusionAwareSpawnPosition,
  DEFAULT_SPAWN_DISTANCE,
} from '@/navigation/placement/object_spawn_placement.js';

/** Callback invoked after a primitive is created and added to the scene. */
export type PrimitiveCreatedCallback = () => void;

/** Callback that writes a feedback message to the status bar. */
export type PrimitiveStatusMessageCallback = (message: string) => void;

/**
 * Handles toolbar button actions for creating primitive objects. Delegates
 * primitive creation to the PrimitiveCreationTool and manages command stacking,
 * viewport sync, and selection updates.
 */
export class HandlerPrimitiveCreation {
  private primitiveTool: ToolPrimitiveCreation;
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private selectionManager: ManagerSelection;
  private onPrimitiveCreated: PrimitiveCreatedCallback | null;
  private getActiveCamera: (() => THREE.Camera | null) | null;
  private getGridInterval: (() => number) | null;
  private showStatusMessage: PrimitiveStatusMessageCallback | null;

  /**
   * Creates a new primitive creation handler.
   *
   * @param primitiveTool The tool that creates primitive meshes.
   * @param worldObject The root group that receives new primitives.
   * @param commandStack The command stack for undo support.
   * @param selectionManager The selection manager for post-creation selection.
   */
  constructor(
    primitiveTool: ToolPrimitiveCreation,
    worldObject: THREE.Group,
    commandStack: CommandStack,
    selectionManager: ManagerSelection,
  ) {
    this.primitiveTool = primitiveTool;
    this.worldObject = worldObject;
    this.commandStack = commandStack;
    this.selectionManager = selectionManager;
    this.onPrimitiveCreated = null;
    this.getActiveCamera = null;
    this.getGridInterval = null;
    this.showStatusMessage = null;
  }

  /**
   * Sets the callback invoked after any primitive is created.
   *
   * @param callback The function to call after primitive creation.
   */
  setOnPrimitiveCreated(callback: PrimitiveCreatedCallback | null): void {
    this.onPrimitiveCreated = callback;
  }

  /**
   * Sets the callback that reports created primitives in the status bar.
   *
   * @param callback Receives the feedback message, or null to stay silent.
   */
  setShowStatusMessage(callback: PrimitiveStatusMessageCallback | null): void {
    this.showStatusMessage = callback;
  }

  /**
   * Provides the active view camera used for spawn placement.
   *
   * @param callback Returns the camera, or null when unavailable.
   */
  setActiveCameraProvider(callback: (() => THREE.Camera | null) | null): void {
    this.getActiveCamera = callback;
  }

  /**
   * Provides the current grid interval for snapping spawn positions.
   *
   * @param callback Returns a positive grid step.
   */
  setGridIntervalProvider(callback: (() => number) | null): void {
    this.getGridInterval = callback;
  }

  /** Creates a cube primitive and registers it with the command stack. */
  createCube(): void {
    this.createPrimitive(() => this.primitiveTool.createBox(1, 1, 1), 0.5);
  }

  /** Creates a sphere primitive and registers it with the command stack. */
  createSphere(): void {
    this.createPrimitive(() => this.primitiveTool.createSphere(0.5), 0.5);
  }

  /** Creates a cylinder primitive and registers it with the command stack. */
  createCylinder(): void {
    this.createPrimitive(() => this.primitiveTool.createCylinder(0.5, 0.5, 1), 0.5);
  }

  /** Creates a plane primitive and registers it with the command stack. */
  createPlane(): void {
    this.createPrimitive(() => this.primitiveTool.createPlane(2, 2), 1);
  }

  /** Creates a bevel volume and registers it with the command stack. */
  createBevelVolume(): void {
    if (this.selectionManager.isSelectionChangeLocked()) {
      this.selectionManager.notifySelectionChangeBlocked();
      return;
    }
    const mesh = ModifierVolumeBevel.create();
    this.applySpawnPlacementIgnoringVolumes(mesh, 0.5);
    const command = new CommandModifierBevelVolumeCreate(mesh, this.worldObject);
    this.commandStack.push(command);
    this.onPrimitiveCreatedCallback();
    this.selectionManager.selectObject(mesh);
    this.statusMessageCreatedShow(mesh);
  }

  /**
   * Generic primitive creation flow with view-ray, grid-snapped placement.
   *
   * @param factory Function that creates the primitive mesh.
   * @param objectRadius Approximate half-extent used for wall clearance.
   */
  private createPrimitive(factory: () => THREE.Mesh, objectRadius: number): void {
    if (this.selectionManager.isSelectionChangeLocked()) {
      this.selectionManager.notifySelectionChangeBlocked();
      return;
    }
    const mesh = factory();
    this.applySpawnPlacement(mesh, objectRadius);
    const command = new CommandPrimitiveCreate(mesh, this.worldObject);
    this.commandStack.push(command);
    this.onPrimitiveCreatedCallback();
    this.selectionManager.selectObject(mesh);
    this.statusMessageCreatedShow(mesh);
  }

  /**
   * Positions a mesh on the view ray without letting modifier volumes block it.
   *
   * @param mesh Newly created mesh to position.
   * @param objectRadius Approximate half-extent for surface clearance.
   */
  private applySpawnPlacementIgnoringVolumes(mesh: THREE.Mesh, objectRadius: number): void {
    this.applySpawnPlacement(mesh, objectRadius, true);
  }

  /**
   * Positions a mesh in front of the active camera, snapped to the grid, and
   * pulled forward when geometry occludes the preferred spawn distance.
   *
   * @param mesh Newly created mesh to position.
   * @param objectRadius Approximate half-extent for surface clearance.
   * @param ignoreModifierVolumes True when modifier volumes are not blockers.
   */
  private applySpawnPlacement(mesh: THREE.Mesh, objectRadius: number, ignoreModifierVolumes = false): void {
    const camera = this.getActiveCamera?.() ?? null;
    if (!camera) {
      mesh.position.set(0, 0, 0);
      return;
    }
    this.placeMeshOnViewRay(mesh, camera, objectRadius, ignoreModifierVolumes);
  }

  /**
   * Copies a view-ray spawn into the mesh in parent-local space.
   *
   * @param mesh Newly created mesh to position.
   * @param camera Active view camera.
   * @param objectRadius Approximate half-extent for surface clearance.
   * @param ignoreModifierVolumes True when modifier volumes are not blockers.
   */
  private placeMeshOnViewRay(
    mesh: THREE.Mesh,
    camera: THREE.Camera,
    objectRadius: number,
    ignoreModifierVolumes: boolean,
  ): void {
    const spawn = this.computeSpawnPosition(camera, objectRadius, ignoreModifierVolumes);
    this.worldObject.updateMatrixWorld(true);
    this.worldObject.worldToLocal(spawn);
    mesh.position.copy(spawn);
    mesh.updateMatrixWorld(true);
  }

  /**
   * Computes a parent-world spawn along the active view ray.
   *
   * @param camera Active view camera.
   * @param objectRadius Approximate half-extent for surface clearance.
   * @param ignoreModifierVolumes True when modifier volumes are not blockers.
   * @returns World-space spawn position.
   */
  private computeSpawnPosition(
    camera: THREE.Camera,
    objectRadius: number,
    ignoreModifierVolumes: boolean,
  ): THREE.Vector3 {
    return computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: DEFAULT_SPAWN_DISTANCE,
      gridInterval: this.getGridInterval?.() ?? 1,
      raycastRoot: this.worldObject,
      objectRadius,
      ignoreModifierVolumes,
    });
  }

  /**
   * Reports the newly created object by name in the status bar.
   *
   * @param mesh The mesh that was just created.
   */
  private statusMessageCreatedShow(mesh: THREE.Mesh): void {
    this.showStatusMessage?.(`Created ${mesh.name}`);
  }

  /** Triggers the viewport sync and outliner refresh after primitive creation. */
  private onPrimitiveCreatedCallback(): void {
    if (this.onPrimitiveCreated) {
      this.onPrimitiveCreated();
    }
  }
}
