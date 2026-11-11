import { TransformMode } from '@/types/transform_mode.js';
import { TransformModalAxis, transformModalAxisIsLocked, transformModalAxisToggle } from './transform_modal_axis.js';
import { TransformModalKeyboardAction, type TransformModalKeyboardEvent } from './transform_modal_keyboard_action.js';
import { transformModalKeyboardRoute } from './transform_modal_keyboard_router.js';
import { transformModalNumericParse } from './transform_modal_numeric_parser.js';
import { TransformModalSession } from './transform_modal_session.js';
import { transformModalStatusText } from './transform_modal_status_text.js';
import { transformModalAxisToggleAllowed } from './transform_modal_axis_toggle_allowed.js';
import type { TransformModalApplyHost } from './transform_modal_apply_host.js';

/**
 * Reusable modal keyboard controller for transform drags: axis lock (X/Y/Z),
 * and numeric typing during single-use G/R/S. Move and rotate require an axis
 * constraint; free single-use scale accepts typed uniform factors without a
 * constraint.
 */
export class TransformModalController {
  private readonly session: TransformModalSession;
  private host: TransformModalApplyHost | null;

  /** Creates a controller with no host until wired. */
  constructor() {
    this.session = new TransformModalSession();
    this.host = null;
  }

  /**
   * Binds the apply host used for re-apply, commit, and status updates.
   *
   * @param host Apply host, or null to clear.
   */
  setHost(host: TransformModalApplyHost | null): void {
    this.host = host;
  }

  /** Starts modal keyboard handling for a new drag. */
  beginDrag(): void {
    this.session.begin();
    this.syncConstraintLine();
    this.publishStatus();
  }

  /** Ends modal keyboard handling when the drag finishes. */
  endDrag(): void {
    this.session.end();
    this.syncConstraintLine();
    this.publishStatus();
  }

  /**
   * Returns whether modal keyboard handling is active.
   *
   * @returns True during a drag.
   */
  isActive(): boolean {
    return this.session.isActive();
  }

  /**
   * Returns the current keyboard axis lock.
   *
   * @returns Modal axis enum.
   */
  getAxis(): TransformModalAxis {
    return this.session.getAxis();
  }

  /**
   * Returns whether a typed numeric buffer is driving the transform.
   *
   * @returns True when digits have been typed.
   */
  hasTypedValue(): boolean {
    return this.session.getNumericBuffer().hasText();
  }

  /**
   * Handles a keyboard event during an active drag.
   *
   * @param event Browser keyboard event.
   * @returns True when the event was consumed.
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.session.isActive() || !this.host?.isDragging()) {
      return false;
    }
    const routed = transformModalKeyboardRoute(event);
    if (!routed) {
      return false;
    }
    return this.dispatchRoutedAction(routed);
  }

  /**
   * Dispatches a routed modal keyboard action.
   *
   * @param routed Routed action payload.
   * @returns True when consumed.
   */
  private dispatchRoutedAction(routed: TransformModalKeyboardEvent): boolean {
    if (this.isAxisToggleAction(routed.action)) {
      return this.handleAxisToggle(routed.action);
    }
    if (routed.action === TransformModalKeyboardAction.AppendDigit) {
      return this.handleAppendDigit(routed.digit ?? '');
    }
    if (routed.action === TransformModalKeyboardAction.AppendDecimal) {
      return this.handleAppendDecimal();
    }
    if (routed.action === TransformModalKeyboardAction.ToggleSign) {
      return this.handleToggleSign();
    }
    if (routed.action === TransformModalKeyboardAction.Backspace) {
      return this.handleBackspace();
    }
    if (routed.action === TransformModalKeyboardAction.Confirm) {
      return this.handleConfirm();
    }
    if (routed.action === TransformModalKeyboardAction.Cancel) {
      return this.handleCancel();
    }
    return false;
  }

  /**
   * Returns whether an action toggles an axis lock.
   *
   * @param action Keyboard action.
   * @returns True for X/Y/Z toggles.
   */
  private isAxisToggleAction(action: TransformModalKeyboardAction): boolean {
    return (
      action === TransformModalKeyboardAction.ToggleAxisX ||
      action === TransformModalKeyboardAction.ToggleAxisY ||
      action === TransformModalKeyboardAction.ToggleAxisZ
    );
  }

  /**
   * Toggles a modal axis lock and re-applies the current transform.
   *
   * @param action Axis toggle action.
   * @returns True when consumed.
   */
  private handleAxisToggle(action: TransformModalKeyboardAction): boolean {
    if (!this.allowsAxisConstraintToggle()) {
      return false;
    }
    const next = this.axisFromToggleAction(action);
    const updated = transformModalAxisToggle(this.session.getAxis(), next);
    this.session.setAxis(updated);
    this.clearNumericBufferWhenAxisUnlocked(updated);
    this.syncConstraintLine();
    this.reapplyAfterKeyboardEdit();
    this.publishStatus();
    return true;
  }

  /**
   * Clears typed digits when the keyboard axis lock is removed so numeric entry
   * cannot stick without an active axis constraint, except free single-use
   * scale which keeps typed uniform factors without a lock.
   *
   * @param axis Axis lock after the toggle.
   */
  private clearNumericBufferWhenAxisUnlocked(axis: TransformModalAxis): void {
    if (transformModalAxisIsLocked(axis)) {
      return;
    }
    if (this.allowsNumericTypingWithoutAxisLock()) {
      return;
    }
    this.session.getNumericBuffer().clear();
  }

  /**
   * Returns whether X/Y/Z constraints may apply for the current drag handle.
   *
   * @returns True when axis toggles are allowed.
   */
  private allowsAxisConstraintToggle(): boolean {
    if (!this.host) {
      return false;
    }
    return transformModalAxisToggleAllowed(this.host.getMode(), this.host.getActiveAxis(), this.host.isSingleUseDrag());
  }

  /**
   * Maps a toggle action to a modal axis.
   *
   * @param action Axis toggle action.
   * @returns Modal axis X/Y/Z.
   */
  private axisFromToggleAction(
    action: TransformModalKeyboardAction,
  ): TransformModalAxis.X | TransformModalAxis.Y | TransformModalAxis.Z {
    if (action === TransformModalKeyboardAction.ToggleAxisX) return TransformModalAxis.X;
    if (action === TransformModalKeyboardAction.ToggleAxisY) return TransformModalAxis.Y;
    return TransformModalAxis.Z;
  }

  /**
   * Appends a digit and previews the typed value when parseable.
   *
   * @param digit Digit character.
   * @returns True when consumed.
   */
  private handleAppendDigit(digit: string): boolean {
    if (!this.allowsNumericTyping()) {
      return false;
    }
    if (!this.session.getNumericBuffer().appendDigit(digit)) {
      return false;
    }
    this.reapplyAfterKeyboardEdit();
    this.publishStatus();
    return true;
  }

  /**
   * Appends a decimal point and previews the typed value when parseable.
   *
   * @returns True when consumed.
   */
  private handleAppendDecimal(): boolean {
    if (!this.allowsNumericTyping()) {
      return false;
    }
    if (!this.session.getNumericBuffer().appendDecimalPoint()) {
      return false;
    }
    this.reapplyAfterKeyboardEdit();
    this.publishStatus();
    return true;
  }

  /**
   * Toggles the typed value sign at any time (before digits, mid-entry, or
   * after a complete number), matching modal numeric input.
   *
   * @returns True when consumed.
   */
  private handleToggleSign(): boolean {
    if (!this.allowsNumericTyping()) {
      return false;
    }
    this.session.getNumericBuffer().toggleSign();
    this.reapplyAfterKeyboardEdit();
    this.publishStatus();
    return true;
  }

  /**
   * Removes the last typed character.
   *
   * @returns True when consumed.
   */
  private handleBackspace(): boolean {
    if (!this.allowsNumericTyping() && !this.session.getNumericBuffer().hasText()) {
      return false;
    }
    if (!this.session.getNumericBuffer().backspace()) {
      return false;
    }
    this.reapplyAfterKeyboardEdit();
    this.publishStatus();
    return true;
  }

  /**
   * Confirms a typed value when present, otherwise commits the current drag.
   *
   * @returns True when consumed.
   */
  private handleConfirm(): boolean {
    if (!this.host) {
      return false;
    }
    const text = this.session.getNumericBuffer().getText();
    if (text.length > 0) {
      if (!this.applyParsedNumericBuffer(text)) {
        return true;
      }
    }
    this.host.commitDrag();
    this.endDrag();
    return true;
  }

  /**
   * Returns whether exact numeric entry is allowed: single-use G/R/S only. Move
   * and rotate need a keyboard X/Y/Z axis constraint. Free single-use scale
   * accepts typed numbers without a constraint for uniform scaling.
   *
   * @returns True when digits may be typed and applied.
   */
  private allowsNumericTyping(): boolean {
    if (!this.host?.isSingleUseDrag()) {
      return false;
    }
    if (this.allowsNumericTypingWithoutAxisLock()) {
      return true;
    }
    return transformModalAxisIsLocked(this.session.getAxis());
  }

  /**
   * Returns whether the active mode may type exact numbers without an axis
   * constraint (single-use free scale only).
   *
   * @returns True for single-use scale without requiring X/Y/Z lock.
   */
  private allowsNumericTypingWithoutAxisLock(): boolean {
    return this.host?.getMode() === TransformMode.SCALE;
  }

  /**
   * Applies a fully parsed typed buffer along the locked keyboard axis, or as
   * free uniform scale when single-use scale has no axis constraint.
   *
   * @param text Numeric buffer text.
   * @returns True when the value was applied.
   */
  private applyParsedNumericBuffer(text: string): boolean {
    if (!this.host || !this.allowsNumericTyping()) {
      return false;
    }
    const value = transformModalNumericParse(text);
    if (value === null) {
      return false;
    }
    const axis = this.session.getAxis();
    if (!transformModalAxisIsLocked(axis) && !this.allowsNumericTypingWithoutAxisLock()) {
      return false;
    }
    return this.host.applyNumericValue(value, axis);
  }

  /**
   * Cancels typed input first; if empty, cancels the whole drag.
   *
   * @returns True when consumed.
   */
  private handleCancel(): boolean {
    if (!this.host) {
      return false;
    }
    if (this.session.getNumericBuffer().hasText()) {
      this.session.getNumericBuffer().clear();
      this.host.reapplyMouseDrivenTransform();
      this.publishStatus();
      return true;
    }
    this.host.cancelDrag();
    this.endDrag();
    return true;
  }

  /** Re-applies either the typed value or the last mouse-driven transform. */
  private reapplyAfterKeyboardEdit(): void {
    if (!this.host) {
      return;
    }
    const text = this.session.getNumericBuffer().getText();
    if (text.length === 0) {
      this.host.reapplyMouseDrivenTransform();
      return;
    }
    this.applyParsedNumericBuffer(text);
  }

  /** Syncs the RGB constraint guide with the keyboard axis lock. */
  private syncConstraintLine(): void {
    this.host?.setConstraintLineAxis(this.session.getAxis());
  }

  /** Publishes modal status text through the host. */
  private publishStatus(): void {
    if (!this.host) {
      return;
    }
    const text = transformModalStatusText(
      this.host.getMode(),
      this.session.getAxis(),
      this.session.getNumericBuffer().getText(),
    );
    this.host.setStatusText(text);
  }
}
