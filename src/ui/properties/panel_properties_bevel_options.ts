import type { Object3D } from 'three';
import { InputNumeric } from '@/ui/input/input_numeric.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import { InputSelect } from '@/ui/input/input_select.js';
import { textureChoicesList } from '@/texture/library/texture_choices.js';
import {
  modifierBevelOptionsNormalize,
  type ModifierBevelOptions,
} from '@/modifier/volume/modifier_volume_bevel_options.js';
import type { ModifierBevelVolumeSettings } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_BEVEL_OPTION_CAP_FIELDS,
  MODIFIER_BEVEL_OPTION_GEOMETRY_FIELDS,
  MODIFIER_BEVEL_OPTION_LIMIT_FIELDS,
  MODIFIER_BEVEL_OPTION_TRIM_FIELDS,
  type ModifierBevelOptionField,
} from '@/modifier/volume/modifier_volume_bevel_option_fields.js';
import { panelBevelOptionsHasCorners } from './panel_properties_bevel_options_visibility.js';

/** Field and row owned by the contextual options helper. */
interface PanelBevelOptionField {
  /** Field applicability and storage. */
  definition: ModifierBevelOptionField;
  /** Existing numeric or dropdown widget. */
  input: InputNumeric | InputSelect;
  /** Labeled row. */
  row: HTMLElement;
}

/** Context-sensitive bevel options using the existing undo and field widgets. */
export class PanelPropertiesBevelOptions {
  private readonly fields: PanelBevelOptionField[] = [];
  private currentOptions: readonly ModifierBevelOptions[] = [];
  private readonly createRow: (label: string, input: { getElement(): HTMLElement }) => HTMLElement;
  private readonly commit: (patch: (options: ModifierBevelOptions) => ModifierBevelOptions) => void;

  /**
   * Stores the existing inspector row and undo adapters.
   *
   * @param createRow Shared row factory.
   * @param commit Undoable option patch.
   */
  constructor(createRow: PanelPropertiesBevelOptions['createRow'], commit: PanelPropertiesBevelOptions['commit']) {
    this.createRow = createRow;
    this.commit = commit;
  }

  /**
   * Appends the limit method row.
   *
   * @param section Inspector container.
   */
  appendLimit(section: HTMLElement): void {
    MODIFIER_BEVEL_OPTION_LIMIT_FIELDS.forEach((definition) => this.append(section, definition));
  }

  /**
   * Appends geometry rows.
   *
   * @param section Inspector container.
   */
  appendGeometry(section: HTMLElement): void {
    MODIFIER_BEVEL_OPTION_GEOMETRY_FIELDS.forEach((definition) => this.append(section, definition));
  }

  /**
   * Appends layout-dependent rows.
   *
   * @param section Inspector container.
   */
  appendCharts(section: HTMLElement): void {
    [...MODIFIER_BEVEL_OPTION_TRIM_FIELDS, ...MODIFIER_BEVEL_OPTION_CAP_FIELDS].forEach((definition) =>
      this.append(section, definition),
    );
  }

  /**
   * Creates one row and connects it to the existing settings undo.
   *
   * @param section Inspector container.
   * @param definition Contextual option.
   */
  private append(section: HTMLElement, definition: ModifierBevelOptionField): void {
    const input = definition.choices
      ? new InputSelect([...definition.choices], definition.aria)
      : inputNumericCreateUvField(definition.step ?? 1, definition.aria);
    const row = this.createRow(definition.label, input);
    row.title = definition.title;
    const field = { definition, input, row };
    input.bindCommit(() => this.commitField(field));
    if (definition.key === 'profile' && input instanceof InputNumeric) this.appendProfileSlider(field, input);
    this.fields.push(field);
    section.appendChild(row);
  }

  /**
   * Commits only valid edited values, leaving hidden options intact.
   *
   * @param field Edited widget.
   */
  private commitField(field: PanelBevelOptionField): void {
    const key = field.definition.key;
    const value = field.input instanceof InputNumeric ? field.input.parseNumberOrNull() : field.input.getValue();
    if (value === null || value === '') {
      this.refreshField(field, this.currentOptions);
      return;
    }
    const next =
      key === 'clampOverlap' ? value === 'on' : key === 'capTextureId' && value === 'inherit-bevel' ? '' : value;
    this.commit((options) => modifierBevelOptionsNormalize({ ...options, [key]: next }));
  }

  /**
   * Refreshes shared values and applicability after selection, edits, and undo.
   *
   * @param settings Bound settings.
   * @param volumes Bound live volumes.
   * @param amountInput Existing width amount widget.
   */
  update(
    settings: readonly ModifierBevelVolumeSettings[],
    volumes: readonly Object3D[],
    amountInput: InputNumeric,
  ): void {
    const options = settings.map((entry) => modifierBevelOptionsNormalize(entry.options));
    this.currentOptions = options;
    this.refreshAmountCaption(options, amountInput);
    const round = settings.some((entry) => entry.segments > 1);
    const caps = volumes.some(
      (volume, index) =>
        (settings[index]?.segments ?? 1) > 1 &&
        (options[index]?.profile ?? 0.5) > 0.25 &&
        panelBevelOptionsHasCorners(volume),
    );
    for (const field of this.fields) {
      this.refreshField(field, options);
      this.refreshVisibility(field, settings, round, caps);
    }
  }

  /**
   * Hides settings that cannot affect the current selection. @param field
   * Contextual row. @param settings Bound volume settings. @param round
   * Multi-segment profiles present. @param caps Actual eligible corners
   * present.
   */
  private refreshVisibility(
    field: PanelBevelOptionField,
    settings: readonly ModifierBevelVolumeSettings[],
    round: boolean,
    caps: boolean,
  ): void {
    const when = field.definition.when;
    const visible =
      when === 'always' ||
      (when === 'round' && round) ||
      (when === 'trim' && settings.some((entry) => entry.uvLayout === 'trim')) ||
      (when === 'caps' && caps) ||
      (when === 'normals' &&
        settings.some((entry) => entry.segments > 1 && modifierBevelOptionsNormalize(entry.options).profile > 0.25));
    field.row.style.display = visible ? '' : 'none';
  }

  /**
   * Updates the ordinary widgets with normalized shared values.
   *
   * @param field Widget.
   * @param options Bound normalized options.
   */
  private refreshField(field: PanelBevelOptionField, options: readonly ModifierBevelOptions[]): void {
    const key = field.definition.key;
    if (field.input instanceof InputNumeric) {
      field.input.setSharedValues(
        options.map((entry) => Number(entry[key])),
        3,
      );
      const slider = field.row.querySelector<HTMLInputElement>('input[type="range"]');
      if (slider) slider.value = String(options[0]?.profile ?? 0.5);
      return;
    }
    this.refreshSelect(field.input, key, options);
  }
  /**
   * Adds a bounded profile slider beside the precise numeric field.
   *
   * @param field Profile row.
   * @param number Numeric widget.
   */
  private appendProfileSlider(field: PanelBevelOptionField, number: InputNumeric): void {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0.25';
    slider.max = '0.5';
    slider.step = '0.005';
    slider.value = '0.5';
    slider.setAttribute('aria-label', 'Bevel profile slider');
    slider.style.minWidth = '0';
    slider.style.flex = '1';
    slider.addEventListener('input', () => number.setNumber(Number(slider.value), 3));
    slider.addEventListener('change', () => this.commitField(field));
    field.row.appendChild(slider);
  }

  /**
   * Labels the shared amount in the selected width mode's units.
   *
   * @param options Selected controls.
   * @param input Amount widget.
   */
  private refreshAmountCaption(options: readonly ModifierBevelOptions[], input: InputNumeric): void {
    const modes = new Set(options.map((entry) => entry.widthMode));
    const mode = options[0]?.widthMode ?? 'offset';
    const label = input.getElement().parentElement?.querySelector(':scope > span');
    if (label)
      label.textContent =
        modes.size > 1 ? 'Amount' : mode === 'offset' ? 'Distance' : mode.charAt(0).toUpperCase() + mode.slice(1);
    input.getElement().title =
      mode === 'percent'
        ? 'Percentage of the shortest adjacent face span (0–100).'
        : 'World-space meters interpreted by Width mode.';
  }
  /**
   * Refreshes texture choices and normalized dropdown values.
   *
   * @param input Dropdown widget.
   * @param key Stored field.
   * @param options Current controls.
   */
  private refreshSelect(
    input: InputSelect,
    key: keyof ModifierBevelOptions,
    options: readonly ModifierBevelOptions[],
  ): void {
    if (key === 'capTextureId')
      input.setChoices([
        { value: 'inherit-bevel', label: 'Inherit Bevel' },
        ...textureChoicesList(options.map((entry) => entry.capTextureId)),
      ]);
    input.setSharedValues(
      options.map((entry) =>
        key === 'clampOverlap'
          ? entry[key]
            ? 'on'
            : 'off'
          : String(entry[key] || (key === 'capTextureId' ? 'inherit-bevel' : '')),
      ),
    );
  }
}
