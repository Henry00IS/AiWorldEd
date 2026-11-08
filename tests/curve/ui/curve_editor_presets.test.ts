import { describe, expect, it } from 'vitest';
import { curveMovePoint } from '@/curve/model/curve_constrain.js';
import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import type { Curve } from '@/curve/model/curve_model.js';
import { curvePresetBuild, type CurvePreset } from '@/curve/model/curve_preset.js';
import { CurveEditorPresetMenu } from '@/curve/ui/curve_editor_presets.js';
import { CURVE_PRESETS_RESET } from '@/curve/model/curve_preset_reset.js';
import { curveMarkerSwitch } from '@/curve/model/curve_markers.js';
import { curveSample } from '@/curve/model/curve_sample.js';

const PLACES = { bottom: 0.2, top: 0.8 };

const PRESETS: CurvePreset[] = [
  { id: 'flat', label: 'Flat', tooltip: 'Flat help.', start: 1, steps: [['L', 1, 1]], markers: PLACES },
  {
    id: 'ramp',
    label: 'Ramp',
    tooltip: 'Ramp help.',
    start: 0,
    steps: [['L', 1, 1]],
    markers: { bottom: 0.3, top: 0.6 },
  },
  { id: 'bulge', label: 'Bulge', tooltip: 'Bulge help.', start: 0.5, steps: [['Q', 1, 0.5, 0.5, 1]], markers: PLACES },
];

/** Ids of the reset presets every menu offers first. */
const RESET_IDS = CURVE_PRESETS_RESET.map((preset) => preset.id);

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
    expect(select.value).toBe(RESET_IDS[0]);
    for (let step = 0; step < RESET_IDS.length + PRESETS.length + 2; step++) key(select, 'ArrowDown');
    expect(select.value).toBe('bulge');
    expect(picks.map((curve) => curveEncode(curve))).toEqual(
      [...CURVE_PRESETS_RESET, ...PRESETS].map((preset) => curveEncode(curvePresetBuild(preset))),
    );
    key(select, 'ArrowUp');
    expect(select.value).toBe('ramp');
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, cancelable: true }));
    expect(select.value).toBe('ramp');
  });

  it('offers Reset to 1.0, 0.5 and 0.0 first, in their own group, as flat curves', () => {
    const { select } = menu();
    const options = [...select.options].filter((option) => option.value !== '');
    expect(options.slice(0, 3).map((option) => option.textContent)).toEqual([
      'Reset to 1.0',
      'Reset to 0.5',
      'Reset to 0.0',
    ]);
    expect(options[0]?.parentElement?.tagName).toBe('OPTGROUP');
    expect(options[3]?.parentElement).not.toBe(options[0]?.parentElement);
    CURVE_PRESETS_RESET.forEach((preset, index) => {
      const curve = curvePresetBuild(preset);
      const value = [1, 0.5, 0][index] ?? -1;
      expect(curveSample(curve).every((point) => Math.abs(point.y - value) < 1e-9)).toBe(true);
    });
  });

  it('shows each preset tooltip as hover help, on the option and on the closed picker', () => {
    const { select } = menu();
    const ramp = [...select.options].find((option) => option.value === 'ramp');
    expect(ramp?.title).toBe('Ramp help.');
    select.value = 'ramp';
    select.dispatchEvent(new Event('change'));
    expect(select.title).toBe('Ramp help.');
  });

  it('keeps switched-on markers on while browsing, at each preset own place', () => {
    const { presetMenu, picks, select } = menu();
    presetMenu.refresh(curveMarkerSwitch(curvePresetBuild(PRESETS[0]!), 'top', true));
    select.value = 'ramp';
    select.dispatchEvent(new Event('change'));
    expect(picks[0]?.markers?.top).toBe(0.6);
    expect(picks[0]?.markers?.bottom).toBeUndefined();
    expect(picks[0]?.markers?.parked?.bottom).toBe(0.3);
    expect(select.value).toBe('ramp');
    key(select, 'ArrowDown');
    expect(picks[1]?.markers?.top).toBe(0.8);
  });
});
