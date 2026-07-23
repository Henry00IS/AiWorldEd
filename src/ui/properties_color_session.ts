import * as THREE from 'three';
import { CommandStack } from '../commands/command_stack.js';
import { SetColorCommand } from '../commands/set_color_command.js';

/**
 * Coalesces color-picker gestures into a single undoable SetColorCommand.
 */
export class PropertiesColorSession {
  private commandStack: CommandStack | null;
  private activeCommand: SetColorCommand | null;
  private finalizeTimerId: number | null;

  /**
   * Creates a color edit session helper.
   */
  constructor() {
    this.commandStack = null;
    this.activeCommand = null;
    this.finalizeTimerId = null;
  }

  /**
   * Sets the command stack used for color edits.
   * @param stack Command stack, or null.
   */
  setCommandStack(stack: CommandStack | null): void {
    this.commandStack = stack;
  }

  /**
   * Applies a color picker value, starting or updating the active gesture.
   * @param colorHex Parsed hex color.
   * @param meshes Editable meshes with material colors.
   */
  onColorEdited(colorHex: number, meshes: THREE.Mesh[]): void {
    if (this.activeCommand) {
      this.updateActiveCommand(colorHex);
    } else {
      this.beginActiveCommand(colorHex, meshes);
    }
    this.scheduleFinalize();
  }

  /**
   * Ends the active color gesture and drops no-op commands.
   */
  finalize(): void {
    this.clearFinalizeTimer();
    if (!this.activeCommand) return;
    if (this.activeCommand.matchesOriginalColors()) {
      this.discardActiveCommand();
    }
    this.activeCommand = null;
  }

  /**
   * Creates and pushes a new color command for the start of a picker gesture.
   * @param colorHex First non-session color from the picker.
   * @param meshes Editable meshes.
   */
  private beginActiveCommand(colorHex: number, meshes: THREE.Mesh[]): void {
    if (meshes.length === 0) return;
    const originalColorHexes = meshes.map((mesh) => {
      return (mesh.material as THREE.MeshStandardMaterial).color.getHex();
    });
    if (originalColorHexes.every((original) => original === colorHex)) return;
    const command = new SetColorCommand(meshes, colorHex, originalColorHexes);
    if (this.commandStack) {
      this.commandStack.push(command);
    } else {
      command.execute();
    }
    this.activeCommand = command;
  }

  /**
   * Updates the in-progress color command target and re-applies it.
   * @param colorHex Latest picker color.
   */
  private updateActiveCommand(colorHex: number): void {
    if (!this.activeCommand) return;
    if (this.activeCommand.getNewColorHex() === colorHex) return;
    this.activeCommand.setNewColorHex(colorHex);
    this.activeCommand.execute();
  }

  /**
   * Finalizes the active color gesture shortly after picker activity stops.
   */
  private scheduleFinalize(): void {
    this.clearFinalizeTimer();
    this.finalizeTimerId = window.setTimeout(() => {
      this.finalizeTimerId = null;
      this.finalize();
    }, 300);
  }

  /**
   * Cancels a pending delayed color-session finalize.
   */
  private clearFinalizeTimer(): void {
    if (this.finalizeTimerId === null) return;
    window.clearTimeout(this.finalizeTimerId);
    this.finalizeTimerId = null;
  }

  /**
   * Removes a no-op active color command from the stack without undoing scene state.
   */
  private discardActiveCommand(): void {
    if (!this.activeCommand) return;
    if (this.commandStack) {
      this.commandStack.discardTopIf(this.activeCommand);
      return;
    }
    this.activeCommand.undo();
  }
}
