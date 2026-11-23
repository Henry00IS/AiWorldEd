import { Box3, Vector3 } from 'three';
import { WidgetScreenButton, type WidgetScreenButtonFrame } from './screen_button/widget_screen_button.js';

/** Key of the one Edit button. */
const GENERATOR_EDIT_BUTTON_KEY = 'edit';

/**
 * The Edit button at the center of a selected generator in the Bounds tool; a
 * still click on it enters the Generator tool.
 */
export class GeneratorEditButton extends WidgetScreenButton {
  /**
   * Creates the button.
   *
   * @param onEdit Called after a click on the button.
   */
  constructor(private readonly onEdit: () => void) {
    super();
  }

  /**
   * Shows the button over the selected generator, outside mesh edit mode.
   *
   * @returns Panes and the button, or no button.
   */
  protected override frameRead(): WidgetScreenButtonFrame {
    const services = this.editor?.getServices();
    const host = services?.getGeneratorEditHost?.() ?? null;
    const generator = host && !services?.isEditModeActive() ? host.selectedGenerator() : null;
    if (!host || !generator) return { panes: [], anchors: [] };
    const position = new Box3().setFromObject(generator).getCenter(new Vector3());
    return {
      panes: host.panes(),
      anchors: [{ key: GENERATOR_EDIT_BUTTON_KEY, label: 'Edit', title: 'Edit Generator', position }],
    };
  }

  /** Enters the Generator tool. */
  protected override clicked(): void {
    this.onEdit();
  }
}
