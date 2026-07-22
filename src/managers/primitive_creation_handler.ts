import * as THREE from 'three';
import { PrimitiveCreationTool } from './primitive_creation_tool.js';
import { CreatePrimitiveCommand } from '../commands/create_primitive_command.js';
import { CommandStack } from '../commands/command_stack.js';
import { SelectionManager } from './selection_manager.js';

/**
 * Callback invoked after a primitive is created and added to the scene.
 */
export type PrimitiveCreatedCallback = () => void;

/**
 * Handles toolbar button actions for creating primitive objects.
 * Delegates primitive creation to the PrimitiveCreationTool and manages
 * command stacking, viewport sync, and selection updates.
 */
export class PrimitiveCreationHandler {
  private primitiveTool: PrimitiveCreationTool;
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private selectionManager: SelectionManager;
  private onPrimitiveCreated: PrimitiveCreatedCallback | null;

  /**
   * Creates a new primitive creation handler.
   * @param primitiveTool The tool that creates primitive meshes.
   * @param worldObject The root group that receives new primitives.
   * @param commandStack The command stack for undo support.
   * @param selectionManager The selection manager for post-creation selection.
   */
  constructor(
    primitiveTool: PrimitiveCreationTool,
    worldObject: THREE.Group,
    commandStack: CommandStack,
    selectionManager: SelectionManager
  ) {
    this.primitiveTool = primitiveTool;
    this.worldObject = worldObject;
    this.commandStack = commandStack;
    this.selectionManager = selectionManager;
    this.onPrimitiveCreated = null;
  }

  /**
   * Sets the callback invoked after any primitive is created.
   * @param callback The function to call after primitive creation.
   */
  setOnPrimitiveCreated(callback: PrimitiveCreatedCallback | null): void {
    this.onPrimitiveCreated = callback;
  }

  /**
   * Creates a cube primitive and registers it with the command stack.
   */
  createCube(): void {
    this.createPrimitive(() => this.primitiveTool.createBox(1, 1, 1), (mesh) => {
      mesh.position.y = 0.5;
    });
  }

  /**
   * Creates a sphere primitive and registers it with the command stack.
   */
  createSphere(): void {
    this.createPrimitive(() => this.primitiveTool.createSphere(0.5), (mesh) => {
      mesh.position.y = 0.5;
    });
  }

  /**
   * Creates a cylinder primitive and registers it with the command stack.
   */
  createCylinder(): void {
    this.createPrimitive(() => this.primitiveTool.createCylinder(0.5, 0.5, 1), (mesh) => {
      mesh.position.y = 0.5;
    });
  }

  /**
   * Creates a plane primitive and registers it with the command stack.
   */
  createPlane(): void {
    this.createPrimitive(() => this.primitiveTool.createPlane(2, 2), () => {});
  }

  /**
   * Generic primitive creation flow with post-creation configuration.
   * @param factory Function that creates the primitive mesh.
   * @param configure Function that configures the created mesh.
   */
  private createPrimitive(
    factory: () => THREE.Mesh,
    configure: (mesh: THREE.Mesh) => void
  ): void {
    const mesh = factory();
    configure(mesh);
    const command = new CreatePrimitiveCommand(mesh, this.worldObject);
    this.commandStack.push(command);
    this.onPrimitiveCreatedCallback();
    this.selectionManager.selectObject(mesh);
  }

  /**
    * Triggers the viewport sync and outliner refresh after primitive creation.
    */
  private onPrimitiveCreatedCallback(): void {
    if (this.onPrimitiveCreated) {
      this.onPrimitiveCreated();
    }
  }
}
