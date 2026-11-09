import { describe, it, expect } from 'vitest';
import { TransformModalNumericBuffer } from '@/transform/modal/transform_modal_numeric_buffer.js';
import {
  transformModalNumericIsPartial,
  transformModalNumericParse,
} from '@/transform/modal/transform_modal_numeric_parser.js';

describe('TransformModalNumericBuffer', () => {
  it('builds decimal values digit by digit', () => {
    const buffer = new TransformModalNumericBuffer();
    expect(buffer.appendDigit('0')).toBe(true);
    expect(buffer.appendDecimalPoint()).toBe(true);
    expect(buffer.appendDigit('2')).toBe(true);
    expect(buffer.appendDigit('5')).toBe(true);
    expect(buffer.getText()).toBe('0.25');
    expect(transformModalNumericParse(buffer.getText())).toBe(0.25);
  });

  it('starts a fraction with 0. when decimal is first', () => {
    const buffer = new TransformModalNumericBuffer();
    expect(buffer.appendDecimalPoint()).toBe(true);
    expect(buffer.getText()).toBe('0.');
    expect(buffer.appendDigit('5')).toBe(true);
    expect(transformModalNumericParse(buffer.getText())).toBe(0.5);
  });

  it('toggles sign before any digits', () => {
    const buffer = new TransformModalNumericBuffer();
    expect(buffer.toggleSign()).toBe(true);
    expect(buffer.getText()).toBe('-');
    expect(buffer.isSignNegative()).toBe(true);
    expect(buffer.hasText()).toBe(true);
    buffer.appendDigit('0');
    buffer.appendDecimalPoint();
    buffer.appendDigit('2');
    buffer.appendDigit('5');
    expect(buffer.getText()).toBe('-0.25');
    expect(transformModalNumericParse(buffer.getText())).toBe(-0.25);
  });

  it('toggles sign after a complete value at any time', () => {
    const buffer = new TransformModalNumericBuffer();
    buffer.appendDigit('1');
    buffer.appendDigit('0');
    expect(buffer.getText()).toBe('10');
    expect(buffer.toggleSign()).toBe(true);
    expect(buffer.getText()).toBe('-10');
    expect(buffer.toggleSign()).toBe(true);
    expect(buffer.getText()).toBe('10');
  });

  it('toggles sign after a decimal mid-entry', () => {
    const buffer = new TransformModalNumericBuffer();
    buffer.appendDigit('0');
    buffer.appendDecimalPoint();
    buffer.appendDigit('2');
    expect(buffer.toggleSign()).toBe(true);
    expect(buffer.getText()).toBe('-0.2');
    buffer.appendDigit('5');
    expect(buffer.getText()).toBe('-0.25');
  });

  it('keeps the negative flag when decimal is pressed after minus only', () => {
    const buffer = new TransformModalNumericBuffer();
    buffer.toggleSign();
    expect(buffer.appendDecimalPoint()).toBe(true);
    expect(buffer.getText()).toBe('-0.');
    buffer.appendDigit('5');
    expect(buffer.getText()).toBe('-0.5');
  });

  it('supports backspace through magnitude then sign', () => {
    const buffer = new TransformModalNumericBuffer();
    buffer.toggleSign();
    buffer.appendDigit('1');
    buffer.appendDigit('0');
    expect(buffer.getText()).toBe('-10');
    expect(buffer.backspace()).toBe(true);
    expect(buffer.getText()).toBe('-1');
    expect(buffer.backspace()).toBe(true);
    expect(buffer.getText()).toBe('-');
    expect(buffer.backspace()).toBe(true);
    expect(buffer.getText()).toBe('');
    expect(buffer.hasText()).toBe(false);
    expect(buffer.backspace()).toBe(false);
  });

  it('rejects a second decimal point and non-digits', () => {
    const buffer = new TransformModalNumericBuffer();
    buffer.appendDigit('1');
    buffer.appendDecimalPoint();
    expect(buffer.appendDecimalPoint()).toBe(false);
    expect(buffer.appendDigit('a')).toBe(false);
    expect(buffer.getText()).toBe('1.');
  });

  it('clear resets both magnitude and sign', () => {
    const buffer = new TransformModalNumericBuffer();
    buffer.toggleSign();
    buffer.appendDigit('3');
    buffer.clear();
    expect(buffer.getText()).toBe('');
    expect(buffer.isSignNegative()).toBe(false);
    expect(buffer.hasText()).toBe(false);
  });
});

describe('transformModalNumericParse', () => {
  it('returns null for incomplete text and finite numbers for complete text', () => {
    expect(transformModalNumericParse('')).toBeNull();
    expect(transformModalNumericParse('-')).toBeNull();
    expect(transformModalNumericParse('.')).toBeNull();
    expect(transformModalNumericParse('-.')).toBeNull();
    expect(transformModalNumericParse('12.5')).toBe(12.5);
    expect(transformModalNumericParse('-3')).toBe(-3);
    expect(transformModalNumericParse('-0.25')).toBe(-0.25);
  });

  it('detects partial legal number text', () => {
    expect(transformModalNumericIsPartial('')).toBe(false);
    expect(transformModalNumericIsPartial('-')).toBe(true);
    expect(transformModalNumericIsPartial('0.')).toBe(true);
    expect(transformModalNumericIsPartial('12.3')).toBe(true);
    expect(transformModalNumericIsPartial('1a')).toBe(false);
  });
});
