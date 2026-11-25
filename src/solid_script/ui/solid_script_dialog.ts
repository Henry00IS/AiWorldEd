import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { dialogCardButton, dialogCardStyle } from '@/ui/dialog/dialog_card.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { SOLID_SCRIPT_EDITOR_CLASSES, solidScriptEditorStylesheetEnsure } from './solid_script_editor_css.js';

/** Counter that keeps dialog title ids unique. */
let solidScriptDialogCount = 0;

/** Events that only the topmost dialog may get: keys and the clipboard. */
const SOLID_SCRIPT_DIALOG_KEY_EVENTS = ['keydown', 'keyup', 'copy', 'cut', 'paste'] as const;

/**
 * Base of the script editor's modal dialogs: a window with a title bar (its
 * name and an X), the content below it and the button row at the bottom: Cancel
 * and the main button side by side on the right, as in every window of the
 * editor. Enter presses the main button; Escape, the X or a click on the
 * blocker behind it cancels. It stays where it opens, in the middle of the
 * editor. A dialog opened over another one, such as the formula window over a
 * configurator, closes that window's popups and darkens only that window: its
 * own blocker stays clear, so the editor behind does not get darker and darker,
 * and a click on it does nothing. However it closes, the window below is light
 * again and the focus goes back to what had it when it opened, such as a script
 * line or the window below, so keys never fall through to the scene. The dialog
 * on top takes the keyboard focus when it opens, and keys and the clipboard
 * reach only that dialog: windows below it get none. Undo and redo (Ctrl+Z,
 * Ctrl+Y, Ctrl+Shift+Z) never leave a dialog: in a text field they undo typing,
 * elsewhere they step the dialog's own history, if it has one.
 */
export abstract class SolidScriptDialog extends PanelFloating {
  /** Open dialogs, the topmost last. */
  private static readonly opened: SolidScriptDialog[] = [];
  /** True once the page sends keys and the clipboard through the guard. */
  private static guarding = false;
  /** Main button. */
  protected readonly confirmButton: HTMLButtonElement;
  /** Area below the title bar the dialog content goes in. */
  protected readonly content = document.createElement('div');
  private settled = false;
  /** Pane that darkens this window while a dialog is open over it. */
  private readonly shadePane = document.createElement('div');
  /** How many dialogs are open over this one. */
  private shaded = 0;
  /** What had the keyboard focus when the dialog opened; it gets it back. */
  private opener: HTMLElement | null = null;
  /** True while this dialog darkens the window it opened over. */
  private shading: boolean;

  /**
   * Builds the window.
   *
   * @param host Element the dialog mounts in.
   * @param title Title text.
   * @param confirmLabel Main button text.
   * @param parent Dialog this one opens over, or null.
   * @param movable True lets the title bar move the window, which then places
   *   itself instead of opening in the middle.
   */
  protected constructor(
    host: HTMLElement,
    title: string,
    confirmLabel: string,
    private readonly parent: SolidScriptDialog | null = null,
    movable = false,
  ) {
    super(host, {
      corner: 'top-left',
      modal: true,
      centered: !movable,
      draggable: movable,
      closeOnEscape: false,
      closeOnBackdropClick: false,
      stackLayer: 'modal',
      backdropClassName: 'editor-message-box-backdrop',
      ...(parent ? { backdropBackground: 'transparent' } : {}),
    });
    this.shading = parent !== null;
    parent?.popupsClose();
    parent?.shadeSet(true);
    solidScriptEditorStylesheetEnsure();
    this.frameBuild(title);
    this.confirmButton = dialogCardButton(confirmLabel, true, () => this.confirmRequest());
    this.confirmButton.title = `${confirmLabel} (Enter)`;
    this.root.addEventListener('keydown', (event) => this.key(event));
    this.root.tabIndex = -1;
    this.backdropListen();
  }

  /**
   * Styles the window as a dialog card with its title bar above the content.
   *
   * @param title Title text.
   */
  private frameBuild(title: string): void {
    const titleId = `solid-script-dialog-${++solidScriptDialogCount}`;
    dialogCardStyle(this.root, '440px', titleId);
    Object.assign(this.root.style, { fontSize: '12px', padding: '0', overflow: 'hidden' });
    const bar = this.createStandardTitleBar({ titleText: title, onClose: () => this.cancelRequest() });
    bar.title.id = titleId;
    bar.closeButton.setAttribute('aria-label', 'Close');
    bar.closeButton.title = 'Close (Escape)';
    this.content.style.padding = '14px 16px 14px';
    this.root.append(bar.bar, this.content);
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
   * Builds the button row the way every window of the editor has it: any extra
   * buttons on the left, Cancel and then the main button on the right.
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
    row.append(...extra, spacer, cancel, this.confirmButton);
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
    Object.assign(note.style, {
      margin: '-6px 0 14px',
      color: ThemeCss.mutedTextColor,
      lineHeight: '1.4',
      whiteSpace: 'pre-wrap',
    });
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

  /**
   * Opens the dialog on top, remembering what has the focus, and takes the
   * focus when the dialog put it nowhere inside itself.
   */
  override show(): void {
    const active = document.activeElement;
    if (!this.isOpen()) this.opener = active instanceof HTMLElement && active !== document.body ? active : null;
    SolidScriptDialog.guardListen();
    SolidScriptDialog.opened.push(this);
    super.show();
    if (!this.root.contains(document.activeElement)) this.focusIn();
  }

  /**
   * Gives the dialog the keyboard focus: its first field or button, or the
   * window itself. Dialogs with a list of their own focus that instead.
   */
  protected focusIn(): void {
    const first = this.content.querySelector<HTMLElement>('input, textarea, select, button, [tabindex="0"]');
    (first ?? this.root).focus({ preventScroll: true });
  }

  /** Sends the keys and the clipboard of the page through the guard, once. */
  private static guardListen(): void {
    if (SolidScriptDialog.guarding) return;
    SolidScriptDialog.guarding = true;
    for (const type of SOLID_SCRIPT_DIALOG_KEY_EVENTS)
      document.addEventListener(type, (event) => SolidScriptDialog.guard(event), { capture: true });
  }

  /**
   * Keeps keys and the clipboard from a window below the topmost dialog, and
   * keys from the page while a dialog is open: they are dropped, and the dialog
   * on top takes the focus. Copies a menu runs on the page pass.
   *
   * @param event Key or clipboard event.
   */
  private static guard(event: Event): void {
    const opened = SolidScriptDialog.opened.filter((dialog) => dialog.root.isConnected);
    const top = opened.at(-1);
    const target = event.target;
    if (!top || !(target instanceof Node)) return;
    const curveEditor = document.querySelector<HTMLElement>('[data-curve-editor]');
    if (
      curveEditor &&
      (curveEditor.contains(target) || Number(curveEditor.style.zIndex) > Number(top.root.style.zIndex))
    )
      return;
    const page = event instanceof KeyboardEvent && (target === document.body || target === document.documentElement);
    const below = opened.some((dialog) => dialog !== top && dialog.root.contains(target));
    if (!page && (!below || top.root.contains(target))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    top.focusIn();
  }

  /** Closes for good, handing the focus back when it was in the dialog. */
  protected close(): void {
    this.settled = true;
    const active = document.activeElement;
    const held = !active || active === document.body || this.root.contains(active);
    this.dispose();
    if (held) this.focusReturn();
  }

  /**
   * Closes the popups of this window, such as suggestion lists, when the window
   * hides or a dialog opens over it.
   */
  protected popupsClose(): void {}

  /** Closes the popups and lightens the window below, however the dialog hides. */
  protected override onAfterHide(): void {
    const index = SolidScriptDialog.opened.indexOf(this);
    if (index >= 0) SolidScriptDialog.opened.splice(index, 1);
    this.popupsClose();
    if (this.shading) this.parent?.shadeSet(false);
    this.shading = false;
  }

  /**
   * Gives the focus back to what had it when the dialog opened, or to the
   * window it opened over when that is gone.
   */
  private focusReturn(): void {
    const below = this.parent?.root.querySelector<HTMLElement>('input, textarea, select, button, [tabindex]');
    const back = this.opener?.isConnected ? this.opener : below;
    back?.focus({ preventScroll: true });
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
   * Undoes (false) or redoes (true) a step of the dialog's own history, for
   * Ctrl+Z and Ctrl+Y outside a text field. Dialogs without one do nothing.
   *
   * @param _redo True for redo.
   */
  protected historyStep(_redo: boolean): void {}

  /**
   * Handles Enter, Escape, undo and redo; other keys stay inside the dialog.
   *
   * @param event Key event.
   */
  private key(event: KeyboardEvent): void {
    event.stopPropagation();
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      this.historyStep(key === 'y' || event.shiftKey);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelRequest();
    } else if (event.key === 'Enter' && this.enterConfirms(event.target)) {
      event.preventDefault();
      this.confirmRequest();
    }
  }
}
