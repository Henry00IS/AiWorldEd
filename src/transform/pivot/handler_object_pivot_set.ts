import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import { textCount } from '@/utils/utils_plural.js';
import { CommandObjectPivotSet } from './command_object_pivot_set.js';
import { ObjectPivotPlacement, objectPivotPlacementLabel, objectPivotPoint } from './object_pivot_point.js';

/** Editor services Object → Set Origin uses. */
export interface HandlerObjectPivotSetDeps {
  commandStack: CommandStack;
  /** Selected objects that may be edited. */
  getSelectedObjects: () => readonly THREE.Object3D[];
  showStatusMessage: (message: string) => void;
  /** Refreshes visuals after origins moved. */
  onAfterSet: (objects: readonly THREE.Object3D[]) => void;
}

/**
 * Moves the selected objects' origins to a placement without moving their
 * geometry, as one undoable edit.
 *
 * @param deps Editor services.
 * @param placement Where the origins go.
 * @returns True when an origin moved.
 */
export function handlerObjectPivotSet(deps: HandlerObjectPivotSetDeps, placement: ObjectPivotPlacement): boolean {
  const objects = handlerObjectPivotTargets(deps.getSelectedObjects());
  if (objects.length === 0) {
    deps.showStatusMessage('Select an object to set its origin');
    return false;
  }
  const command = new CommandObjectPivotSet(
    objects.map((object) => ({ object, point: objectPivotPoint(object, placement) })),
  );
  command.execute();
  deps.commandStack.recordExecuted(command);
  deps.onAfterSet(objects);
  deps.showStatusMessage(`${objectPivotPlacementLabel(placement)}: ${textCount(objects.length, 'object')}`);
  return true;
}

/**
 * Maps the selection to objects whose origin can move; a CSG result stands for
 * its solid model.
 *
 * @param selected Selected objects.
 * @returns Unique objects.
 */
function handlerObjectPivotTargets(selected: readonly THREE.Object3D[]): THREE.Object3D[] {
  const objects = new Set<THREE.Object3D>();
  for (const object of selected) {
    const model = isResultMesh(object) ? SolidModel.fromObject(object) : null;
    objects.add(model?.root ?? object);
  }
  return [...objects];
}
