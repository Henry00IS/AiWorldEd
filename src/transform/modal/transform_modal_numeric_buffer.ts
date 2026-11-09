/** Accumulates typed characters for a modal numeric transform value. */
export class TransformModalNumericBuffer {
  private magnitudeText: string;
  private isNegative: boolean;

  /** Creates an empty numeric buffer. */
  constructor() {
    this.magnitudeText = '';
    this.isNegative = false;
  }

  /**
   * Returns the raw buffer text including a leading minus when negative.
   *
   * @returns Current typed characters.
   */
  getText(): string {
    if (this.magnitudeText.length === 0) {
      return this.isNegative ? '-' : '';
    }
    return this.isNegative ? `-${this.magnitudeText}` : this.magnitudeText;
  }

  /**
   * Returns whether the buffer has any characters (digits, decimal, or sign).
   *
   * @returns True when non-empty.
   */
  hasText(): boolean {
    return this.isNegative || this.magnitudeText.length > 0;
  }

  /** Clears all typed characters and the negative sign. */
  clear(): void {
    this.magnitudeText = '';
    this.isNegative = false;
  }

  /**
   * Appends a digit character when valid.
   *
   * @param digit Single digit 0-9.
   * @returns True when the digit was appended.
   */
  appendDigit(digit: string): boolean {
    if (!/^[0-9]$/.test(digit)) {
      return false;
    }
    this.magnitudeText += digit;
    return true;
  }

  /**
   * Appends a decimal point when the magnitude does not already contain one.
   *
   * @returns True when the decimal was appended.
   */
  appendDecimalPoint(): boolean {
    if (this.magnitudeText.includes('.')) {
      return false;
    }
    if (this.magnitudeText.length === 0) {
      this.magnitudeText = '0.';
      return true;
    }
    this.magnitudeText += '.';
    return true;
  }

  /**
   * Toggles the negative sign at any time, including before any digits, after a
   * decimal, or after a complete value.
   *
   * @returns True when the sign state changed.
   */
  toggleSign(): boolean {
    this.isNegative = !this.isNegative;
    return true;
  }

  /**
   * Returns whether the typed value is currently negative.
   *
   * @returns True when the sign is negative.
   */
  isSignNegative(): boolean {
    return this.isNegative;
  }

  /**
   * Removes the last typed magnitude character, or clears the sign when only a
   * leading minus remains.
   *
   * @returns True when a character or sign was removed.
   */
  backspace(): boolean {
    if (this.magnitudeText.length > 0) {
      this.magnitudeText = this.magnitudeText.slice(0, -1);
      return true;
    }
    if (this.isNegative) {
      this.isNegative = false;
      return true;
    }
    return false;
  }
}
