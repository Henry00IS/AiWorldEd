import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { CommandMeshCsgBoolean } from '@/tools/csg/commands/command_mesh_csg_boolean.js';
import { CsgBooleanOps, CsgOperation } from '@/csg/csg_boolean_ops.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';

/**
 * Coordinates mesh CSG boolean actions from the toolbar menu. Only regular
 * content meshes are eligible — solid brushes and solid model results use the
 * solid-model CSG pipeline instead.
 */
export class HandlerCsgAction {
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private selectionManager: ManagerSelection;
  private booleanOps: CsgBooleanOps;
  private syncViewports: (() => void) | null;
  private refreshOutliner: (() => void) | null;
  private showStatus: ((message: string) => void) | null;

  /**
   * Creates a CSG action handler.
   *
   * @param worldObject The scene world root.
   * @param commandStack The undo stack.
   * @param selectionManager The selection manager.
   */
  constructor(worldObject: THREE.Group, commandStack: CommandStack, selectionManager: ManagerSelection) {
    this.worldObject = worldObject;
    this.commandStack = commandStack;
    this.selectionManager = selectionManager;
    this.booleanOps = new CsgBooleanOps();
    this.syncViewports = null;
    this.refreshOutliner = null;
    this.showStatus = null;
  }

  /**
   * Sets the viewport sync callback.
   *
   * @param callback The callback to invoke after CSG changes.
   */
  setSyncViewports(callback: () => void): void {
    this.syncViewports = callback;
  }

  /**
   * Sets the outliner refresh callback.
   *
   * @param callback The callback to invoke after CSG changes.
   */
  setRefreshOutliner(callback: () => void): void {
    this.refreshOutliner = callback;
  }

  /**
   * Sets the status message callback.
   *
   * @param callback The status callback.
   */
  setShowStatus(callback: (message: string) => void): void {
    this.showStatus = callback;
  }

  /**
   * Returns whether mesh CSG can run on the current selection. Requires at
   * least two regular content meshes and no solid brushes or solid model result
   * meshes in the selection.
   *
   * @returns True when Union/Subtract/Intersect may run.
   */
  canRunMeshBoolean(): boolean {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    if (selected.length < 2) return false;
    return selected.every((mesh) => this.isRegularMeshBooleanTarget(mesh));
  }

  /**
   * Runs a boolean operation on the first two selected regular meshes. No-ops
   * when the selection includes solid brushes or solid results. The result
   * keeps the primary mesh name (first selection; the base for subtract).
   *
   * @param operation The CSG operation to run.
   */
  runBoolean(operation: CsgOperation): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    if (!this.validateMeshBooleanSelection(selected)) return;
    const meshA = selected[0]!;
    const meshB = selected[1]!;
    const resultName = resolveMeshCsgResultName(meshA);
    const result = this.booleanOps.operate(meshA, meshB, operation, resultName);
    if (!result) {
      this.emitStatus('CSG produced empty geometry');
      return;
    }
    this.commitBooleanResult(meshA, meshB, result, resultName, operation);
  }

  /**
   * Validates selection for mesh CSG and emits a status when invalid.
   *
   * @param selected Current selection.
   * @returns True when mesh CSG may proceed.
   */
  private validateMeshBooleanSelection(selected: THREE.Mesh[]): boolean {
    if (selected.length < 2) {
      this.emitStatus('CSG needs two regular meshes — Shift+click or Ctrl+click to multi-select');
      return false;
    }
    return this.rejectSolidSelectionIfPresent(selected);
  }

  /**
   * Rejects selections that include solid brushes or solid result meshes.
   *
   * @param selected Current selection.
   * @returns False when solid content blocks mesh CSG.
   */
  private rejectSolidSelectionIfPresent(selected: THREE.Mesh[]): boolean {
    if (selected.some((mesh) => SolidBrushVisual.isBrushObject(mesh))) {
      this.emitStatus('Mesh CSG is not available for solid brushes — use Solid Brush ops in Properties');
      return false;
    }
    if (selected.some((mesh) => SolidModel.isResultMesh(mesh))) {
      this.emitStatus('Mesh CSG is not available for solid model results — edit brushes instead');
      return false;
    }
    return true;
  }

  /**
   * Returns whether a mesh is a regular content object for mesh CSG.
   *
   * @param mesh Candidate mesh.
   * @returns True when the mesh is not a solid brush or solid result.
   */
  private isRegularMeshBooleanTarget(mesh: THREE.Mesh): boolean {
    if (SolidBrushVisual.isBrushObject(mesh)) return false;
    if (SolidModel.isResultMesh(mesh)) return false;
    if (mesh.userData['isModifierVolume'] === true) return false;
    return true;
  }

  /**
   * Pushes the boolean command and selects the result mesh.
   *
   * @param meshA First source mesh.
   * @param meshB Second source mesh.
   * @param result Result mesh.
   * @param resultName Result display name.
   * @param operation Operation used for status text.
   */
  private commitBooleanResult(
    meshA: THREE.Mesh,
    meshB: THREE.Mesh,
    result: THREE.Mesh,
    resultName: string,
    operation: CsgOperation,
  ): void {
    const command = new CommandMeshCsgBoolean(meshA, meshB, result, this.worldObject);
    this.commandStack.push(command);
    this.selectionManager.selectObject(result);
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.emitStatus(`CSG ${operation} created ${resultName}`);
  }

  /**
   * Emits a status message when a callback is registered.
   *
   * @param message The message text.
   */
  private emitStatus(message: string): void {
    if (this.showStatus) {
      this.showStatus(message);
    }
  }
}

/**
 * Resolves the display name for a mesh CSG result from the primary operand.
 * Empty primary names fall back to a fresh hierarchy allocation.
 *
 * @param primaryMesh First selected mesh (base for subtract).
 * @returns Name for the result mesh.
 */
export function resolveMeshCsgResultName(primaryMesh: THREE.Mesh): string {
  const primaryName = primaryMesh.name.trim();
  if (primaryName.length > 0) {
    return primaryName;
  }
  return hierarchyNameAllocator.allocate('Object');
}
