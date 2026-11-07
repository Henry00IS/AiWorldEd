import { describe, expect, it } from 'vitest';
import { curveMovePoint } from '@/curve/model/curve_constrain.js';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import type { Curve } from '@/curve/model/curve_model.js';
import { curvePresetBuild, type CurvePreset } from '@/curve/model/curve_preset.js';
import { CurveEditorPresetMenu } from '@/curve/ui/curve_editor_presets.js';

const PRESETS: CurvePreset[] = [
  { id: 'flat', label: 'Flat', start: 1, steps: [['L', 1, 1]] },
  { id: 'ramp', label: 'Ramp', start: 0, steps: [['L', 1, 1]] },
  { id: 'bulge', label: 'Bulge', start: 0.5, steps: [['Q', 1, 0.5, 0.5, 1]] },
];

/**
 * Creates a menu that records picked curves and follows them like the editor.
 *
 * @returns Menu, picks, and its select.
 */
function menu() {
  const picks: Curve[] = [];
  const presetMenu: CurveEditorPresetMenu = new CurveEditorPresetMenu(PRESETS, (curve) => {
    picks.push(curve);
    presetMenu.refresh(curve);
  });
  return { presetMenu, picks, select: presetMenu.getElement() };
}

const key = (select: HTMLSelectElement, name: string) =>
  select.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));

describe('curve editor preset menu', () => {
  it('keeps showing the picked preset name until the curve is edited', () => {
    const { presetMenu, picks, select } = menu();
    select.value = 'ramp';
    select.dispatchEvent(new Event('change'));
    expect(picks).toHaveLength(1);
    expect(select.selectedOptions[0]?.textContent).toBe('Ramp');
    presetMenu.refresh(curveMovePoint(picks[0]!, 1, 1, 0.5));
    expect(select.value).toBe('');
    expect(select.selectedOptions[0]?.textContent).toBe('Presets…');
  });

  it('recognises a preset after the curve went through its saved text', () => {
    const { presetMenu, select } = menu();
    presetMenu.refresh(curveDecode(curveEncode(curvePresetBuild(PRESETS[2]!)))!);
    expect(select.value).toBe('bulge');
  });

  it('steps through presets with the arrow keys and applies each one, stopping at the ends', () => {
    const { picks, select } = menu();
    expect(key(select, 'ArrowDown')).toBe(false);
    expect(select.value).toBe('flat');
    key(select, 'ArrowDown');
    key(select, 'ArrowDown');
    key(select, 'ArrowDown');
    expect(select.value).toBe('bulge');
    expect(picks.map((curve) => curveEncode(curve))).toEqual(
      PRESETS.map((preset) => curveEncode(curvePresetBuild(preset))),
    );
    key(select, 'ArrowUp');
    expect(select.value).toBe('ramp');
    expect(picks).toHaveLength(4);
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, cancelable: true }));
    expect(select.value).toBe('ramp');
  });
});
