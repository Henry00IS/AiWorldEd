import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';

/**
 * Options for a reusable modal message box (Yes/No style prompts such as File →
 * New and Settings → Reset).
 */
export interface MessageBoxOptions {
  /** Parent element that owns the modal overlay. */
  host: HTMLElement;
  /** Dialog title shown in the header. */
  title: string;
  /** Body message explaining the consequence of confirming. */
  message: string;
  /**
   * Optional bold line rendered under the main message (e.g. permanent-loss
   * warnings).
   */
  boldMessage?: string;
  /** Affirmative button label. Defaults to "Yes". */
  confirmLabel?: string;
  /** Dismiss button label. Defaults to "No". */
  cancelLabel?: string;
  /** Optional third button shown between dismiss and confirm. */
  extraLabel?: string;
}

/** Button a three-way message box settled with; Escape and backdrop give cancel. */
export type MessageBoxChoice = 'confirm' | 'extra' | 'cancel';

/**
 * Shows a professional modal message box and resolves when the user chooses Yes
 * or No. Escape and backdrop click dismiss as No.
 *
 * @param options Dialog title, message, labels, and host element.
 * @returns Promise resolving true when Yes is chosen.
 */
export function showMessageBox(options: MessageBoxOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => messageBoxOpen(options, (choice) => resolve(choice === 'confirm')));
}

/**
 * Shows the message box with up to three buttons and resolves with the one
 * chosen. Escape and backdrop click resolve as cancel.
 *
 * @param options Dialog title, message, labels (extraLabel adds the third
 *   button), and host.
 * @returns Promise resolving with the chosen button.
 */
export function showMessageChoice(options: MessageBoxOptions): Promise<MessageBoxChoice> {
  return new Promise<MessageBoxChoice>((resolve) => messageBoxOpen(options, resolve));
}

/**
 * Opens a message box that reports the chosen button synchronously, so callers
 * resolve their promise in the same tick, and disposes it afterwards.
 *
 * @param options Dialog configuration.
 * @param settle Receives the chosen button once.
 */
function messageBoxOpen(options: MessageBoxOptions, settle: (choice: MessageBoxChoice) => void): void {
  const dialog = new DialogMessageBox(options, (choice) => {
    settle(choice);
    queueMicrotask(() => dialog.dispose());
  });
  dialog.show();
}

/**
 * Alias kept for call sites that still import {@link showConfirmDialog}.
 *
 * @param options Dialog options.
 * @returns Promise resolving true when Yes is chosen.
 */
export function showConfirmDialog(options: MessageBoxOptions): Promise<boolean> {
  return showMessageBox(options);
}

/** @deprecated Prefer {@link MessageBoxOptions}. */
export type ConfirmDialogOptions = MessageBoxOptions;

/**
 * Modal Yes/No message box built on {@link PanelFloating}. Settles once when the
 * user chooses a button, Escape, or the backdrop.
 */
class DialogMessageBox extends PanelFloating {
  private readonly options: MessageBoxOptions;
  private readonly settle: (choice: MessageBoxChoice) => void;
  private settled: boolean;
  private readonly boundKeyDown: (event: KeyboardEvent) => void;

  /**
   * @param options Dialog configuration.
   * @param settle Callback invoked once with the chosen button.
   */
  constructor(options: MessageBoxOptions, settle: (choice: MessageBoxChoice) => void) {
    super(options.host, {
      corner: 'top-left',
      modal: true,
      centered: true,
      draggable: false,
      closeOnEscape: false,
      closeOnBackdropClick: false,
      stackLayer: 'confirm',
      backdropClassName: 'editor-message-box-backdrop',
    });
    this.options = options;
    this.settle = settle;
    this.settled = false;
    this.boundKeyDown = (event) => this.handleKeyDown(event);
    this.buildDialog();
    this.bindBackdropDismiss();
  }

  /** Focuses the cancel button after the shell becomes visible. */
  protected override onAfterShow(): void {
    document.addEventListener('keydown', this.boundKeyDown);
    const cancelButton = this.root.querySelector<HTMLButtonElement>('[data-message-box-cancel="true"]');
    cancelButton?.focus();
  }

  /** Removes temporary key listeners when hidden. */
  protected override onAfterHide(): void {
    document.removeEventListener('keydown', this.boundKeyDown);
  }

  /** Builds title, message body, and action buttons into the shell. */
  private buildDialog(): void {
    this.root.className = 'editor-message-box-panel';
    this.root.setAttribute('role', 'alertdialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'editor-message-box-title');
    this.applyPanelChrome();
    this.root.appendChild(this.createTitle());
    this.root.appendChild(this.createMessageBody());
    this.root.appendChild(this.createButtonRow());
    this.root.addEventListener('mousedown', (event) => event.stopPropagation());
  }

  /** Binds backdrop click as a cancel action. */
  private bindBackdropDismiss(): void {
    const backdrop = this.getBackdropElement();
    if (!backdrop) {
      return;
    }
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) {
        this.settleDecision('cancel');
      }
    });
  }

  /**
   * Handles Escape as cancel and Enter as confirm when focus is not a button.
   *
   * @param event Document keydown event.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.settleDecision('cancel');
      return;
    }
    if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      this.settleDecision('confirm');
    }
  }

  /**
   * Settles the promise once and hides the dialog.
   *
   * @param choice Button the user chose.
   */
  private settleDecision(choice: MessageBoxChoice): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.hide(true);
    this.settle(choice);
  }

  /** Applies Blender-inspired dark chrome to the dialog panel. */
  private applyPanelChrome(): void {
    this.root.style.minWidth = '360px';
    this.root.style.maxWidth = '440px';
    this.root.style.padding = '18px 20px 16px';
    this.root.style.borderRadius = '10px';
    this.root.style.background = `linear-gradient(180deg, ${hexToRgb(Theme.toolbarBackground)} 0%, ${hexToRgb(Theme.toolbarBackgroundEnd)} 100%)`;
    this.root.style.border = '1px solid rgba(255,255,255,0.1)';
    this.root.style.boxShadow = '0 18px 48px rgba(0,0,0,0.65)';
    this.root.style.color = Theme.buttonTextColor;
    this.root.style.boxSizing = 'border-box';
    this.root.style.fontFamily = Theme.uiFontFamily;
  }

  /**
   * Creates the dialog title heading.
   *
   * @returns Title element.
   */
  private createTitle(): HTMLElement {
    const title = document.createElement('h2');
    title.id = 'editor-message-box-title';
    title.textContent = this.options.title;
    title.style.margin = '0 0 10px';
    title.style.fontSize = '15px';
    title.style.fontWeight = '600';
    title.style.letterSpacing = '0.01em';
    title.style.color = '#f0f0f0';
    return title;
  }

  /**
   * Creates the message body block (main text plus optional bold footer line).
   *
   * @returns Message container element.
   */
  private createMessageBody(): HTMLElement {
    const body = document.createElement('div');
    body.style.margin = '0 0 18px';
    body.appendChild(this.createMessageParagraph(this.options.message, false));
    if (this.options.boldMessage && this.options.boldMessage.trim().length > 0) {
      body.appendChild(this.createMessageParagraph(this.options.boldMessage, true));
    }
    return body;
  }

  /**
   * Creates one message paragraph.
   *
   * @param text Paragraph text.
   * @param bold Whether to render in bold.
   * @returns Paragraph element.
   */
  private createMessageParagraph(text: string, bold: boolean): HTMLElement {
    const message = document.createElement('p');
    message.textContent = text;
    message.style.margin = bold ? '12px 0 0' : '0';
    message.style.fontSize = '13px';
    message.style.lineHeight = '1.45';
    message.style.color = bold ? '#f0f0f0' : '#c8c8c8';
    message.style.fontWeight = bold ? '700' : '400';
    message.style.whiteSpace = 'pre-wrap';
    return message;
  }

  /**
   * Creates the Yes/No button row aligned to the right.
   *
   * @returns Button row container.
   */
  private createButtonRow(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'flex-end';
    row.style.gap = '8px';
    row.appendChild(this.createButton(this.options.cancelLabel ?? 'No', 'cancel'));
    if (this.options.extraLabel) row.appendChild(this.createButton(this.options.extraLabel, 'extra'));
    row.appendChild(this.createButton(this.options.confirmLabel ?? 'Yes', 'confirm'));
    return row;
  }

  /**
   * Creates one dialog action button.
   *
   * @param label Button text.
   * @param choice Choice the button settles with.
   * @returns Styled button element.
   */
  private createButton(label: string, choice: MessageBoxChoice): HTMLButtonElement {
    const isConfirm = choice === 'confirm';
    const isCancel = choice === 'cancel';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (isCancel) {
      button.dataset['messageBoxCancel'] = 'true';
      button.dataset['confirmCancel'] = 'true';
    }
    if (isConfirm) {
      button.dataset['messageBoxAccept'] = 'true';
      button.dataset['confirmAccept'] = 'true';
    }
    if (choice === 'extra') button.dataset['messageBoxExtra'] = 'true';
    this.styleActionButton(button, isConfirm);
    button.addEventListener('click', () => this.settleDecision(choice));
    return button;
  }

  /**
   * Applies compact chrome to a dialog button.
   *
   * @param button Button element.
   * @param isPrimary Whether the button is the affirmative action.
   */
  private styleActionButton(button: HTMLButtonElement, isPrimary: boolean): void {
    button.style.minWidth = '72px';
    button.style.padding = '7px 14px';
    button.style.borderRadius = '6px';
    button.style.border = isPrimary
      ? `1px solid ${hexToRgb(Theme.selectionColor)}`
      : '1px solid rgba(255,255,255,0.12)';
    button.style.background = isPrimary ? 'rgba(232, 106, 23, 0.28)' : 'rgba(255,255,255,0.06)';
    button.style.color = '#f2f2f2';
    button.style.cursor = 'pointer';
    button.style.fontFamily = Theme.uiFontFamily;
    button.style.fontSize = '12px';
    button.style.fontWeight = '600';
  }
}
