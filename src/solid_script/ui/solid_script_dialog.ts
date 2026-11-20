import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { dialogCardButton, dialogCardStyle } from '@/ui/dialog/dialog_card.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { SOLID_SCRIPT_EDITOR_CLASSES, solidScriptEditorStylesheetEnsure } from './solid_script_editor_css.js';

/** Counter that keeps dialog title ids unique. */
let solidScriptDialogCount = 0;

/**
 * Base of the script editor's modal dialogs: a window with a title bar (its
 * name and an X), the content below it and the button row at the bottom: the
 * main button on the left, Cancel on the right. Enter presses the main button;
 * Escape, the X or a click on the blocker behind it cancels. It stays where it
 * opens, in the middle of the editor. A dialog opened over another one, such as
 * the formula window over a configurator, darkens only that window: its own
 * blocker stays clear, so the editor behind does not get darker and darker.
 */
export abstract class SolidScriptDialog extends PanelFloating {
  /** Main button. */
  protected readonly confirmButton: HTMLButtonElement;
  /** Area below the title bar the dialog content goes in. */
  protected readonly content = document.createElement('div');
  private settled = false;
  /** Pane that darkens this window while a dialog is open over it. */
  private readonly shadePane = document.createElement('div');
  /** How many dialogs are open over this one. */
  private shaded = 0;

  /**
   * Builds the window.
   *
   * @param host Element the dialog mounts in.
   * @param title Title text.
   * @param confirmLabel Main button text.
   * @param parent Dialog this one opens over, or null.
   */
  protected constructor(
    host: HTMLElement,
    title: string,
    confirmLabel: string,
    private readonly parent: SolidScriptDialog | null = null,
  ) {
    super(host, {
      corner: 'top-left',
      modal: true,
      centered: true,
      draggable: false,
      closeOnEscape: false,
      stackLayer: 'modal',
      backdropClassName: 'editor-message-box-backdrop',
      ...(parent ? { backdropBackground: 'transparent' } : {}),
    });
    parent?.shadeSet(true);
    solidScriptEditorStylesheetEnsure();
    const titleId = `solid-script-dialog-${++solidScriptDialogCount}`;
    dialogCardStyle(this.root, '440px', titleId);
    Object.assign(this.root.style, { fontSize: '12px', padding: '0', overflow: 'hidden' });
    const bar = this.createStandardTitleBar({ titleText: title, onClose: () => this.cancelRequest() });
    bar.title.id = titleId;
    bar.closeButton.setAttribute('aria-label', 'Close');
    bar.closeButton.title = 'Close (Escape)';
    this.content.style.padding = '14px 16px 14px';
    this.root.append(bar.bar, this.content);
    this.confirmButton = dialogCardButton(confirmLabel, true, () => this.confirmRequest());
    this.confirmButton.title = `${confirmLabel} (Enter)`;
    this.root.addEventListener('keydown', (event) => this.key(event));
    this.backdropListen();
  }

  /**
   * Cancels on a click on the blocker behind, unless the dialog opens over
   * another one, whose blocker stays clear.
   */
  private backdropListen(): void {
    this.getBackdropElement()?.addEventListener('mousedown', (event) => {
      if (event.target === this.getBackdropElement() && !this.parent) this.cancelRequest();
    });
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
    if (!this.settled) this.parent?.shadeSet(false);
    this.settled = true;
    this.dispose();
  }

  /**
   * Darkens this window while a dialog is open over it, and lightens it again
   * when the last one closes.
   *
   * @param on True when a dialog opens over it, false when one closes.
   */
  shadeSet(on: boolean): void {
    this.shaded = Math.max(0, this.shaded + (on ? 1 : -1));
    if (this.shaded > 0 && !this.shadePane.isConnected) {
      if (getComputedStyle(this.root).position === 'static') this.root.style.position = 'relative';
      this.shadePane.className = SOLID_SCRIPT_EDITOR_CLASSES.shade;
      this.root.append(this.shadePane);
    } else if (this.shaded === 0) this.shadePane.remove();
  }

  /**
   * Tells whether this window is darkened by a dialog open over it.
   *
   * @returns True while it is.
   */
  isShaded(): boolean {
    return this.shaded > 0;
  }

  /**
   * Tells whether Enter pressed on an element presses the main button: on
   * anything but a button, which Enter presses itself.
   *
   * @param target Element the key was pressed on.
   * @returns True when Enter confirms.
   */
  protected enterConfirms(target: EventTarget | null): boolean {
    return !(target instanceof HTMLButtonElement);
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
    } else if (event.key === 'Enter' && this.enterConfirms(event.target)) {
      event.preventDefault();
      this.confirmRequest();
    }
  }
}
