import { calculateExpression } from '@/ai/shared/mcp_calculate.js';

/** Equality epsilon for shared numeric fields. */
export const INPUT_NUMERIC_VALUE_EPSILON = 1e-5;

/** Unity-style dash for mixed multi-selection values. */
export const INPUT_NUMERIC_MIXED_VALUE_DISPLAY = '—';

/**
 * Maximum fractional digits for editor numeric display. Covers fine snap steps
 * such as 0.03125.
 */
export const INPUT_NUMERIC_DISPLAY_MAX_DECIMALS = 5;

/** Result of parsing a numeric text field. */
export type InputNumericParseResult = { kind: 'value'; value: number } | { kind: 'skip' } | { kind: 'invalid' };

/**
 * Returns whether all numbers in the list are equal within epsilon.
 *
 * @param values Numbers to compare.
 * @returns True when all values match.
 */
export function inputNumericAreValuesShared(values: readonly number[]): boolean {
  if (values.length <= 1) {
    return true;
  }
  const first = values[0]!;
  return values.every((value) => Math.abs(value - first) <= INPUT_NUMERIC_VALUE_EPSILON);
}

/**
 * Parses a UI text field as a number or arithmetic expression.
 *
 * Empty, lone minus, and mixed-value placeholders skip the field. Failed math
 * is invalid.
 *
 * @param text Input text.
 * @returns Value, skip, or invalid parse result.
 */
export function inputNumericParseOptionalNumber(text: string): InputNumericParseResult {
  const trimmed = text.trim();
  if (inputNumericIsSkippedNumberText(trimmed)) {
    return { kind: 'skip' };
  }
  return inputNumericEvaluateNumberExpression(trimmed);
}

/**
 * Returns whether text means "do not write this field".
 *
 * @param trimmed Trimmed field text.
 * @returns True for empty, incomplete minus, or mixed-value placeholders.
 */
export function inputNumericIsSkippedNumberText(trimmed: string): boolean {
  return trimmed === '' || trimmed === INPUT_NUMERIC_MIXED_VALUE_DISPLAY || trimmed === '-';
}

/**
 * Evaluates a non-empty expression with the shared safe math parser.
 *
 * @param expression Expression text after trim.
 * @returns Value when finite, otherwise invalid.
 */
export function inputNumericEvaluateNumberExpression(expression: string): InputNumericParseResult {
  const result = calculateExpression(expression);
  if (!result.ok) {
    return { kind: 'invalid' };
  }
  return inputNumericNumberFromCalculateData(result.data);
}

/**
 * Extracts a finite number from calculate tool data.
 *
 * @param data Calculate result payload.
 * @returns Value when present and finite, otherwise invalid.
 */
export function inputNumericNumberFromCalculateData(data: unknown): InputNumericParseResult {
  if (!data || typeof data !== 'object') {
    return { kind: 'invalid' };
  }
  const value = (data as { value?: unknown }).value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { kind: 'invalid' };
  }
  return { kind: 'value', value };
}

/**
 * Returns true when any parse result is invalid.
 *
 * @param results Field parse results.
 * @returns True when at least one result is invalid.
 */
export function inputNumericHasInvalidNumber(...results: InputNumericParseResult[]): boolean {
  return results.some((result) => result.kind === 'invalid');
}

/**
 * Returns true when every parse result skips the field.
 *
 * @param results Field parse results.
 * @returns True when all results are skip.
 */
export function inputNumericAreAllNumberSkips(...results: InputNumericParseResult[]): boolean {
  return results.every((result) => result.kind === 'skip');
}

/**
 * Returns the numeric value when present, otherwise null.
 *
 * @param result Field parse result.
 * @returns Finite value or null for skip/invalid.
 */
export function inputNumericNumberOrNull(result: InputNumericParseResult): number | null {
  return result.kind === 'value' ? result.value : null;
}

/**
 * Formats a number for a numeric field, or the mixed placeholder when null.
 *
 * @param value Shared number or null when mixed.
 * @param minDecimals Minimum fractional digits kept after trimming.
 * @returns Display text.
 */
export function inputNumericFormatDisplayValue(value: number | null, minDecimals: number): string {
  if (value === null) {
    return INPUT_NUMERIC_MIXED_VALUE_DISPLAY;
  }
  return inputNumericFormatWithMinimumDecimals(value, minDecimals);
}

/**
 * Formats shared multi-select values as one number or the mixed placeholder.
 *
 * @param values Per-object values for one field.
 * @param minDecimals Minimum fractional digits when values are shared.
 * @returns Display text.
 */
export function inputNumericFormatSharedValues(values: readonly number[], minDecimals: number): string {
  if (!inputNumericAreValuesShared(values)) {
    return INPUT_NUMERIC_MIXED_VALUE_DISPLAY;
  }
  if (values.length === 0) {
    return INPUT_NUMERIC_MIXED_VALUE_DISPLAY;
  }
  return inputNumericFormatWithMinimumDecimals(values[0]!, minDecimals);
}

/**
 * Formats a finite number with a minimum fractional digit count, allowing up to
 * five places when the value needs more precision.
 *
 * @param value Number to format.
 * @param minDecimals Minimum fractional digits kept after trimming.
 * @returns Display string.
 */
export function inputNumericFormatWithMinimumDecimals(value: number, minDecimals: number): string {
  const clampedMin = inputNumericClampDisplayMinDecimals(minDecimals);
  const fixed = value.toFixed(INPUT_NUMERIC_DISPLAY_MAX_DECIMALS);
  return inputNumericTrimFractionToMinimum(fixed, clampedMin);
}

/**
 * Clamps a requested minimum decimal count into the allowed display range.
 *
 * @param minDecimals Requested minimum fractional digits.
 * @returns Clamped non-negative minimum not exceeding the display maximum.
 */
function inputNumericClampDisplayMinDecimals(minDecimals: number): number {
  const floored = Math.floor(minDecimals);
  if (floored <= 0) {
    return 0;
  }
  if (floored >= INPUT_NUMERIC_DISPLAY_MAX_DECIMALS) {
    return INPUT_NUMERIC_DISPLAY_MAX_DECIMALS;
  }
  return floored;
}

/**
 * Trims trailing zeros from a fixed-decimal string while keeping minDecimals.
 *
 * @param fixedString Result of Number.toFixed.
 * @param minDecimals Minimum fractional digits to retain.
 * @returns Trimmed display string.
 */
function inputNumericTrimFractionToMinimum(fixedString: string, minDecimals: number): string {
  const decimalIndex = fixedString.indexOf('.');
  if (decimalIndex < 0) {
    return fixedString;
  }
  const integerPart = fixedString.slice(0, decimalIndex);
  const fractionPart = inputNumericTrimTrailingFractionZeros(fixedString.slice(decimalIndex + 1), minDecimals);
  if (fractionPart.length === 0) {
    return integerPart;
  }
  return `${integerPart}.${fractionPart}`;
}

/**
 * Removes trailing zeros from a fractional digit string down to min length.
 *
 * @param fractionPart Digits after the decimal point.
 * @param minDecimals Minimum length to keep.
 * @returns Trimmed fractional digits.
 */
function inputNumericTrimTrailingFractionZeros(fractionPart: string, minDecimals: number): string {
  let trimmed = fractionPart;
  while (trimmed.length > minDecimals && trimmed.endsWith('0')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}
