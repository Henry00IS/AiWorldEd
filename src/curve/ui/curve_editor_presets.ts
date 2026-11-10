import { curveEncode } from '@/curve/model/curve_codec.js';
import type { Curve } from '@/curve/model/curve_model.js';
import { curvePresetBuild, type CurvePreset } from '@/curve/model/curve_preset.js';
import { curveMarkerSwitch } from '@/curve/model/curve_markers.js';
import { CURVE_PRESETS_RESET } from '@/curve/model/curve_preset_reset.js';
import { InputSelect } from '@/ui/input/input_select.js';

/**
 * Encodes the shape of a curve for preset matching: its lines and marker
 * places, whether or not Base and Top are on and whatever their heights.
 *
 * @param curve Curve.
 * @returns Comparable text.
 */
function curveEditorPresetShape(curve: Curve): string {
  const off = curveMarkerSwitch(curveMarkerSwitch(curve, 'bottom', false), 'top', false);
  const { heights: _heights, ...markers } = off.markers ?? {};
  return curveEncode({ ...off, markers });
}

/** Placeholder shown while the curve matches no preset. */
const CURVE_EDITOR_PRESET_PLACEHOLDER = 'Presets…';

/**
 * The curve editor's preset picker. The reset presets come first, then the
 * offered presets; each shows its tooltip on hover. It shows the name of the
 * preset the curve still matches, and falls back to the placeholder once the
 * curve is edited. While focused, the up and down arrow keys step through the
 * presets and apply each one. Picking a preset also sets whether Base and Top
 * are on and their fixed heights; the name stays shown while only those
 * differ.
 */
export class CurveEditorPresetMenu {
  private readonly select: InputSelect;
  private readonly presets: readonly CurvePreset[];
  /** Built curve of each preset, made once. */
  private readonly built = new Map<string, Curve>();

  /**
   * Builds the picker.
   *
   * @param presets Presets offered after the reset presets.
   * @param pick Applies a picked preset's curve.
   */
  constructor(
    presets: readonly CurvePreset[],
    private readonly pick: (curve: Curve) => void,
  ) {
    this.presets = [...CURVE_PRESETS_RESET, ...presets];
    const choices = this.presets.map((preset) => ({
      value: preset.id,
      label: preset.label,
      title: preset.tooltip,
      ...(preset.group ? { group: preset.group } : {}),
    }));
    this.select = new InputSelect([{ value: '', label: CURVE_EDITOR_PRESET_PLACEHOLDER }, ...choices], 'Curve presets');
    this.select.bindCommit(() => this.apply(this.select.getValue()));
    this.select.getElement().addEventListener('keydown', (event) => this.browse(event));
  }

  /**
   * Returns the select element.
   *
   * @returns Element.
   */
  getElement(): HTMLSelectElement {
    return this.select.getElement();
  }

  /**
   * Shows the preset the curve matches, or the placeholder.
   *
   * @param curve Current curve.
   */
  refresh(curve: Curve): void {
    const text = curveEditorPresetShape(curve);
    const match = this.presets.find((preset) => curveEditorPresetShape(this.presetFor(preset)) === text);
    this.select.setSharedValues([match?.id ?? '']);
  }

  /**
   * Returns a preset's curve, built only once.
   *
   * @param preset Preset.
   * @returns Curve the preset applies.
   */
  private presetFor(preset: CurvePreset): Curve {
    let curve = this.built.get(preset.id);
    if (!curve) {
      curve = curvePresetBuild(preset);
      this.built.set(preset.id, curve);
    }
    return curve;
  }

  /**
   * Applies the preset with an id.
   *
   * @param id Preset id; unknown ids are ignored.
   */
  private apply(id: string): void {
    const preset = this.presets.find((entry) => entry.id === id);
    if (preset) this.pick(this.presetFor(preset));
    this.select.setSharedValues([preset?.id ?? '']);
  }

  /**
   * Steps to the previous or next preset on the arrow keys and applies it.
   *
   * @param event Key press on the closed picker.
   */
  private browse(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.altKey || event.ctrlKey || event.metaKey || this.presets.length === 0) return;
    event.preventDefault();
    const at = this.presets.findIndex((preset) => preset.id === this.select.getValue());
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next =
      at < 0 ? (step > 0 ? 0 : this.presets.length - 1) : Math.max(0, Math.min(this.presets.length - 1, at + step));
    const preset = this.presets[next];
    if (preset && next !== at) this.apply(preset.id);
  }
}
