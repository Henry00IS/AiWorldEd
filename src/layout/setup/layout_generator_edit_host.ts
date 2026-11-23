import type * as THREE from 'three';
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
  modifierStackSliderPatch,
  modifierStackSliders,
  type ModifierStackSlider,
} from '@/modifier/stack/widgets/modifier_stack_sliders.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';
import type { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import { editSnapDistanceToGrid } from '@/edit/tool/edit_axis_drag.js';
import { isObjectOrAncestorLocked } from '@/utils/object_lock.js';

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
  /** Shows or clears the Generator highlight on the tool rail. */
  setRailEditing?: (editing: boolean) => void;
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
    sliders: () => layoutGeneratorEditSliders(selected()),
    snapDistance: (distance) =>
      editSnapDistanceToGrid(distance, deps.gridSnap.getInterval(), deps.gridSnap.isEnabled()),
    slide: (slider, value) => layoutGeneratorEditSlide(drag, selected(), slider, value),
    slideEnd: () => layoutGeneratorEditSlideEnd(drag, deps.commandStack),
    slideCancel: () => layoutGeneratorEditSlideCancel(drag),
  };
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
 * Returns the sliders of an object, or none without one.
 *
 * @param owner Object, or null.
 * @returns Sliders.
 */
function layoutGeneratorEditSliders(owner: THREE.Object3D | null): ModifierStackSlider[] {
  return owner ? modifierStackSliders(owner) : [];
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
 * Writes one live value of a drag, remembering the stack before its first move.
 *
 * @param drag Drag in progress.
 * @param drag.current Current drag, or null.
 * @param owner Selected object.
 * @param slider Slider being dragged.
 * @param value Value to write.
 */
function layoutGeneratorEditSlide(
  drag: { current: LayoutGeneratorEditDrag | null },
  owner: THREE.Object3D | null,
  slider: ModifierStackSlider,
  value: number,
): void {
  if (!owner || slider.writes === '') return;
  const before = modifierStackParametersStackRead(owner);
  if (!before) return;
  if (drag.current?.owner !== owner) drag.current = { owner, before };
  const patch = modifierStackSliderPatch(owner, slider, value);
  if (patch) modifierStackParametersCommand(owner, slider.stepId, patch)?.execute();
}

/**
 * Puts what a drag wrote into the undo history as one step. The live state is
 * first taken back, so a refused step leaves the object as it was.
 *
 * @param drag Drag in progress.
 * @param drag.current Current drag, or null.
 * @param commandStack Level undo history.
 */
function layoutGeneratorEditSlideEnd(
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
function layoutGeneratorEditSlideCancel(drag: { current: LayoutGeneratorEditDrag | null }): void {
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
  const selected = selectionManager.getAllSelectedObjectsAsArray();
  const only = selected.length === 1 ? selected[0] : undefined;
  return only && !isObjectOrAncestorLocked(only) && modifierStackEditSteps(only).length > 0 ? only : null;
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
