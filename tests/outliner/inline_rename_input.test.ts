import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InlineRenameInput } from '../../src/ui/outliner/inline_rename_input.js';

describe('InlineRenameInput', () => {
  let parentElement: HTMLElement;
  let textSpan: HTMLSpanElement;
  let renameInput: InlineRenameInput;

  beforeEach(() => {
    parentElement = document.createElement('div');
    document.body.appendChild(parentElement);
    textSpan = document.createElement('span');
    textSpan.textContent = 'OriginalName';
    parentElement.appendChild(textSpan);
    renameInput = new InlineRenameInput(parentElement, textSpan, 'OriginalName');
  });

  afterEach(() => {
    renameInput.dispose();
    if (parentElement.parentNode) {
      parentElement.parentNode.removeChild(parentElement);
    }
  });

  it('should create without errors', () => {
    expect(renameInput).toBeDefined();
  });

  it('should activate and replace text span with input', () => {
    renameInput.activate();
    expect(textSpan.style.display).toBe('none');
    const input = parentElement.querySelector('input');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('OriginalName');
  });

  it('should deactivate and restore text span', () => {
    renameInput.activate();
    renameInput.deactivate('NewName');
    expect(textSpan.style.display).toBe('inline');
    expect(textSpan.textContent).toBe('NewName');
    const input = parentElement.querySelector('input');
    expect(input).toBeNull();
  });

  it('should confirm rename and call confirm callback', () => {
    let confirmedName = '';
    renameInput.setConfirmCallback((name) => { confirmedName = name; });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = 'NewName';
    renameInput.confirmRename();
    expect(confirmedName).toBe('NewName');
    expect(textSpan.textContent).toBe('NewName');
  });

  it('should cancel rename and restore original name', () => {
    let cancelled = false;
    renameInput.setCancelCallback(() => { cancelled = true; });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = 'WrongName';
    renameInput.cancelRename();
    expect(cancelled).toBe(true);
    expect(textSpan.textContent).toBe('OriginalName');
  });

  it('should use original name when confirm receives empty input', () => {
    let confirmedName = '';
    renameInput.setConfirmCallback((name) => { confirmedName = name; });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = '   ';
    renameInput.confirmRename();
    expect(confirmedName).toBe('OriginalName');
  });

  it('should handle Enter key event for confirmation', () => {
    let confirmedName = '';
    renameInput.setConfirmCallback((name) => { confirmedName = name; });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = 'EnterName';
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
    expect(confirmedName).toBe('EnterName');
  });

  it('should handle Escape key event for cancellation', () => {
    let cancelled = false;
    renameInput.setCancelCallback(() => { cancelled = true; });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = 'EscapeName';
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(cancelled).toBe(true);
    expect(textSpan.textContent).toBe('OriginalName');
  });

  it('should handle blur event for auto-confirmation', () => {
    let confirmedName = '';
    renameInput.setConfirmCallback((name) => { confirmedName = name; });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = 'BlurName';
    input.dispatchEvent(new FocusEvent('blur'));
    expect(confirmedName).toBe('BlurName');
  });

  it('should not throw when Enter confirm is followed by blur', () => {
    let confirmCount = 0;
    renameInput.setConfirmCallback(() => {
      confirmCount++;
    });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = 'EnterThenBlur';
    expect(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
      input.dispatchEvent(new FocusEvent('blur'));
    }).not.toThrow();
    expect(confirmCount).toBe(1);
    expect(parentElement.querySelector('input')).toBeNull();
  });

  it('should not operate after disposal', () => {
    renameInput.dispose();
    expect(() => renameInput.activate()).not.toThrow();
    expect(() => renameInput.confirmRename()).not.toThrow();
    expect(() => renameInput.cancelRename()).not.toThrow();
  });

  it('should set correct styles on input element', () => {
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    expect(input.style.border).toBe('1px solid rgb(230, 126, 34)');
    expect(input.style.fontFamily).toBe('monospace');
    expect(input.style.fontSize).toBe('12px');
  });
});
