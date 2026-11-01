import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import {
  uiCollaborationChrome,
  uiCollaborationText,
  uiCollaborationTextSet,
  uiCollaborationTitle,
  type UiCollaborationTone,
} from '@/collaboration/ui/ui_collaboration_elements.js';

/**
 * Modal collaboration dialog that resolves a value once: the chosen result, or
 * null when cancelled with a button, Escape or by closing.
 */
export abstract class DialogCollaborationBase<T> extends PanelFloating {
  protected readonly body: HTMLElement;
  protected readonly feedback: HTMLElement;
  private resolver: ((value: T | null) => void) | null;

  /**
   * Creates the dialog shell.
   *
   * @param host Element that hosts the modal.
   * @param title Dialog title.
   * @param width Preferred width in pixels.
   */
  protected constructor(host: HTMLElement, title: string, width: number) {
    super(host, {
      corner: 'top-left',
      modal: true,
      centered: true,
      draggable: false,
      closeOnEscape: true,
      closeOnBackdropClick: false,
      stackLayer: 'modal',
    });
    this.resolver = null;
    uiCollaborationChrome(this.root, width);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.body = document.createElement('div');
    this.feedback = uiCollaborationText('', 'bad');
    this.root.append(uiCollaborationTitle(title), this.body, this.feedback);
    this.root.addEventListener('mousedown', (event) => event.stopPropagation());
    this.root.addEventListener('keydown', (event) => event.stopPropagation());
  }

  /**
   * Shows the dialog.
   *
   * @returns The result, or null when cancelled.
   */
  open(): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
      this.resolver = resolve;
      this.show();
      this.focusFirst();
    });
  }

  /**
   * Closes the dialog with a result.
   *
   * @param value Result, or null for cancel.
   */
  protected finish(value: T | null): void {
    const resolver = this.resolver;
    this.resolver = null;
    this.dispose();
    resolver?.(value);
  }

  /**
   * Shows a feedback line under the form.
   *
   * @param text Message, empty to hide.
   * @param tone Color tone.
   */
  protected feedbackSet(text: string, tone: UiCollaborationTone = 'bad'): void {
    uiCollaborationTextSet(this.feedback, text, tone);
  }

  /** Resolves null when hidden without a result (Escape). */
  protected override onAfterHide(): void {
    const resolver = this.resolver;
    this.resolver = null;
    if (resolver !== null) queueMicrotask(() => this.finishCancelled(resolver));
  }

  /**
   * Disposes after an Escape close and resolves null.
   *
   * @param resolver Pending resolver.
   */
  private finishCancelled(resolver: (value: T | null) => void): void {
    this.dispose();
    resolver(null);
  }

  /** Focuses the first input or button. */
  private focusFirst(): void {
    const target = this.root.querySelector<HTMLElement>('input, button');
    target?.focus();
  }
}
