import type { Object3D } from 'three';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';

/**
 * What the Edit button and the Generator tool need from the scene: the selected
 * generator, the panes it shows in, picking and the overlays.
 */
export interface GeneratorEditHost {
  /**
   * Returns the generator when it is the only selected, unlocked object.
   *
   * @returns Generator node, or null.
   */
  selectedGenerator(): Object3D | null;

  /**
   * Returns the camera and pick surface of every interactive pane.
   *
   * @returns Pane contexts.
   */
  panes(): EditorViewportPickContext[];

  /**
   * Selects the nearest generator under a client point; anything else under the
   * point is ignored, so a click never selects an ordinary object.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   */
  pickGenerator(clientX: number, clientY: number): void;

  /**
   * Hides or restores the transform gizmos and bounds rulers while a generator
   * is edited.
   *
   * @param editing True while the Generator tool is active.
   */
  setEditing(editing: boolean): void;
}
