import { InputSelect } from '@/ui/input/input_select.js';
import {
  modifierStackPresetApply,
  modifierStackPresetMatch,
  type ModifierStackPresetOwner,
} from '@/modifier/stack/modifier_stack_presets.js';
import { modifierStackUiRow } from './modifier_stack_ui_style.js';

/** Entry shown while the parameters match no preset. */
const MODIFIER_STACK_PRESET_CUSTOM = 'Custom';

/**
 * Inspector row picking one of a modifier kind's presets. It shows the preset
 * the parameters still match, or Custom once they are edited, and commits the
 * picked preset's parameters as one change.
 */
export class ModifierStackPresetRow {
  private readonly select: InputSelect;
  private readonly row: HTMLElement;
  private parameters: Record<string, unknown> = {};

  /**
   * Builds the row.
   *
   * @param owner Modifier kind offering the presets.
   * @param onApply Receives the parameters of a picked preset.
   */
  constructor(
    private readonly owner: ModifierStackPresetOwner,
    onApply: (parameters: Record<string, unknown>) => void,
  ) {
    const choices = owner.presets.map((preset) => ({
      value: preset.id,
      label: preset.label,
      title: preset.tooltip,
      ...(preset.group ? { group: preset.group } : {}),
    }));
    this.select = new InputSelect([{ value: '', label: MODIFIER_STACK_PRESET_CUSTOM }, ...choices], 'Preset');
    this.select.bindCommit(() => {
      const preset = owner.presets.find((entry) => entry.id === this.select.getValue());
      if (preset) onApply(modifierStackPresetApply(owner, this.parameters, preset));
      this.update(this.parameters);
    });
    this.row = modifierStackUiRow('Preset', this.select.getElement(), 'Applies a set of settings at once.');
  }

  /**
   * Returns the row element.
   *
   * @returns Row.
   */
  getElement(): HTMLElement {
    return this.row;
  }

  /**
   * Shows the preset the parameters match.
   *
   * @param parameters Current parameters.
   */
  update(parameters: Record<string, unknown>): void {
    this.parameters = parameters;
    this.select.setSharedValues([modifierStackPresetMatch(this.owner, parameters)]);
  }
}
