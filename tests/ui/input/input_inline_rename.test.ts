import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InputInlineRename } from '@/outliner/ui/input_inline_rename_outliner.js';

describe('InputInlineRename', () => {
  let parentElement: HTMLElement;
  let textSpan: HTMLSpanElement;
  let renameInput: InputInlineRename;

  beforeEach(() => {
    parentElement = document.createElement('div');
    document.body.appendChild(parentElement);
    textSpan = document.createElement('span');
    textSpan.textContent = 'OriginalName';
    parentElement.appendChild(textSpan);
    renameInput = new InputInlineRename(parentElement, textSpan, 'OriginalName');
  });

  afterEach(() => {
    renameInput.dispose();
    if (parentElement.parentNode) {
      parentElement.parentNode.removeChild(parentElement);
    }
  });

  it('should activate and replace text span with input', () => {
    renameInput.activate();
    expect(textSpan.style.display).toBe('none');
    const input = parentElement.querySelector('input');
    expect(input).not.toBeNull();
    expect(input?.value).toBe('OriginalName');
  });

  it('should select the full value by default', () => {
    renameInput.activate();
    const input = renameInput.getInputElement();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('OriginalName'.length);
  });

  it('should apply an optional initial selection range', () => {
    renameInput.dispose();
    renameInput = new InputInlineRename(parentElement, textSpan, 'Brush.00A');
    textSpan.textContent = 'Brush.00A';
    renameInput.activate({ start: 0, end: 5 });
    const input = renameInput.getInputElement();
    expect(input.value).toBe('Brush.00A');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(5);
  });

  it('should place the input before trailing eye and lock controls', () => {
    const visibility = document.createElement('span');
    visibility.textContent = 'eye';
    const lock = document.createElement('span');
    lock.textContent = 'lock';
    parentElement.appendChild(visibility);
    parentElement.appendChild(lock);
    renameInput.activate();
    const children = Array.from(parentElement.childNodes);
    const input = parentElement.querySelector('input') as HTMLInputElement;
    expect(children.indexOf(textSpan)).toBeLessThan(children.indexOf(input));
    expect(children.indexOf(input)).toBeLessThan(children.indexOf(visibility));
    expect(children.indexOf(visibility)).toBeLessThan(children.indexOf(lock));
  });

  it('should deactivate and restore text span', () => {
    renameInput.activate();
    renameInput.deactivate('NewName');
    expect(textSpan.style.display).toBe('');
    expect(textSpan.textContent).toBe('NewName');
    const input = parentElement.querySelector('input');
    expect(input).toBeNull();
  });

  it('matches the name span height so chrome does not reflow when editing', () => {
    Object.defineProperty(textSpan, 'offsetHeight', { configurable: true, get: () => 16 });
    renameInput.activate();
    const input = renameInput.getInputElement();
    expect(input.style.height).toBe('16px');
    expect(input.style.maxHeight).toBe('16px');
    expect(input.style.boxSizing).toBe('border-box');
    expect(input.style.padding).toBe('0px 4px');
  });

  it('should confirm rename and call confirm callback', () => {
    let confirmedName = '';
    renameInput.setConfirmCallback((name) => {
      confirmedName = name;
    });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = 'NewName';
    renameInput.confirmRename();
    expect(confirmedName).toBe('NewName');
    expect(textSpan.textContent).toBe('NewName');
  });

  it('should cancel rename and restore original name', () => {
    let cancelled = false;
    renameInput.setCancelCallback(() => {
      cancelled = true;
    });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = 'WrongName';
    renameInput.cancelRename();
    expect(cancelled).toBe(true);
    expect(textSpan.textContent).toBe('OriginalName');
  });

  it('should use original name when confirm receives empty input', () => {
    let confirmedName = '';
    renameInput.setConfirmCallback((name) => {
      confirmedName = name;
    });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = '   ';
    renameInput.confirmRename();
    expect(confirmedName).toBe('OriginalName');
  });

  it('should handle Enter key event for confirmation', () => {
    let confirmedName = '';
    renameInput.setConfirmCallback((name) => {
      confirmedName = name;
    });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = 'EnterName';
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
    expect(confirmedName).toBe('EnterName');
  });

  it('should handle Escape key event for cancellation', () => {
    let cancelled = false;
    renameInput.setCancelCallback(() => {
      cancelled = true;
    });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = 'EscapeName';
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(cancelled).toBe(true);
    expect(textSpan.textContent).toBe('OriginalName');
  });

  it('should handle blur event for auto-confirmation', () => {
    let confirmedName = '';
    renameInput.setConfirmCallback((name) => {
      confirmedName = name;
    });
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = 'BlurName';
    input.dispatchEvent(new FocusEvent('blur'));
    expect(confirmedName).toBe('BlurName');
  });

  it('confirms when the user presses a viewport that cancels the pointer default', () => {
    let confirmedName = '';
    renameInput.setConfirmCallback((name) => (confirmedName = name));
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.value = 'ViewportName';
    const viewport = document.createElement('canvas');
    document.body.appendChild(viewport);
    viewport.addEventListener('pointerdown', (event) => event.preventDefault());
    viewport.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    viewport.remove();
    expect(confirmedName).toBe('ViewportName');
    expect(parentElement.querySelector('input')).toBeNull();
  });

  it('keeps renaming while the user presses inside the input', () => {
    let confirmed = false;
    renameInput.setConfirmCallback(() => (confirmed = true));
    renameInput.activate();
    const input = parentElement.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(confirmed).toBe(false);
    expect(parentElement.querySelector('input')).toBe(input);
  });

  it('should stop caret clicks from bubbling to a draggable host', () => {
    parentElement.draggable = true;
    let hostPointerEvents = 0;
    parentElement.addEventListener('mousedown', () => {
      hostPointerEvents++;
    });
    parentElement.addEventListener('click', () => {
      hostPointerEvents++;
    });
    renameInput.activate();
    expect(parentElement.draggable).toBe(false);
    const input = renameInput.getInputElement();
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(hostPointerEvents).toBe(0);
    expect(parentElement.querySelector('input')).not.toBeNull();
    expect(input.style.userSelect).toBe('text');
  });

  it('should restore host draggable after rename finishes', () => {
    parentElement.draggable = true;
    renameInput.activate();
    expect(parentElement.draggable).toBe(false);
    renameInput.confirmRename();
    expect(parentElement.draggable).toBe(true);
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
    expect(input.style.padding).toBe('0px 4px');
    expect(input.style.boxSizing).toBe('border-box');
  });
});
