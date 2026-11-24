import { modifierStackAimPatch, modifierStackAims } from '@/modifier/stack/widgets/modifier_stack_aim_record.js';
import * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import type { GeneratorEditHost } from '@/editor/tools/generator/generator_edit_host.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import {
  modifierStackParametersCommand,
  modifierStackParametersStackRead,
} from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackEditSteps,
  modifierStackPathPatch,
  modifierStackPaths,
  modifierStackSliderPatch,
  modifierStackSliders,
} from '@/modifier/stack/widgets/modifier_stack_sliders.js';
import { modifierStackDraws } from '@/modifier/stack/widgets/modifier_stack_draw_record.js';
import {
  modifierStackButtonPress,
  type ModifierStackButton,
  modifierStackButtons,
} from '@/modifier/stack/widgets/modifier_stack_button_record.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';
import type { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import { gridSnapInvertedByShift } from '@/transform/snap/grid_snap_shift_precision.js';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import { editSnapDistanceToGrid } from '@/edit/tool/edit_axis_drag.js';
import { isObjectOrAncestorLocked } from '@/utils/object_lock.js';
import type { BridgeTransformInteraction } from '@/tools/bridge/bridge_transform_interaction.js';
import { solidScriptNoticesPublish } from '@/solid_script/ui/solid_script_notices_channel.js';

/** Overlay reason held while the Generator tool is active. */
const LAYOUT_GENERATOR_EDIT_REASON = 'generator-tool';

/** Scene services the generator edit host reads. */
export interface LayoutGeneratorEditHostDeps {
  /** Object selection. */
  selectionManager: ManagerSelection;
  /** Overlay policy that hides gizmos and bounds rulers while editing. */
  editorOverlayPolicy: PolicyEditorOverlay;
  /** Every interactive pane with its camera and content element. */
  getInteractiveViewports: () => ReadonlyArray<{ getCamera(): THREE.Camera; getContentElement(): HTMLElement | null }>;
  /** Meshes under a client point, nearest first. */
  pickStack: (clientX: number, clientY: number) => THREE.Mesh[];
  /** Level undo history; a finished drag goes in as one step. */
  commandStack: CommandStack;
  /** Live grid snap. */
  gridSnap: GridSnap;
  /** Whether the user turned grid snapping on. */
  getUserSnapEnabled: () => boolean;
  /** Transform bridge whose orientation the X, Y and Z axis locks follow. */
  getTransformInteractionBridge?: () => Pick<BridgeTransformInteraction, 'resolveGizmoOrientation'> | null;
  /** Shows or clears the Generator highlight on the tool rail. */
  setRailEditing?: (editing: boolean) => void;
  /**
   * Re-reads the inspector once an edit in the scene is kept or taken back, so
   * it shows the changed object, such as a path with a point added.
   */
  onChange?: () => void;
}

/** A drag in progress: the object and its stack before the first move. */
interface LayoutGeneratorEditDrag {
  /** Object whose input the drag writes. */
  owner: THREE.Object3D;
  /** Its stack before the drag. */
  before: ModifierStackSettings;
}

/**
 * Creates the host the Edit button and the Generator tool use.
 *
 * @param deps Scene services.
 * @returns Generator edit host.
 */
export function layoutGeneratorEditHostCreate(deps: LayoutGeneratorEditHostDeps): GeneratorEditHost {
  const drag: { current: LayoutGeneratorEditDrag | null } = { current: null };
  const selected = (): THREE.Object3D | null => layoutGeneratorEditSelected(deps.selectionManager);
  return {
    selectedEditable: selected,
    panes: () => layoutGeneratorEditPanes(deps),
    pickEditable: (clientX, clientY) => layoutGeneratorEditPick(deps, clientX, clientY),
    setEditing: (editing) => layoutGeneratorEditOverlays(deps, editing),
    sliders: () => layoutGeneratorEditOf(selected(), modifierStackSliders),
    snapDistance: (distance, invert) =>
      editSnapDistanceToGrid(
        distance,
        deps.gridSnap.getInterval(),
        gridSnapInvertedByShift(deps.getUserSnapEnabled(), invert),
      ),
    snapAngle: (degrees, invert) => layoutGeneratorEditAngle(deps, degrees, invert),
    axisOrientation: () => {
      const only = selected();
      return (
        deps.getTransformInteractionBridge?.()?.resolveGizmoOrientation(only ? [only] : []) ?? new THREE.Quaternion()
      );
    },
    paths: () => layoutGeneratorEditOf(selected(), modifierStackPaths),
    draws: () => layoutGeneratorEditOf(layoutGeneratorEditOnly(deps.selectionManager), modifierStackDraws),
    slide: (slider, value) =>
      layoutGeneratorEditWrite(drag, selected(), slider.stepId, (owner) =>
        slider.writes === '' ? null : modifierStackSliderPatch(owner, slider, value),
      ),
    pathWrite: (path, asset) =>
      layoutGeneratorEditWrite(drag, selected(), path.stepId, (owner) => modifierStackPathPatch(owner, path, asset)),
    buttons: () => layoutGeneratorEditOf(selected(), modifierStackButtons),
    press: (button) => {
      layoutGeneratorEditWrite(drag, selected(), button.stepId, (owner) => layoutGeneratorEditPress(owner, button));
      layoutGeneratorEditChangeEnd(drag, deps.commandStack);
      deps.onChange?.();
    },
    aims: () => layoutGeneratorEditOf(selected(), modifierStackAims),
    aim: (aim, direction) =>
      layoutGeneratorEditWrite(drag, selected(), aim.stepId, (owner) => modifierStackAimPatch(owner, aim, direction)),
    changeEnd: () => {
      layoutGeneratorEditChangeEnd(drag, deps.commandStack);
      deps.onChange?.();
    },
    changeCancel: () => {
      layoutGeneratorEditChangeCancel(drag);
      deps.onChange?.();
    },
  };
}

/**
 * Returns the patch a click on a button makes, and shows the messages its
 * handlers showed in the inspector of its step.
 *
 * @param owner Object edited.
 * @param button Button clicked.
 * @returns Patch, or null when the step or the input is gone.
 */
function layoutGeneratorEditPress(owner: THREE.Object3D, button: ModifierStackButton): Record<string, unknown> | null {
  const pressed = modifierStackButtonPress(owner, button);
  if (pressed) solidScriptNoticesPublish(owner, button.stepId, pressed.notices, pressed.error);
  return pressed?.patch ?? null;
}

/**
 * Snaps an angle by the rotation step when grid snapping is on, or the other
 * way round while Shift is held, and keeps tenths of a degree.
 *
 * @param deps Scene services.
 * @param degrees Angle in degrees.
 * @param invert True while Shift is held.
 * @returns Snapped angle.
 */
function layoutGeneratorEditAngle(deps: LayoutGeneratorEditHostDeps, degrees: number, invert: boolean): number {
  const snapped = editSnapDistanceToGrid(
    degrees,
    deps.gridSnap.getRotationSnapDegrees(),
    gridSnapInvertedByShift(deps.getUserSnapEnabled(), invert),
  );
  return Math.round(snapped * 10) / 10;
}

/**
 * Selects the nearest object with an edit mode under a client point.
 *
 * @param deps Scene services.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 */
function layoutGeneratorEditPick(deps: LayoutGeneratorEditHostDeps, clientX: number, clientY: number): void {
  const hit = deps.pickStack(clientX, clientY).find((mesh) => modifierStackEditSteps(mesh).length > 0);
  if (hit) deps.selectionManager.selectFromClick(hit, false, false);
}

/**
 * Returns what an object shows in its edit mode, or nothing without one.
 *
 * @param owner Object, or null.
 * @param read Reads the items of an object.
 * @returns Items.
 */
function layoutGeneratorEditOf<T>(owner: THREE.Object3D | null, read: (owner: THREE.Object3D) => T[]): T[] {
  return owner ? read(owner) : [];
}

/**
 * Hides or restores the gizmos and bounds rulers, and the rail highlight.
 *
 * @param deps Scene services.
 * @param editing True while the Generator tool is active.
 */
function layoutGeneratorEditOverlays(deps: LayoutGeneratorEditHostDeps, editing: boolean): void {
  if (editing) deps.editorOverlayPolicy.enable(EditorOverlayId.GENERATOR_EDITING, LAYOUT_GENERATOR_EDIT_REASON);
  else deps.editorOverlayPolicy.release(EditorOverlayId.GENERATOR_EDITING, LAYOUT_GENERATOR_EDIT_REASON);
  deps.setRailEditing?.(editing);
}

/**
 * Writes one live change, remembering the stack before the first one.
 *
 * @param drag Change in progress.
 * @param drag.current Current change, or null.
 * @param owner Selected object.
 * @param stepId Step the change writes.
 * @param patchOf Returns the parameter patch, or null for nothing to write.
 */
function layoutGeneratorEditWrite(
  drag: { current: LayoutGeneratorEditDrag | null },
  owner: THREE.Object3D | null,
  stepId: string,
  patchOf: (owner: THREE.Object3D) => Record<string, unknown> | null,
): void {
  const before = owner ? modifierStackParametersStackRead(owner) : undefined;
  const patch = owner && before ? patchOf(owner) : null;
  if (!owner || !before || !patch) return;
  if (drag.current?.owner !== owner) drag.current = { owner, before };
  modifierStackParametersCommand(owner, stepId, patch)?.execute();
}

/**
 * Puts what a drag wrote into the undo history as one step. The live state is
 * first taken back, so a refused step leaves the object as it was.
 *
 * @param drag Drag in progress.
 * @param drag.current Current drag, or null.
 * @param commandStack Level undo history.
 */
function layoutGeneratorEditChangeEnd(
  drag: { current: LayoutGeneratorEditDrag | null },
  commandStack: CommandStack,
): void {
  const current = drag.current;
  drag.current = null;
  const after = current ? modifierStackParametersStackRead(current.owner) : undefined;
  if (!current || !after || JSON.stringify(after) === JSON.stringify(current.before)) return;
  new CommandModifierStackSet(current.owner, after, current.before).execute();
  commandStack.push(new CommandModifierStackSet(current.owner, current.before, after));
}

/**
 * Takes back what a drag wrote.
 *
 * @param drag Drag in progress.
 * @param drag.current Current drag, or null.
 */
function layoutGeneratorEditChangeCancel(drag: { current: LayoutGeneratorEditDrag | null }): void {
  const current = drag.current;
  drag.current = null;
  const after = current ? modifierStackParametersStackRead(current.owner) : undefined;
  if (current && after) new CommandModifierStackSet(current.owner, after, current.before).execute();
}

/**
 * Returns the selected object when it is the only selected object, unlocked,
 * and has an edit mode.
 *
 * @param selectionManager Object selection.
 * @returns Object, or null.
 */
function layoutGeneratorEditSelected(selectionManager: ManagerSelection): THREE.Object3D | null {
  const only = layoutGeneratorEditOnly(selectionManager);
  return only && modifierStackEditSteps(only).length > 0 ? only : null;
}

/**
 * Returns the one selected object when it is not locked.
 *
 * @param selectionManager Object selection.
 * @returns Object, or null.
 */
function layoutGeneratorEditOnly(selectionManager: ManagerSelection): THREE.Object3D | null {
  const selected = selectionManager.getAllSelectedObjectsAsArray();
  const only = selected.length === 1 ? selected[0] : undefined;
  return only && !isObjectOrAncestorLocked(only) ? only : null;
}

/**
 * Returns the camera and pick surface of every interactive pane.
 *
 * @param deps Scene services.
 * @returns Pane contexts.
 */
function layoutGeneratorEditPanes(deps: LayoutGeneratorEditHostDeps): EditorViewportPickContext[] {
  const panes: EditorViewportPickContext[] = [];
  for (const viewport of deps.getInteractiveViewports()) {
    const pickElement = viewport.getContentElement();
    if (pickElement) panes.push({ camera: viewport.getCamera(), pickElement });
  }
  return panes;
}
