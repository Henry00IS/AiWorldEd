import { TransformModalNumericBuffer } from '@/transform/modal/transform_modal_numeric_buffer.js';
import { transformModalNumericParse } from '@/transform/modal/transform_modal_numeric_parser.js';

/**
 * Typed number entry for interactive Edit Mode tools: digits, a decimal point,
 * minus to flip the sign and Backspace. While text is typed it overrides the
 * value the pointer would give.
 */
export class EditNumericEntry {
  private readonly buffer: TransformModalNumericBuffer;

  /** Creates an empty entry. */
  constructor() {
    this.buffer = new TransformModalNumericBuffer();
  }

  /**
   * Feeds one key into the entry.
   *
   * @param keyCode Key code such as Digit3, Numpad3, Period, Minus or
   *   Backspace.
   * @returns True when the key was used.
   */
  handleKey(keyCode: string): boolean {
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(keyCode);
    if (digit) return this.buffer.appendDigit(digit[1]!);
    if (keyCode === 'Period' || keyCode === 'NumpadDecimal' || keyCode === 'Comma') {
      this.buffer.appendDecimalPoint();
      return true;
    }
    if (keyCode === 'Minus' || keyCode === 'NumpadSubtract') return this.buffer.toggleSign();
    if (keyCode === 'Backspace') {
      this.buffer.backspace();
      return true;
    }
    return false;
  }

  /**
   * Returns the typed value.
   *
   * @returns Number, or null when nothing complete is typed.
   */
  readValue(): number | null {
    return transformModalNumericParse(this.buffer.getText());
  }

  /**
   * Returns whether anything is typed, including a lone minus.
   *
   * @returns True when the entry has text.
   */
  hasText(): boolean {
    return this.buffer.hasText();
  }

  /**
   * Returns the typed text for status display.
   *
   * @returns Typed characters.
   */
  readText(): string {
    return this.buffer.getText();
  }

  /**
   * Resolves the value a tool should use: the typed value, the pointer value
   * with a typed lone minus flipping it, or the pointer value as is.
   *
   * @param pointerValue Value from the pointer.
   * @returns Value to apply.
   */
  resolve(pointerValue: number): number {
    const typed = this.readValue();
    if (typed !== null) return typed;
    return this.buffer.isSignNegative() ? -pointerValue : pointerValue;
  }
}
