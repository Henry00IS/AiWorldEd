import type { IEditorEventReceiver } from '../i_editor_event_receiver.js';

/** Floating GUI container that can receive editor focus and input events. */
export interface IGuiContainerEventReceiver extends IEditorEventReceiver {
  /**
   * Returns whether the pointer is over this container.
   *
   * @returns True when the mouse is over the container.
   */
  get isMouseOver(): boolean;

  /**
   * Returns the root DOM element used for hit-testing.
   *
   * @returns Root HTML element.
   */
  getRootElement(): HTMLElement;

  /**
   * Returns whether a DOM node lies inside this surface.
   *
   * @param node Event target node, or null.
   * @returns True when the node is this root or a descendant.
   */
  containsNode(node: Node | null): boolean;
}
