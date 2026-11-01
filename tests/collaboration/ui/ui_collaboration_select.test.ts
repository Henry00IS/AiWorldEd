import { describe, expect, it } from 'vitest';
import {
  UI_COLLABORATION_SELECT_BACKGROUND,
  UI_COLLABORATION_SELECT_TEXT,
  uiCollaborationSelect,
} from '@/collaboration/ui/ui_collaboration_select.js';

/**
 * Returns whether a CSS color is fully opaque (no rgba alpha below 1, no
 * transparent keyword).
 *
 * @param color Computed or inline CSS color.
 * @returns True when opaque.
 */
function colorOpaque(color: string): boolean {
  if (color === '' || color === 'transparent') return false;
  const alpha = /rgba\([^)]*,\s*([\d.]+)\)/.exec(color)?.[1];
  return alpha === undefined || Number(alpha) >= 1;
}

/**
 * Collaboration dropdown: visible text and opaque colors in every webview,
 * including WebKitGTK.
 */
describe('ui_collaboration_select', () => {
  const choices = [
    { value: 'public', label: 'Public: listed, anyone can join' },
    { value: 'private', label: 'Private: listed, password required' },
  ];

  it('selects the first choice and keeps every label', () => {
    const select = uiCollaborationSelect(choices);
    expect(select.value).toBe('public');
    expect(select.selectedOptions[0]?.textContent).toBe(choices[0]?.label);
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(
      choices.map((choice) => choice.label),
    );
  });

  it('turns off the native look and uses opaque colors on the select and each option', () => {
    const select = uiCollaborationSelect(choices);
    expect(select.style.appearance).toBe('none');
    expect(colorOpaque(select.style.backgroundColor)).toBe(true);
    expect(select.style.color).not.toBe('');
    for (const option of Array.from(select.options)) {
      expect(colorOpaque(option.style.background || option.style.backgroundColor)).toBe(true);
      expect(option.style.color).not.toBe('');
    }
    expect(UI_COLLABORATION_SELECT_BACKGROUND).not.toBe(UI_COLLABORATION_SELECT_TEXT);
  });
});
