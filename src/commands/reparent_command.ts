import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { reparentSafely } from '../utils/hierarchy_utils.js';

/**
 * Undoable command that reparents an object under a new parent in the hierarchy.
 * Preserves world transform so objects do not jump when moved in the outliner.
 */
export class ReparentCommand implements UndoCommand {
  private object: THREE.Object3D;
  private newParent: THREE.Object3D;
  private previousParent: THREE.Object3D | null;
  private previousSiblingIndex: number;
  private insertBefore: THREE.Object3D | null;
  private executed: boolean;

  /**
   * Creates a reparent command.
   * @param object The object to move in the hierarchy.
   * @param newParent The destination parent.
   * @param insertBefore Optional sibling to insert before; null appends at end.
   */
  constructor(
    object: THREE.Object3D,
    newParent: THREE.Object3D,
    insertBefore: THREE.Object3D | null = null
  ) {
    this.object = object;
    this.newParent = newParent;
    this.previousParent = object.parent;
    this.previousSiblingIndex = this.findSiblingIndex(object);
    this.insertBefore = insertBefore;
    this.executed = false;
  }

  /**
   * Reparents the object under the new parent, preserving world transform.
   */
  execute(): void {
    if (this.executed) return;
    if (this.object === this.newParent) return;
    this.applyReparent(this.newParent, this.insertBefore);
    this.executed = true;
  }

  /**
   * Restores the object to its previous parent and sibling index.
   */
  undo(): void {
    if (!this.executed) return;
    if (!this.previousParent) {
      this.object.parent?.remove(this.object);
      this.executed = false;
      return;
    }
    this.restoreWorldTransformWhileReparenting(this.previousParent);
    this.restoreSiblingIndex(this.previousParent, this.previousSiblingIndex);
    this.executed = false;
  }

  /**
   * Returns a short description for status/debug display.
   * @returns Human-readable command name.
   */
  getDescription(): string {
    return `Reparent ${this.object.name || 'object'}`;
  }

  /**
   * Reparents under a target parent, optionally inserting before a sibling.
   * @param parent The destination parent.
   * @param before Optional sibling to insert before.
   */
  private applyReparent(
    parent: THREE.Object3D,
    before: THREE.Object3D | null
  ): void {
    const success = this.restoreWorldTransformWhileReparenting(parent);
    if (!success) return;
    if (before && before.parent === parent) {
      const index = parent.children.indexOf(before);
      if (index >= 0) {
        this.moveChildToIndex(parent, this.object, index);
      }
    }
  }

  /**
   * Reparents while keeping the object's world transform stable.
   * @param parent The new parent object.
   * @returns True if reparenting succeeded.
   */
  private restoreWorldTransformWhileReparenting(parent: THREE.Object3D): boolean {
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    this.object.updateWorldMatrix(true, false);
    this.object.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
    if (!reparentSafely(this.object, parent)) return false;
    parent.updateWorldMatrix(true, false);
    const parentInverse = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const localMatrix = new THREE.Matrix4()
      .compose(worldPosition, worldQuaternion, worldScale)
      .premultiply(parentInverse);
    localMatrix.decompose(
      this.object.position,
      this.object.quaternion,
      this.object.scale
    );
    return true;
  }

  /**
   * Moves a child to a specific index within a parent.
   * @param parent The parent whose children array is reordered.
   * @param child The child to move.
   * @param index The destination index.
   */
  private moveChildToIndex(
    parent: THREE.Object3D,
    child: THREE.Object3D,
    index: number
  ): void {
    const currentIndex = parent.children.indexOf(child);
    if (currentIndex < 0) return;
    parent.children.splice(currentIndex, 1);
    const clamped = Math.max(0, Math.min(index, parent.children.length));
    parent.children.splice(clamped, 0, child);
  }

  /**
   * Restores a child to a previous sibling index under a parent.
   * @param parent The parent object.
   * @param index The previous sibling index.
   */
  private restoreSiblingIndex(parent: THREE.Object3D, index: number): void {
    this.moveChildToIndex(parent, this.object, index);
  }

  /**
   * Finds the current sibling index of an object in its parent.
   * @param object The object to locate.
   * @returns The sibling index, or -1 if unparented.
   */
  private findSiblingIndex(object: THREE.Object3D): number {
    if (!object.parent) return -1;
    return object.parent.children.indexOf(object);
  }
}
