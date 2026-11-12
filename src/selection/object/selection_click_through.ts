import * as THREE from 'three';
import { ManagerSelection } from './manager_selection.js';
import { modifierStackPickTargets } from '@/modifier/stack/pick/modifier_stack_pick.js';

/**
 * Resolves object picks along a ray so nested meshes can be selected by
 * repeated clicks.
 *
 * The stack is pick-priority order (preferred first). 3D callers pass
 * near-to-far depth order. 2D callers pass reverse outliner order from
 * {@link orderObjectPickStackForViewport} — this class does not reorder.
 *
 * Click-through cycles only while the pointer stays at the same client position
 * and the viewport session is unchanged. Moving the mouse or calling
 * {@link resetClickThrough} starts a fresh pick of the preferred first hit,
 * unless that preferred mesh is already selected — then cycling continues.
 */
export class SelectionClickThrough {
  private static lastClickClientX: number | null = null;
  private static lastClickClientY: number | null = null;
  private static sessionValid: boolean = false;

  /**
   * Invalidates the click-through cycle (viewport moved, camera navigated, or
   * any view change that should restart picks at the preferred first hit).
   */
  static resetClickThrough(): void {
    this.lastClickClientX = null;
    this.lastClickClientY = null;
    this.sessionValid = false;
  }

  /**
   * Chooses which mesh a plain click should select from a pick-priority stack.
   *
   * @param orderedMeshes Unique world meshes in pick-priority order (preferred
   *   first). 3D: near-to-far. 2D: reverse outliner order.
   * @param selectionManager Current selection state.
   * @param clientX Optional pointer client X for same-position cycling.
   * @param clientY Optional pointer client Y for same-position cycling.
   * @returns Mesh to select, or null when the stack is empty.
   */
  static pickFromStack(
    orderedMeshes: THREE.Mesh[],
    selectionManager: ManagerSelection,
    clientX?: number,
    clientY?: number,
  ): THREE.Mesh | null {
    if (orderedMeshes.length === 0) {
      return null;
    }
    if (orderedMeshes.length === 1) {
      this.rememberClickPosition(clientX, clientY);
      return orderedMeshes[0] ?? null;
    }
    const continueCycle = this.shouldContinueClickThroughCycle(orderedMeshes, selectionManager, clientX, clientY);
    this.rememberClickPosition(clientX, clientY);
    this.sessionValid = true;
    if (!continueCycle) {
      return orderedMeshes[0] ?? null;
    }
    return this.pickNextMeshInCycle(orderedMeshes, selectionManager);
  }

  /**
   * Builds a near-to-far list of unique meshes from raycast hits. A hit on a
   * piece made by a modifier volume yields that volume, then its source brush.
   *
   * @param hits Ray intersections sorted by distance (Three.js order).
   * @param resolveMesh Maps a hit mesh to the authoritative world mesh.
   * @returns Deduplicated world meshes in hit order.
   */
  static uniqueMeshesFromHits(hits: THREE.Intersection[], resolveMesh: (mesh: THREE.Mesh) => THREE.Mesh): THREE.Mesh[] {
    const result: THREE.Mesh[] = [];
    const seen = new Set<THREE.Mesh>();
    for (const hit of hits) {
      if (!(hit.object instanceof THREE.Mesh)) {
        continue;
      }
      for (const resolved of modifierStackPickTargets(hit) ?? [resolveMesh(hit.object)]) {
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        result.push(resolved);
      }
    }
    return result;
  }

  /**
   * Returns whether this click should advance the cycle instead of taking the
   * preferred first mesh.
   *
   * @param orderedMeshes Meshes in pick-priority order.
   * @param selectionManager Current selection state.
   * @param clientX Optional pointer client X.
   * @param clientY Optional pointer client Y.
   * @returns True when the next mesh in the cycle should be picked.
   */
  private static shouldContinueClickThroughCycle(
    orderedMeshes: THREE.Mesh[],
    selectionManager: ManagerSelection,
    clientX: number | undefined,
    clientY: number | undefined,
  ): boolean {
    if (this.isSameClickPositionSession(clientX, clientY)) {
      return this.findSelectedIndex(orderedMeshes, selectionManager) >= 0;
    }
    return this.isPreferredFirstMeshCurrentlySelected(orderedMeshes, selectionManager);
  }

  /**
   * Returns whether client coordinates match the last click-through sample and
   * the session is still valid.
   *
   * @param clientX Optional pointer client X.
   * @param clientY Optional pointer client Y.
   * @returns True when cycling may continue at this position.
   */
  private static isSameClickPositionSession(clientX: number | undefined, clientY: number | undefined): boolean {
    if (!this.sessionValid) {
      return false;
    }
    if (clientX === undefined || clientY === undefined) {
      return false;
    }
    if (this.lastClickClientX === null || this.lastClickClientY === null) {
      return false;
    }
    return this.lastClickClientX === clientX && this.lastClickClientY === clientY;
  }

  /**
   * Returns whether the preferred first hit is the current selection (re-click
   * exception after mouse or viewport change).
   *
   * @param orderedMeshes Meshes in pick-priority order.
   * @param selectionManager Current selection state.
   * @returns True when orderedMeshes[0] is selected as the active object.
   */
  private static isPreferredFirstMeshCurrentlySelected(
    orderedMeshes: THREE.Mesh[],
    selectionManager: ManagerSelection,
  ): boolean {
    const preferred = orderedMeshes[0];
    if (!preferred) {
      return false;
    }
    if (!selectionManager.isObjectSelected(preferred)) {
      return false;
    }
    const lastSelected = selectionManager.getLastSelectedObject();
    if (lastSelected === null) {
      return true;
    }
    return lastSelected === preferred;
  }

  /**
   * Picks the mesh after the currently selected hit in the ordered stack
   * (wraps).
   *
   * @param orderedMeshes Meshes in pick-priority order.
   * @param selectionManager Current selection state.
   * @returns Next mesh in the cycle, or the preferred first when none selected.
   */
  private static pickNextMeshInCycle(
    orderedMeshes: THREE.Mesh[],
    selectionManager: ManagerSelection,
  ): THREE.Mesh | null {
    const currentIndex = this.findSelectedIndex(orderedMeshes, selectionManager);
    if (currentIndex < 0) {
      return orderedMeshes[0] ?? null;
    }
    const nextIndex = (currentIndex + 1) % orderedMeshes.length;
    return orderedMeshes[nextIndex] ?? null;
  }

  /**
   * Stores the click client position for the next same-position cycle check.
   *
   * @param clientX Optional pointer client X.
   * @param clientY Optional pointer client Y.
   */
  private static rememberClickPosition(clientX: number | undefined, clientY: number | undefined): void {
    if (clientX === undefined || clientY === undefined) {
      return;
    }
    this.lastClickClientX = clientX;
    this.lastClickClientY = clientY;
  }

  /**
   * Finds the index of a currently selected mesh in the ordered pick stack.
   * Prefers the most recently selected mesh when several are selected.
   *
   * @param orderedMeshes Meshes in pick-priority order.
   * @param selectionManager Current selection state.
   * @returns Index in the stack, or -1 when none of the hits are selected.
   */
  private static findSelectedIndex(orderedMeshes: THREE.Mesh[], selectionManager: ManagerSelection): number {
    const lastSelected = selectionManager.getLastSelectedObject();
    if (lastSelected) {
      const lastIndex = orderedMeshes.indexOf(lastSelected);
      if (lastIndex >= 0) {
        return lastIndex;
      }
    }
    for (let index = 0; index < orderedMeshes.length; index += 1) {
      if (selectionManager.isObjectSelected(orderedMeshes[index]!)) {
        return index;
      }
    }
    return -1;
  }
}
