import type * as THREE from 'three';
import type { GeneratorEditHost } from '@/editor/tools/generator/generator_edit_host.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';
import type { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import { filterUnlockedObjects } from '@/utils/object_lock.js';

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
}

/**
 * Creates the host the Edit button and the Generator tool use.
 *
 * @param deps Scene services.
 * @returns Generator edit host.
 */
export function layoutGeneratorEditHostCreate(deps: LayoutGeneratorEditHostDeps): GeneratorEditHost {
  return {
    selectedGenerator: () => layoutGeneratorEditSelected(deps.selectionManager),
    panes: () => layoutGeneratorEditPanes(deps),
    pickGenerator: (clientX, clientY) => {
      const generator = deps.pickStack(clientX, clientY).find((mesh) => ModifierVolume.isGenerator(mesh));
      if (generator) deps.selectionManager.selectFromClick(generator, false, false);
    },
    setEditing: (editing) => {
      if (editing) deps.editorOverlayPolicy.enable(EditorOverlayId.GENERATOR_EDITING, LAYOUT_GENERATOR_EDIT_REASON);
      else deps.editorOverlayPolicy.release(EditorOverlayId.GENERATOR_EDITING, LAYOUT_GENERATOR_EDIT_REASON);
    },
  };
}

/**
 * Returns the generator when it is the only selected, unlocked object.
 *
 * @param selectionManager Object selection.
 * @returns Generator node, or null.
 */
function layoutGeneratorEditSelected(selectionManager: ManagerSelection): THREE.Object3D | null {
  const selected = filterUnlockedObjects(selectionManager.getAllSelectedObjectsAsArray());
  const only = selected.length === 1 ? selected[0] : undefined;
  return only && ModifierVolume.isGenerator(only) ? only : null;
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
