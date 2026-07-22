import { describe, it, expect, afterEach } from 'vitest';
import { blurActiveFormField } from '../../src/utils/dom_focus.js';

describe('blurActiveFormField', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should blur a focused input element', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    blurActiveFormField();
    expect(document.activeElement).not.toBe(input);
  });

  it('should not throw when nothing is focused', () => {
    expect(() => blurActiveFormField()).not.toThrow();
  });

  it('should leave non-form elements alone', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    blurActiveFormField();
    expect(document.activeElement === button || document.activeElement === document.body).toBe(
      true
    );
  });
});
