import type { CurveVector } from '@/curve/model/curve_model.js';
import type { InputNumeric } from '@/ui/input/input_numeric.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import type { CurveEditorSession } from './curve_editor_session.js';
import { curveEditorLabel } from './curve_editor_toolbar.js';
import { styleFloatingPanelStatusBar } from '@/ui/floating_panel/panel_floating_status_bar.js';

/** How long a footer message stays before the cursor readout returns, in ms. */
const CURVE_EDITOR_MESSAGE_MS = 4000;

/**
 * Bottom of the curve editor: a row with the exact X and Y of the selected
 * point, and the window's standard status bar with the cursor position or the
 * last message.
 */
export class CurveEditorFooter {
  private readonly element: HTMLElement;
  private readonly x: InputNumeric;
  private readonly y: InputNumeric;
  private readonly status: HTMLElement;
  private messageUntil = 0;

  /**
   * Builds the footer.
   *
   * @param session Editing session.
   */
  constructor(private readonly session: CurveEditorSession) {
    this.x = inputNumericCreateUvField(0.01, 'Point X');
    this.y = inputNumericCreateUvField(0.01, 'Point Y');
    this.x.bindCommit(() => this.pointCommit());
    this.y.bindCommit(() => this.pointCommit());
    this.status = document.createElement('div');
    styleFloatingPanelStatusBar(this.status);
    this.element = document.createElement('div');
    Object.assign(this.element.style, { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 8px' });
    const xLabel = curveEditorLabel('Point X');
    xLabel.style.marginLeft = '0';
    this.element.append(xLabel, this.x.getElement(), curveEditorLabel('Y'), this.y.getElement());
  }

  /**
   * Returns the point row.
   *
   * @returns Element.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Returns the status bar.
   *
   * @returns Element.
   */
  getStatusElement(): HTMLElement {
    return this.status;
  }

  /**
   * Shows a message for a few seconds.
   *
   * @param text Message.
   */
  message(text: string): void {
    this.status.textContent = text;
    this.messageUntil = Date.now() + CURVE_EDITOR_MESSAGE_MS;
  }

  /**
   * Updates the point fields and the cursor readout.
   *
   * @param cursor Curve position under the pointer, or null.
   */
  refresh(cursor: CurveVector | null): void {
    const selection = this.session.selection;
    const point = selection?.kind === 'point' ? this.session.curve.points[selection.index] : undefined;
    for (const [field, value] of [
      [this.x, point?.x],
      [this.y, point?.y],
    ] as const) {
      field.getElement().disabled = !point;
      if (!field.isTyping()) field.setNumber(value ?? null, 3);
    }
    if (Date.now() < this.messageUntil) return;
    this.status.textContent = cursor
      ? `x ${cursor.x.toFixed(3)}  y ${cursor.y.toFixed(3)}`
      : 'Double-click to add a point';
  }

  /** Moves the selected point to the typed coordinates. */
  private pointCommit(): void {
    const selection = this.session.selection;
    const point = selection?.kind === 'point' ? this.session.curve.points[selection.index] : undefined;
    if (!selection || !point) return;
    const x = this.x.parseNumberOrNull() ?? point.x;
    const y = this.y.parseNumberOrNull() ?? point.y;
    this.session.movePointTo(selection.index, x, y);
  }
}
