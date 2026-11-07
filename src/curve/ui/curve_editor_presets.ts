import { curveEncode } from '@/curve/model/curve_codec.js';
import type { Curve } from '@/curve/model/curve_model.js';
import { curvePresetBuild, type CurvePreset } from '@/curve/model/curve_preset.js';
import { InputSelect } from '@/ui/input/input_select.js';

/** Placeholder shown while the curve matches no preset. */
const CURVE_EDITOR_PRESET_PLACEHOLDER = 'Presets…';

/**
 * The curve editor's preset picker. It shows the name of the preset the curve
 * still matches, and falls back to the placeholder once the curve is edited.
 * While focused, the up and down arrow keys step through the presets and apply
 * each one.
 */
export class CurveEditorPresetMenu {
  private readonly select: InputSelect;
  /** Encoded curve of each preset, for matching the current curve. */
  private readonly encoded = new Map<string, string>();

  /**
   * Builds the picker.
   *
   * @param presets Presets offered.
   * @param pick Applies a picked preset's curve.
   */
  constructor(
    private readonly presets: readonly CurvePreset[],
    private readonly pick: (curve: Curve) => void,
  ) {
    const choices = presets.map((preset) => ({ value: preset.id, label: preset.label }));
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
    const text = curveEncode(curve);
    const match = this.presets.find((preset) => this.presetText(preset) === text);
    this.select.setSharedValues([match?.id ?? '']);
  }

  /**
   * Returns a preset's encoded curve, built once.
   *
   * @param preset Preset.
   * @returns Encoded curve.
   */
  private presetText(preset: CurvePreset): string {
    let text = this.encoded.get(preset.id);
    if (text === undefined) {
      text = curveEncode(curvePresetBuild(preset));
      this.encoded.set(preset.id, text);
    }
    return text;
  }

  /**
   * Applies the preset with an id.
   *
   * @param id Preset id; unknown ids are ignored.
   */
  private apply(id: string): void {
    const preset = this.presets.find((entry) => entry.id === id);
    if (preset) this.pick(curvePresetBuild(preset));
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
