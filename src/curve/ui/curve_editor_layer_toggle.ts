import type { CurveLayerKind } from '@/curve/model/curve_side.js';
import { curveEditorLabel } from './curve_editor_label.js';
import type { CurveEditorSession } from './curve_editor_session.js';
import { curveEditorButton, curveEditorButtonActive } from './curve_editor_toolbar_buttons.js';

/** Caption and tooltip of each line button. */
const CURVE_EDITOR_LAYER_BUTTONS: readonly [CurveLayerKind, string, string][] = [
  ['primary', 'Main', 'Edit the main profile, which shapes the +X side of Custom segments (Tab switches)'],
  ['secondary', '−X side', 'Edit the secondary line, which shapes the −X side of Custom segments (Tab switches)'],
];

/**
 * Segmented switch between the main profile and the secondary line. It shows
 * only while a segment uses the Custom side mode; the line not being edited
 * fades on the graph and cannot be picked.
 */
export class CurveEditorLayerToggle {
  private readonly label = curveEditorLabel('Line');
  private readonly buttons = new Map<CurveLayerKind, HTMLButtonElement>();

  /**
   * Builds the switch.
   *
   * @param session Editing session.
   */
  constructor(private readonly session: CurveEditorSession) {
    this.label.style.marginLeft = '0';
    for (const [layer, caption, title] of CURVE_EDITOR_LAYER_BUTTONS) {
      const button = curveEditorButton(caption, title, () => this.session.setLayer(layer));
      button.dataset['curveLayer'] = layer;
      this.buttons.set(layer, button);
    }
  }

  /**
   * Returns the caption and both buttons.
   *
   * @returns Toolbar elements.
   */
  elements(): HTMLElement[] {
    return [this.label, ...this.buttons.values()];
  }

  /** Shows the switch only with a secondary line and marks the edited line. */
  refresh(): void {
    const display = this.session.layerAvailable() ? '' : 'none';
    this.label.style.display = display;
    for (const [layer, button] of this.buttons) {
      button.style.display = display;
      curveEditorButtonActive(button, this.session.layer === layer);
    }
  }
}
