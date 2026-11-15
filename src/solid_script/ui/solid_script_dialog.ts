import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { dialogCardButton, dialogCardStyle } from '@/ui/dialog/dialog_card.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { solidScriptEditorStylesheetEnsure } from './solid_script_editor_css.js';

/** Counter that keeps dialog title ids unique. */
let solidScriptDialogCount = 0;

/**
 * Base of the script editor's modal dialogs: a window with a title bar (its
 * name and an X), the content below it and the button row at the bottom: the
 * main button on the left, Cancel on the right. Enter presses the main button;
 * Escape, the X or a click on the blocker behind it cancels. It stays where it
 * opens, in the middle of the editor.
 */
export abstract class SolidScriptDialog extends PanelFloating {
  /** Main button. */
  protected readonly confirmButton: HTMLButtonElement;
  /** Area below the title bar the dialog content goes in. */
  protected readonly content = document.createElement('div');
  /** Title bar. */
  private readonly titleBar: HTMLElement;
  /** Close control of the title bar. */
  private readonly titleClose: HTMLButtonElement;
  private settled = false;

  /**
   * Builds the window.
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
    Object.assign(this.root.style, { fontSize: '12px', padding: '0', overflow: 'hidden' });
    const bar = this.createStandardTitleBar({ titleText: title, onClose: () => this.cancelRequest() });
    bar.title.id = titleId;
    bar.closeButton.setAttribute('aria-label', 'Close');
    bar.closeButton.title = 'Close (Escape)';
    this.titleBar = bar.bar;
    this.titleClose = bar.closeButton;
    this.content.style.padding = '14px 16px 14px';
    this.root.append(bar.bar, this.content);
    this.confirmButton = dialogCardButton(confirmLabel, true, () => this.confirmRequest());
    this.confirmButton.title = `${confirmLabel} (Enter)`;
    this.root.addEventListener('keydown', (event) => this.key(event));
    this.getBackdropElement()?.addEventListener('mousedown', (event) => {
      if (event.target === this.getBackdropElement()) this.cancelRequest();
    });
  }

  /**
   * Adds a small button to the title bar, left of the X.
   *
   * @param label Button text.
   * @param hint Hover text and accessible name.
   * @param press Runs on click.
   * @returns Button.
   */
  protected titleButton(label: string, hint: string, press: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = hint;
    button.setAttribute('aria-label', hint);
    button.className = this.titleClose.className;
    button.style.cssText = this.titleClose.style.cssText;
    button.addEventListener('click', press);
    this.titleBar.insertBefore(button, this.titleClose);
    return button;
  }

  /** Confirms the dialog; returns false to keep it open. */
  protected abstract confirm(): boolean;

  /** Runs when the dialog is cancelled. */
  protected abstract cancel(): void;

  /**
   * Builds the button row: the main button and any extra buttons on the left,
   * Cancel on the right.
   *
   * @param extra Extra buttons.
   * @returns Row.
   */
  protected buttonRow(...extra: HTMLButtonElement[]): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '8px', alignItems: 'center' });
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    const cancel = dialogCardButton('Cancel', false, () => this.cancelRequest());
    cancel.title = 'Cancel (Escape)';
    row.append(this.confirmButton, ...extra, spacer, cancel);
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
