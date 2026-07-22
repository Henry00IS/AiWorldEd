/**
 * Callback invoked when the inline rename is confirmed.
 * @param newName The new name the user entered.
 */
export type RenameConfirmCallback = (newName: string) => void;

/**
 * Callback invoked when the inline rename is cancelled.
 */
export type RenameCancelCallback = () => void;

/**
 * Inline text input component for renaming objects in the outliner.
 * Replaces a text label with an editable input on double-click.
 */
export class InlineRenameInput {
  private inputElement: HTMLInputElement;
  private originalText: string;
  private parentElement: HTMLElement;
  private textSpan: HTMLSpanElement;
  private isDisposed: boolean;
  private isFinishing: boolean;
  private confirmCallback: RenameConfirmCallback | null;
  private cancelCallback: RenameCancelCallback | null;

  /**
   * Creates a new inline rename input component.
   * @param parentElement The parent DOM element that contains the text span.
   * @param textSpan The span element displaying the current name.
   * @param originalText The current name of the object.
   */
  constructor(
    parentElement: HTMLElement,
    textSpan: HTMLSpanElement,
    originalText: string
  ) {
    this.parentElement = parentElement;
    this.textSpan = textSpan;
    this.originalText = originalText;
    this.isDisposed = false;
    this.isFinishing = false;
    this.confirmCallback = null;
    this.cancelCallback = null;
    this.inputElement = this.createInputElement();
  }

  /**
   * Sets the callback invoked when the rename is confirmed with Enter.
   * @param callback The confirmation callback function.
   */
  setConfirmCallback(callback: RenameConfirmCallback): void {
    this.confirmCallback = callback;
  }

  /**
   * Sets the callback invoked when the rename is cancelled with Escape.
   * @param callback The cancellation callback function.
   */
  setCancelCallback(callback: RenameCancelCallback): void {
    this.cancelCallback = callback;
  }

  /**
   * Activates the inline rename by replacing the text span with an input.
   */
  activate(): void {
    if (this.isDisposed) return;
    this.isFinishing = false;
    this.textSpan.style.display = 'none';
    this.parentElement.appendChild(this.inputElement);
    this.inputElement.focus();
    this.inputElement.select();
  }

  /**
   * Deactivates the inline rename and restores the text span.
   * @param newText The text to restore (either the confirmed or original name).
   */
  deactivate(newText: string): void {
    if (this.isDisposed) return;
    this.textSpan.style.display = 'inline';
    this.textSpan.textContent = newText;
    this.detachInputElement();
  }

  /**
   * Confirms the rename operation with the entered text.
   * Safe if Enter and blur both fire for the same commit.
   */
  confirmRename(): void {
    if (this.isDisposed || this.isFinishing) return;
    this.isFinishing = true;
    const newName = this.inputElement.value.trim() || this.originalText;
    this.deactivate(newName);
    if (this.confirmCallback) {
      this.confirmCallback(newName);
    }
  }

  /**
   * Cancels the rename operation and restores the original name.
   * Safe if Escape and blur both fire for the same cancel.
   */
  cancelRename(): void {
    if (this.isDisposed || this.isFinishing) return;
    this.isFinishing = true;
    this.deactivate(this.originalText);
    if (this.cancelCallback) {
      this.cancelCallback();
    }
  }

  /**
   * Disposes the inline rename input component.
   */
  dispose(): void {
    this.isDisposed = true;
    this.isFinishing = true;
    this.detachInputElement();
    this.confirmCallback = null;
    this.cancelCallback = null;
  }

  /**
   * Detaches the input from the DOM without assuming its current parent.
   */
  private detachInputElement(): void {
    if (this.inputElement.parentNode) {
      this.inputElement.remove();
    }
  }

  /**
   * Creates the styled text input element for inline editing.
   * @returns The configured HTML input element.
   */
  private createInputElement(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.originalText;
    input.style.border = '1px solid #e67e22';
    input.style.borderRadius = '2px';
    input.style.padding = '1px 4px';
    input.style.background = '#2a2a2a';
    input.style.color = '#cccccc';
    input.style.fontFamily = 'monospace';
    input.style.fontSize = '12px';
    input.style.outline = 'none';
    input.style.width = '100px';
    this.bindInputElementEvents(input);
    return input;
  }

  /**
   * Binds keyboard and blur events for rename commit/cancel.
   * @param input The input element to bind events to.
   */
  private bindInputElementEvents(input: HTMLInputElement): void {
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
    input.addEventListener('blur', () => {
      this.confirmRename();
    });
  }
}
