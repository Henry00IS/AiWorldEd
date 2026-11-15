import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { dialogCardButton, dialogCardStyle, dialogCardTitle } from '@/ui/dialog/dialog_card.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { solidScriptEditorStylesheetEnsure } from './solid_script_editor_css.js';

/** Counter that keeps dialog title ids unique. */
let solidScriptDialogCount = 0;

/**
 * Base of the script editor's modal dialogs: a card with a title, Enter to
 * confirm, and Escape or the backdrop to cancel.
 */
export abstract class SolidScriptDialog extends PanelFloating {
  /** Main button. */
  protected readonly confirmButton: HTMLButtonElement;
  private settled = false;

  /**
   * Builds the card.
   *
   * @param host Element the dialog mounts in.
   * @param title Title text.
   * @param confirmLabel Main button text.
   */
  protected constructor(host: HTMLElement, title: string, confirmLabel: string) {
    super(host, {
      corner: 'top-left',
      modal: true,
      centered: true,
      draggable: false,
      closeOnEscape: false,
      stackLayer: 'modal',
      backdropClassName: 'editor-message-box-backdrop',
    });
    solidScriptEditorStylesheetEnsure();
    const titleId = `solid-script-dialog-${++solidScriptDialogCount}`;
    dialogCardStyle(this.root, '440px', titleId);
    this.root.style.fontSize = '12px';
    this.root.append(dialogCardTitle(titleId, title));
    this.confirmButton = dialogCardButton(confirmLabel, true, () => this.confirmRequest());
    this.root.addEventListener('keydown', (event) => this.key(event));
    this.getBackdropElement()?.addEventListener('mousedown', (event) => {
      if (event.target === this.getBackdropElement()) this.cancelRequest();
    });
  }

  /** Confirms the dialog; returns false to keep it open. */
  protected abstract confirm(): boolean;

  /** Runs when the dialog is cancelled. */
  protected abstract cancel(): void;

  /**
   * Builds the button row: extra buttons on the left, Cancel and the main
   * button on the right.
   *
   * @param extra Extra buttons.
   * @returns Row.
   */
  protected buttonRow(...extra: HTMLButtonElement[]): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '8px', alignItems: 'center' });
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    row.append(
      ...extra,
      spacer,
      dialogCardButton('Cancel', false, () => this.cancelRequest()),
      this.confirmButton,
    );
    return row;
  }

  /**
   * Builds a muted explanation line.
   *
   * @param text Text.
   * @returns Paragraph.
   */
  protected note(text: string): HTMLElement {
    const note = document.createElement('p');
    note.textContent = text;
    Object.assign(note.style, { margin: '-6px 0 14px', color: ThemeCss.mutedTextColor, lineHeight: '1.4' });
    return note;
  }

  /**
   * Enables or disables the main button.
   *
   * @param enabled True to enable.
   */
  protected confirmEnable(enabled: boolean): void {
    this.confirmButton.disabled = !enabled;
    this.confirmButton.style.opacity = enabled ? '1' : '0.45';
    this.confirmButton.style.cursor = enabled ? 'pointer' : 'default';
  }

  /** Confirms when allowed, then closes. */
  protected confirmRequest(): void {
    if (this.settled || this.confirmButton.disabled || !this.confirm()) return;
    this.close();
  }

  /** Cancels, then closes. */
  private cancelRequest(): void {
    if (this.settled) return;
    this.cancel();
    this.close();
  }

  /** Closes for good. */
  protected close(): void {
    this.settled = true;
    this.dispose();
  }

  /**
   * Handles Enter and Escape; other keys stay inside the dialog.
   *
   * @param event Key event.
   */
  private key(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelRequest();
    } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      this.confirmRequest();
    }
  }
}
