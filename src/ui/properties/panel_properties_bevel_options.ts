import type { Object3D } from 'three';
import { InputNumeric } from '@/ui/input/input_numeric.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import { InputSelect, type InputSelectChoice } from '@/ui/input/input_select.js';
import { textureChoicesList } from '@/texture/library/texture_choices.js';
import {
  modifierBevelOptionsNormalize,
  type ModifierBevelOptions,
} from '@/modifier/volume/modifier_volume_bevel_options.js';
import type { ModifierBevelVolumeSettings } from '@/modifier/volume/modifier_volume_bevel.js';
import { panelBevelOptionsHasCorners } from './panel_properties_bevel_options_visibility.js';

/** One context-sensitive inspector field definition. */
interface PanelBevelOptionDefinition {
  /** Stored option. */
  key: keyof ModifierBevelOptions;
  /** Visible row caption. */
  label: string;
  /** Accessible name. */
  aria: string;
  /** Applicability condition. */
  when: 'always' | 'round' | 'trim' | 'caps' | 'normals';
  /** Choice values, or absent for a numeric field. */
  choices?: InputSelectChoice[];
  /** Numeric arrow step. */
  step?: number;
  /** Explanation including units and limitations. */
  title: string;
}

/** Convex geometry controls in the cut section. */
const geometryDefinitions: PanelBevelOptionDefinition[] = [
  {
    key: 'widthMode',
    label: 'Width mode',
    aria: 'Bevel width mode',
    when: 'always',
    choices: [
      { value: 'offset', label: 'Offset' },
      { value: 'width', label: 'Width' },
      { value: 'depth', label: 'Depth' },
      { value: 'percent', label: 'Percent' },
    ],
    title:
      'Offset: distance along each wall. Width: contact-to-contact chord. Depth: perpendicular depth of the flat chamfer chord. Percent: percentage of the shortest adjacent face span. Lengths are world meters.',
  },
  {
    key: 'clampOverlap',
    label: 'Clamp overlap',
    aria: 'Bevel clamp overlap',
    when: 'always',
    choices: [
      { value: 'off', label: 'Off' },
      { value: 'on', label: 'On' },
    ],
    title:
      'Conservatively limits each offset to 49% of the shortest adjacent face span. Works across volumes; may stop before the maximum possible width. Empty-solid clipping is always guarded.',
  },
  {
    key: 'profile',
    label: 'Profile',
    aria: 'Bevel profile',
    when: 'round',
    step: 0.025,
    title:
      'Convex-only shape: 0.25 is a straight chamfer; 0.5 is round. Intermediate values blend the chord and circular arc. Concave/cove profiles are not supported.',
  },
  {
    key: 'normals',
    label: 'Strip normals',
    aria: 'Bevel strip normals',
    when: 'normals',
    choices: [
      { value: 'flat', label: 'Flat' },
      { value: 'smooth', label: 'Smooth' },
    ],
    title:
      'Smooth blends strip normals across segment and UV seams, matches authored walls at contacts, and keeps cap creases. Geometry stays convex; authored walls remain flat.',
  },
];

/** Trim-specific chart controls. */
const trimDefinitions: PanelBevelOptionDefinition[] = [
  {
    key: 'trimSeam',
    label: 'Trim seam',
    aria: 'Bevel trim seam',
    when: 'trim',
    step: 0.05,
    title:
      'Location of the repeating texture seam across the profile, from 0 to 1 texture turn. Does not split geometry.',
  },
  {
    key: 'trimOrigin',
    label: 'Trim origin',
    aria: 'Bevel trim origin',
    when: 'trim',
    choices: [
      { value: 'anchor', label: 'Anchor' },
      { value: 'center', label: 'Center' },
      { value: 'end', label: 'Opposite end' },
    ],
    title: 'Sets length U=0 at the existing deterministic edge anchor, its midpoint, or the opposite endpoint.',
  },
  {
    key: 'trimDirection',
    label: 'Trim direction',
    aria: 'Bevel trim direction',
    when: 'trim',
    choices: [
      { value: 'forward', label: 'Forward' },
      { value: 'reverse', label: 'Reverse' },
    ],
    title: 'Reverses the texture along the authored edge without reversing the profile or changing geometry.',
  },
];

/** Options for actual multi-edge corners only. */
const capDefinitions: PanelBevelOptionDefinition[] = [
  {
    key: 'corner',
    label: 'Corner',
    aria: 'Bevel corner policy',
    when: 'caps',
    choices: [
      { value: 'simple', label: 'Simple / mitre' },
      { value: 'patch', label: 'Planar patch' },
    ],
    title:
      'Simple preserves the intersection of convex edge strips. Planar patch adds a flat convex cut where at least three selected edges meet; it is not a concave or curved grid patch.',
  },
  {
    key: 'capProjection',
    label: 'Cap projection',
    aria: 'Bevel cap projection',
    when: 'caps',
    choices: [
      { value: 'inherit', label: 'Follow layout' },
      { value: 'axis', label: 'Axis' },
    ],
    title:
      'Follow layout preserves the existing cap chart. Axis independently projects corner caps using the selected Local/World space. Strip UVs stay unchanged.',
  },
  {
    key: 'capTextureId',
    label: 'Cap texture',
    aria: 'Bevel cap texture',
    when: 'caps',
    choices: [],
    title:
      'Overrides only corner cap textures. Inherit bevel uses the ordinary bevel texture or its inherited authored wall.',
  },
];

/** Field and row owned by the contextual options helper. */
interface PanelBevelOptionField {
  /** Field applicability and storage. */
  definition: PanelBevelOptionDefinition;
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
   * Appends geometry rows.
   *
   * @param section Inspector container.
   */
  appendGeometry(section: HTMLElement): void {
    geometryDefinitions.forEach((definition) => this.append(section, definition));
  }

  /**
   * Appends layout-dependent rows.
   *
   * @param section Inspector container.
   */
  appendCharts(section: HTMLElement): void {
    [...trimDefinitions, ...capDefinitions].forEach((definition) => this.append(section, definition));
  }

  /**
   * Creates one row and connects it to the existing settings undo.
   *
   * @param section Inspector container.
   * @param definition Contextual option.
   */
  private append(section: HTMLElement, definition: PanelBevelOptionDefinition): void {
    const input = definition.choices
      ? new InputSelect(definition.choices, definition.aria)
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
    field.row.style.display = visible ? 'flex' : 'none';
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
        { value: 'inherit-bevel', label: 'Inherit bevel' },
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
