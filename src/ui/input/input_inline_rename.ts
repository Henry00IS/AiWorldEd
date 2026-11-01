/**
 * Callback invoked when the inline rename is confirmed.
 *
 * @param newName The new name the user entered.
 */
export type InputInlineRenameConfirmCallback = (newName: string) => void;

/** Callback invoked when the inline rename is cancelled. */
export type InputInlineRenameCancelCallback = () => void;

/** Inclusive start and exclusive end for the initial text selection. */
export type InputInlineRenameSelectionRange = {
  start: number;
  end: number;
};

/**
 * Shared inline text input for renaming a label in place (outliner rows,
 * workspace tabs, and similar chrome). Replaces a text span with an editable
 * input sized to that span so the surrounding chrome does not reflow.
 */
export class InputInlineRename {
  private inputElement: HTMLInputElement;
  private originalText: string;
  private parentElement: HTMLElement;
  private textSpan: HTMLSpanElement;
  private isDisposed: boolean;
  private isFinishing: boolean;
  private parentWasDraggable: boolean;
  private confirmCallback: InputInlineRenameConfirmCallback | null;
  private cancelCallback: InputInlineRenameCancelCallback | null;
  private readonly outsidePointerDown: (event: PointerEvent) => void;

  /**
   * Creates a new inline rename input component.
   *
   * @param parentElement The parent DOM element that contains the text span.
   * @param textSpan The span element displaying the current name.
   * @param originalText The current name of the object.
   */
  constructor(parentElement: HTMLElement, textSpan: HTMLSpanElement, originalText: string) {
    this.parentElement = parentElement;
    this.textSpan = textSpan;
    this.originalText = originalText;
    this.isDisposed = false;
    this.isFinishing = false;
    this.parentWasDraggable = false;
    this.confirmCallback = null;
    this.cancelCallback = null;
    this.outsidePointerDown = (event) => this.outsidePointerDownHandle(event);
    this.inputElement = this.createInputElement();
  }

  /**
   * Sets the callback invoked when the rename is confirmed with Enter.
   *
   * @param callback The confirmation callback function.
   */
  setConfirmCallback(callback: InputInlineRenameConfirmCallback): void {
    this.confirmCallback = callback;
  }

  /**
   * Sets the callback invoked when the rename is cancelled with Escape.
   *
   * @param callback The cancellation callback function.
   */
  setCancelCallback(callback: InputInlineRenameCancelCallback): void {
    this.cancelCallback = callback;
  }

  /**
   * Activates the inline rename by placing the input where the name span sits,
   * before trailing row controls (visibility / lock). Input metrics are copied
   * from the span first so tabs and outliner rows keep their height.
   *
   * @param selection Optional initial selection range. When omitted, the full
   *   value is selected (workspace tabs and default hosts).
   */
  activate(selection?: InputInlineRenameSelectionRange): void {
    if (this.isDisposed) {
      return;
    }
    this.isFinishing = false;
    this.parentDragDisableForRename();
    this.matchInputLayoutToTextSpan();
    this.textSpanHide();
    this.inputElementInsertBesideTextSpan();
    this.inputElementFocusAndSelect(selection);
    this.inputElement.ownerDocument.addEventListener('pointerdown', this.outsidePointerDown, true);
  }

  /**
   * Deactivates the inline rename and restores the text span.
   *
   * @param newText The text to restore (either the confirmed or original name).
   */
  deactivate(newText: string): void {
    if (this.isDisposed) {
      return;
    }
    this.parentDragRestoreAfterRename();
    this.textSpan.style.display = '';
    this.restoreHostTextContentIfPlain(newText);
    this.detachInputElement();
  }

  /**
   * Restores plain host text when the span has no child elements. Structured
   * hosts (outliner dual-tone labels) keep their children and repaint after.
   *
   * @param newText Fallback plain text for simple hosts.
   */
  private restoreHostTextContentIfPlain(newText: string): void {
    if (this.textSpan.childElementCount > 0) {
      return;
    }
    this.textSpan.textContent = newText;
  }

  /**
   * Confirms the rename operation with the entered text. Safe if Enter and blur
   * both fire for the same commit.
   */
  confirmRename(): void {
    if (this.isDisposed || this.isFinishing) {
      return;
    }
    this.isFinishing = true;
    const newName = this.inputElement.value.trim() || this.originalText;
    this.deactivate(newName);
    if (this.confirmCallback) {
      this.confirmCallback(newName);
    }
  }

  /**
   * Cancels the rename operation and restores the original name. Safe if Escape
   * and blur both fire for the same cancel.
   */
  cancelRename(): void {
    if (this.isDisposed || this.isFinishing) {
      return;
    }
    this.isFinishing = true;
    this.deactivate(this.originalText);
    if (this.cancelCallback) {
      this.cancelCallback();
    }
  }

  /** Disposes the inline rename input component. */
  dispose(): void {
    this.isDisposed = true;
    this.isFinishing = true;
    this.parentDragRestoreAfterRename();
    this.detachInputElement();
    this.confirmCallback = null;
    this.cancelCallback = null;
  }

  /**
   * Returns the live input element for tests.
   *
   * @returns Input element used while renaming.
   */
  getInputElement(): HTMLInputElement {
    return this.inputElement;
  }

  /**
   * Confirms the rename when the user presses anywhere outside the input.
   * Viewports cancel the default pointer action, so the input would otherwise
   * keep focus and swallow shortcuts such as undo.
   *
   * @param event Pointer event seen in the capture phase.
   */
  private outsidePointerDownHandle(event: PointerEvent): void {
    if (event.target instanceof Node && this.inputElement.contains(event.target)) return;
    this.confirmRename();
  }

  /** Detaches the input from the DOM without assuming its current parent. */
  private detachInputElement(): void {
    this.inputElement.ownerDocument.removeEventListener('pointerdown', this.outsidePointerDown, true);
    if (this.inputElement.parentNode) {
      this.inputElement.remove();
    }
  }

  /**
   * Creates the styled text input element for inline editing.
   *
   * @returns The configured HTML input element.
   */
  private createInputElement(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.originalText;
    input.draggable = false;
    this.applyInputChromeStyles(input);
    this.bindInputElementEvents(input);
    return input;
  }

  /**
   * Applies shared chrome styles so the input can take caret clicks and text
   * selection even when a host sets user-select none on the parent.
   *
   * @param input Input element to style.
   */
  private applyInputChromeStyles(input: HTMLInputElement): void {
    input.style.border = '1px solid #e67e22';
    input.style.borderRadius = '2px';
    input.style.padding = '0 4px';
    input.style.margin = '0';
    input.style.background = '#2a2a2a';
    input.style.color = '#cccccc';
    input.style.fontFamily = 'monospace';
    input.style.fontSize = '12px';
    input.style.lineHeight = '1';
    input.style.outline = 'none';
    input.style.flex = '1';
    input.style.minWidth = '0';
    input.style.boxSizing = 'border-box';
    input.style.verticalAlign = 'middle';
    input.style.userSelect = 'text';
  }

  /**
   * Copies font and height from the visible name span so swapping in the input
   * does not grow workspace tabs or outliner rows.
   */
  private matchInputLayoutToTextSpan(): void {
    const spanStyle = window.getComputedStyle(this.textSpan);
    const spanHeight = this.textSpan.offsetHeight;
    if (spanHeight > 0) {
      this.inputElement.style.height = `${spanHeight}px`;
      this.inputElement.style.maxHeight = `${spanHeight}px`;
    }
    if (spanStyle.fontSize) {
      this.inputElement.style.fontSize = spanStyle.fontSize;
    }
    if (spanStyle.fontFamily) {
      this.inputElement.style.fontFamily = spanStyle.fontFamily;
    }
    if (spanStyle.lineHeight && spanStyle.lineHeight !== 'normal') {
      this.inputElement.style.lineHeight = spanStyle.lineHeight;
    }
  }

  /** Hides the original text span so the input becomes the visible name. */
  private textSpanHide(): void {
    this.textSpan.style.display = 'none';
  }

  /**
   * Inserts the input into the parent at the text span position, before any
   * trailing row controls such as visibility or lock buttons.
   */
  private inputElementInsertBesideTextSpan(): void {
    this.parentElement.insertBefore(this.inputElement, this.textSpan.nextSibling);
  }

  /**
   * Moves keyboard focus to the input and applies the initial selection.
   *
   * @param selection Optional range; full value when omitted.
   */
  private inputElementFocusAndSelect(selection?: InputInlineRenameSelectionRange): void {
    this.inputElement.focus();
    if (!selection) {
      this.inputElement.select();
      return;
    }
    this.inputElementSelectionRangeApply(selection);
  }

  /**
   * Applies a clamped selection range on the live input value.
   *
   * @param selection Inclusive start and exclusive end indices.
   */
  private inputElementSelectionRangeApply(selection: InputInlineRenameSelectionRange): void {
    const valueLength = this.inputElement.value.length;
    const start = this.clampSelectionIndex(selection.start, valueLength);
    const end = this.clampSelectionIndex(selection.end, valueLength);
    this.inputElement.setSelectionRange(Math.min(start, end), Math.max(start, end));
  }

  /**
   * Clamps a selection index into the input value bounds.
   *
   * @param index Candidate index.
   * @param valueLength Length of the input value.
   * @returns Index in 0..valueLength.
   */
  private clampSelectionIndex(index: number, valueLength: number): number {
    if (!Number.isFinite(index)) {
      return 0;
    }
    return Math.max(0, Math.min(valueLength, Math.floor(index)));
  }

  /**
   * Disables HTML5 drag on the host while renaming so caret clicks do not start
   * a drag and blur the input.
   */
  private parentDragDisableForRename(): void {
    this.parentWasDraggable = this.parentElement.draggable;
    this.parentElement.draggable = false;
  }

  /** Restores the host draggable flag saved when rename began. */
  private parentDragRestoreAfterRename(): void {
    this.parentElement.draggable = this.parentWasDraggable;
  }

  /**
   * Binds keyboard, blur, and pointer events for rename commit/cancel and so
   * host click/drag handlers do not steal the caret click.
   *
   * @param input The input element to bind events to.
   */
  private bindInputElementEvents(input: HTMLInputElement): void {
    this.bindInputKeyboardEvents(input);
    this.bindInputPointerIsolationEvents(input);
    input.addEventListener('blur', () => {
      this.confirmRename();
    });
  }

  /**
   * Binds Enter confirm and Escape cancel on the rename input.
   *
   * @param input The input element to bind events to.
   */
  private bindInputKeyboardEvents(input: HTMLInputElement): void {
    input.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.code === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        this.confirmRename();
      }
      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.cancelRename();
      }
    });
  }

  /**
   * Stops pointer and click events from bubbling to draggable hosts or row
   * selection handlers so caret placement does not end the rename session.
   *
   * @param input The input element to isolate.
   */
  private bindInputPointerIsolationEvents(input: HTMLInputElement): void {
    const stopBubble = (event: Event): void => {
      event.stopPropagation();
    };
    input.addEventListener('pointerdown', stopBubble);
    input.addEventListener('mousedown', stopBubble);
    input.addEventListener('click', stopBubble);
    input.addEventListener('dblclick', stopBubble);
  }
}
