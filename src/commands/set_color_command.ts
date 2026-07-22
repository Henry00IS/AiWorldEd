import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';

/**
 * Snapshot of a mesh material color for undo/restore operations.
 */
export interface MeshColorSnapshot {
  mesh: THREE.Mesh;
  colorHex: number;
}

/**
 * Undoable command that sets material colors on one or more meshes.
 * Snapshots original colors on construction and restores them on undo.
 */
export class SetColorCommand implements UndoCommand {
  private snapshots: MeshColorSnapshot[];
  private newColorHex: number;

  /**
   * Creates a new set color command.
   * Captures each mesh's current material color as the undo state unless
   * explicit originals are provided (used after live color-picker preview).
   * @param meshes The meshes whose material colors will be changed.
   * @param newColorHex The target color as a CSS hex number (e.g. 0xff0000).
   * @param originalColorHexes Optional per-mesh undo colors matching meshes order.
   */
  constructor(
    meshes: THREE.Mesh[],
    newColorHex: number,
    originalColorHexes?: number[]
  ) {
    this.snapshots = [];
    this.newColorHex = newColorHex;
    meshes.forEach((mesh, index) => {
      const colorHex = this.resolveOriginalColorHex(mesh, originalColorHexes, index);
      if (colorHex === null) return;
      this.snapshots.push({ mesh, colorHex });
    });
  }

  /**
   * Resolves the undo color for a mesh from explicit originals or live material.
   * @param mesh The mesh being snapshotted.
   * @param originalColorHexes Optional explicit original colors.
   * @param index Mesh index in the constructor list.
   * @returns Color hex, or null when the mesh has no writable color.
   */
  private resolveOriginalColorHex(
    mesh: THREE.Mesh,
    originalColorHexes: number[] | undefined,
    index: number
  ): number | null {
    if (originalColorHexes && index < originalColorHexes.length) {
      return originalColorHexes[index];
    }
    return this.readMeshColorHex(mesh);
  }

  /**
   * Executes the command by setting each mesh material color to the new value.
   */
  execute(): void {
    this.snapshots.forEach((snapshot) => {
      this.writeMeshColorHex(snapshot.mesh, this.newColorHex);
    });
  }

  /**
   * Undoes the command by restoring each mesh's original material color.
   */
  undo(): void {
    this.snapshots.forEach((snapshot) => {
      this.writeMeshColorHex(snapshot.mesh, snapshot.colorHex);
    });
  }

  /**
   * Updates the target color used by execute without changing undo snapshots.
   * Used while the color picker is dragged so one command stays on the stack.
   * @param newColorHex The latest picker color.
   */
  setNewColorHex(newColorHex: number): void {
    this.newColorHex = newColorHex;
  }

  /**
   * Returns the target color this command currently applies.
   * @returns Color hex.
   */
  getNewColorHex(): number {
    return this.newColorHex;
  }

  /**
   * Returns true when the target color matches every original snapshot color.
   * @returns True when execute would leave materials unchanged from undo state.
   */
  matchesOriginalColors(): boolean {
    return this.snapshots.every((snapshot) => snapshot.colorHex === this.newColorHex);
  }

  /**
   * Returns how many meshes will be affected by this command.
   * @returns Snapshot count.
   */
  getAffectedMeshCount(): number {
    return this.snapshots.length;
  }

  /**
   * Reads the hex color from a mesh material when available.
   * @param mesh The mesh to read from.
   * @returns Color hex, or null when the material has no color property.
   */
  private readMeshColorHex(mesh: THREE.Mesh): number | null {
    const material = mesh.material;
    if (!material || Array.isArray(material) || !('color' in material)) {
      return null;
    }
    const color = (material as THREE.MeshStandardMaterial).color;
    if (!(color instanceof THREE.Color)) return null;
    return color.getHex();
  }

  /**
   * Writes a hex color onto a mesh material when available.
   * @param mesh The mesh to update.
   * @param colorHex The color to apply.
   */
  private writeMeshColorHex(mesh: THREE.Mesh, colorHex: number): void {
    const material = mesh.material;
    if (!material || Array.isArray(material) || !('color' in material)) {
      return;
    }
    const color = (material as THREE.MeshStandardMaterial).color;
    if (!(color instanceof THREE.Color)) return;
    color.setHex(colorHex);
  }
}
