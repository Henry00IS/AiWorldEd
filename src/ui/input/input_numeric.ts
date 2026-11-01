import { Theme } from '@/theme.js';
import {
  INPUT_NUMERIC_MIXED_VALUE_DISPLAY,
  inputNumericFormatDisplayValue,
  inputNumericFormatSharedValues,
  inputNumericNumberOrNull,
  inputNumericParseOptionalNumber,
  type InputNumericParseResult,
} from './input_numeric_parse.js';

/** Optional layout and chrome overrides for a numeric field. */
export interface InputNumericOptions {
  /** Step size stored on the element dataset when provided. */
  step?: number;
  /** CSS width (e.g. "100%" or "48px"). */
  width?: string;
  /** CSS min-width. */
  minWidth?: string;
  /** CSS max-width. */
  maxWidth?: string;
  /** CSS height. */
  height?: string;
  /** CSS padding. */
  padding?: string;
  /** CSS border-radius. */
  borderRadius?: string;
  /** CSS text-align. */
  textAlign?: string;
  /** CSS font-size. */
  fontSize?: string;
  /** Accessible name. */
  ariaLabel?: string;
}

/**
 * Themed numeric text field. Accepts plain numbers and arithmetic expressions
 * and supports multi-select mixed-value display. While the user has typed into
 * the focused field and not yet committed, value refreshes (for example from a
 * collaborator's edit) leave the text alone so typing is never clobbered.
 */
export class InputNumeric {
  private readonly element: HTMLInputElement;
  private readonly focusHandler: () => void;
  private readonly typingHandler: () => void;
  private readonly settleHandler: () => void;
  private typing = false;
  private readonly boundCommitHandlers: Array<(event: Event) => void> = [];
  private isDisposed = false;

  /**
   * Creates a themed numeric input element.
   *
   * @param options Optional layout overrides.
   */
  constructor(options: InputNumericOptions = {}) {
    this.element = document.createElement('input');
    this.focusHandler = () => this.clearMixedValueOnFocus();
    this.typingHandler = () => (this.typing = true);
    this.settleHandler = () => (this.typing = false);
    this.configureElementDefaults();
    this.applyOptions(options);
    this.element.addEventListener('focus', this.focusHandler);
    this.element.addEventListener('input', this.typingHandler);
    this.element.addEventListener('change', this.settleHandler);
    this.element.addEventListener('blur', this.settleHandler);
  }

  /**
   * Returns whether the user is typing an uncommitted value into the focused
   * field.
   *
   * @returns True while typed text awaits a commit.
   */
  isTyping(): boolean {
    return this.typing && this.element.ownerDocument.activeElement === this.element;
  }

  /**
   * Returns the underlying input element.
   *
   * @returns Input DOM node.
   */
  getElement(): HTMLInputElement {
    return this.element;
  }

  /**
   * Returns the current raw text in the field.
   *
   * @returns Input value.
   */
  getText(): string {
    return this.element.value;
  }

  /**
   * Replaces the field text without parsing.
   *
   * @param text Display text.
   */
  setText(text: string): void {
    this.element.value = text;
  }

  /**
   * Writes a shared number or the mixed-value placeholder, unless the user is
   * typing into the field.
   *
   * @param value Shared value or null when mixed.
   * @param minDecimals Minimum fractional digits; more precision up to five
   *   places is shown when needed.
   */
  setNumber(value: number | null, minDecimals: number): void {
    this.refreshText(inputNumericFormatDisplayValue(value, minDecimals));
  }

  /**
   * Writes multi-select values as a shared number or mixed dash, unless the
   * user is typing into the field.
   *
   * @param values Per-object values for this field.
   * @param minDecimals Minimum fractional digits when shared; more precision up
   *   to five places is shown when needed.
   */
  setSharedValues(values: readonly number[], minDecimals: number): void {
    this.refreshText(inputNumericFormatSharedValues(values, minDecimals));
  }

  /**
   * Writes refreshed display text. Typing is never clobbered, unchanged text is
   * not rewritten so the user's selection survives, and a new value arriving
   * while the field is focused is selected so the next keystroke replaces it
   * rather than appending to it.
   *
   * @param text Display text.
   */
  private refreshText(text: string): void {
    if (this.isTyping() || this.element.value === text) return;
    this.element.value = text;
    if (this.element.ownerDocument.activeElement === this.element) this.element.select();
  }

  /**
   * Parses the field as a number or arithmetic expression.
   *
   * @returns Value, skip, or invalid.
   */
  parse(): InputNumericParseResult {
    return inputNumericParseOptionalNumber(this.element.value);
  }

  /**
   * Returns a finite number when the field parses to a value, otherwise null.
   * Skip and invalid both yield null.
   *
   * @returns Parsed number or null.
   */
  parseNumberOrNull(): number | null {
    return inputNumericNumberOrNull(this.parse());
  }

  /**
   * Binds commit handlers for change, and Enter which blurs so change fires
   * once without a double apply.
   *
   * @param onCommit Called when the user commits the field.
   */
  bindCommit(onCommit: () => void): void {
    const handleChange = () => {
      if (this.isDisposed) {
        return;
      }
      onCommit();
    };
    const handleKeyDown = (event: Event) => {
      if (this.isDisposed) {
        return;
      }
      this.handleEnterBlur(event as KeyboardEvent);
    };
    this.element.addEventListener('change', handleChange);
    this.element.addEventListener('keydown', handleKeyDown);
    this.boundCommitHandlers.push(handleChange, handleKeyDown);
  }

  /** Removes focus, typing, and commit listeners. Safe to call more than once. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.element.removeEventListener('focus', this.focusHandler);
    this.element.removeEventListener('input', this.typingHandler);
    this.element.removeEventListener('change', this.settleHandler);
    this.element.removeEventListener('blur', this.settleHandler);
    for (const handler of this.boundCommitHandlers) {
      this.element.removeEventListener('change', handler);
      this.element.removeEventListener('keydown', handler);
    }
    this.boundCommitHandlers.length = 0;
  }

  /**
   * Applies default type, theme colors, and monospace chrome to the input
   * element.
   */
  private configureElementDefaults(): void {
    this.element.type = 'text';
    this.element.inputMode = 'decimal';
    this.element.placeholder = INPUT_NUMERIC_MIXED_VALUE_DISPLAY;
    this.element.style.boxSizing = 'border-box';
    this.element.style.background = Theme.inputBackgroundColor;
    this.element.style.color = Theme.inputTextColor;
    this.element.style.border = `1px solid ${Theme.inputBorderColor}`;
    this.element.style.borderRadius = '2px';
    this.element.style.padding = '2px 4px';
    this.element.style.fontSize = '11px';
    this.element.style.fontFamily = 'monospace';
  }

  /**
   * Applies constructor layout options onto the element.
   *
   * @param options Layout overrides.
   */
  private applyOptions(options: InputNumericOptions): void {
    this.applyStepOption(options.step);
    this.applyWidthOptions(options);
    this.applyChromeOptions(options);
    if (options.ariaLabel) {
      this.element.setAttribute('aria-label', options.ariaLabel);
    }
  }

  /**
   * Stores the optional step size on the element dataset.
   *
   * @param step Optional step size.
   */
  private applyStepOption(step: number | undefined): void {
    if (step === undefined) {
      return;
    }
    this.element.dataset['step'] = String(step);
  }

  /**
   * Applies width-related layout options.
   *
   * @param options Layout overrides.
   */
  private applyWidthOptions(options: InputNumericOptions): void {
    if (options.width !== undefined) {
      this.element.style.width = options.width;
    }
    if (options.minWidth !== undefined) {
      this.element.style.minWidth = options.minWidth;
    }
    if (options.maxWidth !== undefined) {
      this.element.style.maxWidth = options.maxWidth;
    }
    if (options.height !== undefined) {
      this.element.style.height = options.height;
    }
  }

  /**
   * Applies padding, radius, alignment, and font overrides.
   *
   * @param options Layout overrides.
   */
  private applyChromeOptions(options: InputNumericOptions): void {
    if (options.padding !== undefined) {
      this.element.style.padding = options.padding;
    }
    if (options.borderRadius !== undefined) {
      this.element.style.borderRadius = options.borderRadius;
    }
    if (options.textAlign !== undefined) {
      this.element.style.textAlign = options.textAlign;
    }
    if (options.fontSize !== undefined) {
      this.element.style.fontSize = options.fontSize;
    }
  }

  /** Clears a mixed-value dash on focus so typing replaces it. */
  private clearMixedValueOnFocus(): void {
    if (this.element.value.trim() !== INPUT_NUMERIC_MIXED_VALUE_DISPLAY) {
      return;
    }
    this.element.value = '';
  }

  /**
   * Blurs the field on Enter so the change event performs a single commit.
   *
   * @param event Keyboard event.
   */
  private handleEnterBlur(event: KeyboardEvent): void {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    this.element.blur();
  }
}
