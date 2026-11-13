import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerToyPicker, playerToyPickerStep } from '@/player/ui/player_toy_picker.js';

describe('PlayerToyPicker', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('steps through tennis ball, soccer ball and paper plane, wrapping both ways', () => {
    expect(playerToyPickerStep('tennis', 100)).toBe('soccer');
    expect(playerToyPickerStep('soccer', 3)).toBe('plane');
    expect(playerToyPickerStep('plane', 100)).toBe('tennis');
    expect(playerToyPickerStep('tennis', -100)).toBe('plane');
    expect(playerToyPickerStep('soccer', -1)).toBe('tennis');
  });

  it('shows one slot per toy over the viewport, highlights and names the selected one, then dims', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const picker = new PlayerToyPicker(document, 'tennis');
    picker.mount(container);
    const element = picker.getElement();
    expect(element.parentElement).toBe(container);
    expect(container.style.position).toBe('relative');
    expect(element.style.pointerEvents).toBe('none');
    const slots = [...element.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(slots.map((slot) => slot.dataset['toy'])).toEqual(['tennis', 'soccer', 'plane']);
    picker.select('plane');
    expect(slots.map((slot) => slot.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
    expect(element.textContent).toContain('Paper plane');
    expect(element.style.opacity).toBe('1');
    vi.advanceTimersByTime(2000);
    expect(Number(element.style.opacity)).toBeLessThan(1);
    picker.unmount();
    expect(element.parentElement).toBeNull();
  });
});
