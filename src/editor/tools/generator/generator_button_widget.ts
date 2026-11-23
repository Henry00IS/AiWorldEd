import {
  WidgetScreenButton,
  type WidgetScreenButtonFrame,
} from '@/editor/widgets/screen_button/widget_screen_button.js';
import type { GeneratorEditHost } from './generator_edit_host.js';

/**
 * The Widget Buttons and Widget Toggles of the object being edited, floating in
 * the scene; a still click presses one as one undo step.
 */
export class GeneratorButtonWidget extends WidgetScreenButton {
  /**
   * Returns the buttons to show this frame.
   *
   * @returns Panes and buttons.
   */
  protected override frameRead(): WidgetScreenButtonFrame {
    const host = this.host();
    if (!host) return { panes: [], anchors: [] };
    const anchors = host.buttons().map((button) => ({
      key: button.key,
      label: button.label,
      title: button.kind === 'Toggle' ? `${button.label} (Toggle)` : button.label,
      position: button.at,
      color: button.color,
      ...(button.kind === 'Toggle' ? { pressed: button.on } : {}),
    }));
    return { panes: host.panes(), anchors };
  }

  /**
   * Presses the clicked button.
   *
   * @param key Key of the button.
   */
  protected override clicked(key: string): void {
    const host = this.host();
    const button = host?.buttons().find((each) => each.key === key);
    if (host && button) host.press(button);
  }

  /**
   * Returns the edit host.
   *
   * @returns Host, or null outside the layout.
   */
  private host(): GeneratorEditHost | null {
    return this.editor?.getServices()?.getGeneratorEditHost?.() ?? null;
  }
}
