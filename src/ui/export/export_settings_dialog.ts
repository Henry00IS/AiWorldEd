import { unitsPerMeter } from '../../io/coordinate_space_transform.js';
import { EXPORT_CUSTOM_COORDINATE_SPACE_ID, ExportSettingsState } from '../../io/export_settings_state.js';
import type { EditorSettingsStore } from '../../settings/editor_settings_store.js';
import type { AxisDirection } from '../../settings/coordinate_space_types.js';
import { AXIS_DIRECTION_LABELS, AXIS_DIRECTION_OPTIONS } from '../../settings/coordinate_space_types.js';
import type { GameProfile } from '../../settings/settings_types.js';
import {
  getUnitLabel,
  getUnitOptionsForSystem,
  IMPERIAL_UNIT_LABELS,
  METRIC_UNIT_LABELS,
  UNIT_SYSTEM_LABELS,
  type ImperialUnit,
  type MetricUnit,
  type UnitSystem,
} from '../../settings/unit_presets.js';
import { Theme } from '../../theme.js';
import { hexToRgb } from '../../utils/color_utils.js';

/** Export formats supported by the one-shot settings dialog. */
export type ExportFormat = 'glb' | 'obj' | 'fbx';

/** Distinct cancellation result for export actions. */
export type ExportSettingsDialogResult = { confirmed: true; profile: GameProfile } | { confirmed: false };

/** One-shot profile, coordinate, and unit override dialog for exports. */
export class ExportSettingsDialog {
  private readonly host: HTMLElement;
  private readonly store: EditorSettingsStore;
  private state: ExportSettingsState | null;
  private backdrop: HTMLElement | null;
  private formHost: HTMLElement | null;
  private resolveResult: ((result: ExportSettingsDialogResult) => void) | null;
  private format: ExportFormat;
  private readonly onKeyDown: (event: KeyboardEvent) => void;

  /**
   * Creates an idle export settings dialog.
   *
   * @param host Editor host element.
   * @param store Settings store supplying profiles and presets.
   */
  constructor(host: HTMLElement, store: EditorSettingsStore) {
    this.host = host;
    this.store = store;
    this.state = null;
    this.backdrop = null;
    this.formHost = null;
    this.resolveResult = null;
    this.format = 'glb';
    this.onKeyDown = (event) => this.handleKeyDown(event);
  }

  /**
   * Opens a fresh dialog initialized from the active game profile.
   *
   * @param format Target export format.
   * @returns Confirmed transient profile or cancellation.
   */
  show(format: ExportFormat): Promise<ExportSettingsDialogResult> {
    this.cancelOpenDialog();
    this.format = format;
    this.state = this.createState();
    this.backdrop = this.buildBackdrop();
    this.host.appendChild(this.backdrop);
    document.addEventListener('keydown', this.onKeyDown);
    this.renderForm();
    return new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }

  /** Cancels and removes the dialog when it is currently open. */
  dispose(): void {
    this.cancelOpenDialog();
  }

  /**
   * Creates state from cloned settings data.
   *
   * @returns Fresh one-export state.
   */
  private createState(): ExportSettingsState {
    const snapshot = this.store.getSnapshot();
    return new ExportSettingsState(
      snapshot.gameProfiles,
      this.store.listCoordinateSpacePresets(),
      snapshot.activeGameProfileId,
    );
  }

  /**
   * Builds the modal backdrop and centered panel.
   *
   * @returns Backdrop element.
   */
  private buildBackdrop(): HTMLElement {
    const backdrop = document.createElement('div');
    styleBackdrop(backdrop);
    const panel = document.createElement('div');
    stylePanel(panel);
    panel.appendChild(this.buildHeader());
    this.formHost = document.createElement('div');
    panel.appendChild(this.formHost);
    backdrop.appendChild(panel);
    return backdrop;
  }

  /**
   * Builds the title for the current target format.
   *
   * @returns Header element.
   */
  private buildHeader(): HTMLElement {
    const header = document.createElement('div');
    header.textContent = `Export ${this.format.toUpperCase()} Settings`;
    header.style.fontSize = '16px';
    header.style.fontWeight = '600';
    header.style.marginBottom = '14px';
    return header;
  }

  /** Rebuilds controls from the current ephemeral state. */
  private renderForm(): void {
    if (!this.formHost || !this.state) return;
    this.formHost.replaceChildren();
    this.formHost.appendChild(this.buildProfileRow());
    this.formHost.appendChild(this.buildCoordinatePresetRow());
    if (this.state.getDraft().coordinateSpace.presetId === EXPORT_CUSTOM_COORDINATE_SPACE_ID) {
      this.appendCustomAxisRows();
    }
    this.formHost.appendChild(this.buildUnitSystemRow());
    this.formHost.appendChild(this.buildLengthUnitRow());
    this.formHost.appendChild(this.buildSummary());
    this.formHost.appendChild(this.buildActions());
  }

  /**
   * Builds the game-profile selection row.
   *
   * @returns Control row.
   */
  private buildProfileRow(): HTMLElement {
    const draft = this.requireState().getDraft();
    const options = this.requireState()
      .getProfiles()
      .map((profile) => ({ value: profile.id, label: profile.name }));
    return this.buildSelectRow('Game profile', 'export-game-profile', options, draft.id, (value) => {
      this.requireState().selectProfile(value);
      this.renderForm();
    });
  }

  /**
   * Builds the coordinate-preset selection row.
   *
   * @returns Control row.
   */
  private buildCoordinatePresetRow(): HTMLElement {
    const state = this.requireState();
    const options = state.getPresets().map((preset) => ({
      value: preset.presetId,
      label: preset.isCustom ? `${preset.name} (Custom)` : preset.name,
    }));
    options.push({ value: EXPORT_CUSTOM_COORDINATE_SPACE_ID, label: 'Custom override…' });
    return this.buildSelectRow(
      'Coordinate preset',
      'export-coordinate-preset',
      options,
      state.getDraft().coordinateSpace.presetId,
      (value) => {
        state.selectCoordinatePreset(value);
        this.renderForm();
      },
    );
  }

  /** Appends the three manual custom-axis controls. */
  private appendCustomAxisRows(): void {
    this.formHost?.appendChild(this.buildAxisRow('up', 'Up'));
    this.formHost?.appendChild(this.buildAxisRow('right', 'Right'));
    this.formHost?.appendChild(this.buildAxisRow('forward', 'Forward'));
  }

  /**
   * Builds one signed custom-axis selection row.
   *
   * @param role Semantic coordinate role.
   * @param label Display label.
   * @returns Control row.
   */
  private buildAxisRow(role: 'up' | 'right' | 'forward', label: string): HTMLElement {
    const state = this.requireState();
    const options = AXIS_DIRECTION_OPTIONS.map((axis) => ({ value: axis, label: AXIS_DIRECTION_LABELS[axis] }));
    return this.buildSelectRow(
      label,
      `export-coordinate-${role}`,
      options,
      state.getDraft().coordinateSpace[role],
      (value) => {
        state.setCustomAxis(role, value as AxisDirection);
        this.renderForm();
      },
    );
  }

  /**
   * Builds the metric/imperial selection row.
   *
   * @returns Control row.
   */
  private buildUnitSystemRow(): HTMLElement {
    const draft = this.requireState().getDraft();
    const options = (Object.keys(UNIT_SYSTEM_LABELS) as UnitSystem[]).map((value) => ({
      value,
      label: UNIT_SYSTEM_LABELS[value],
    }));
    return this.buildSelectRow('Unit system', 'export-unit-system', options, draft.unitSystem, (value) => {
      this.requireState().setUnitSystem(value as UnitSystem);
      this.renderForm();
    });
  }

  /**
   * Builds the length-unit row for the selected measurement system.
   *
   * @returns Control row.
   */
  private buildLengthUnitRow(): HTMLElement {
    const draft = this.requireState().getDraft();
    const selected = draft.unitSystem === 'metric' ? draft.metricUnit : draft.imperialUnit;
    const options = getUnitOptionsForSystem(draft.unitSystem).map((unit) => ({
      value: unit,
      label: getUnitLabel(draft.unitSystem, unit),
    }));
    return this.buildSelectRow('Length unit', 'export-length-unit', options, selected, (value) => {
      this.applyLengthUnit(value);
      this.renderForm();
    });
  }

  /**
   * Applies a length unit to the currently selected system.
   *
   * @param value Unit identifier.
   */
  private applyLengthUnit(value: string): void {
    const state = this.requireState();
    const draft = state.getDraft();
    if (draft.unitSystem === 'metric' && value in METRIC_UNIT_LABELS) {
      state.setMetricUnit(value as MetricUnit);
    }
    if (draft.unitSystem === 'imperial' && value in IMPERIAL_UNIT_LABELS) {
      state.setImperialUnit(value as ImperialUnit);
    }
  }

  /**
   * Builds the resolved coordinate and scale summary.
   *
   * @returns Summary element.
   */
  private buildSummary(): HTMLElement {
    const state = this.requireState();
    const summary = document.createElement('div');
    summary.dataset['exportSettingsSummary'] = 'true';
    summary.textContent = `${state.getCoordinateSummary()} · 1 editor meter = ${formatScale(unitsPerMeter(state.getDraft()))} file units`;
    summary.style.color = state.isValid() ? Theme.statusBarTextColor : '#ff7b72';
    summary.style.fontFamily = 'monospace';
    summary.style.fontSize = '11px';
    summary.style.lineHeight = '1.5';
    summary.style.marginTop = '10px';
    return summary;
  }

  /**
   * Builds Cancel and Export buttons.
   *
   * @returns Action row.
   */
  private buildActions(): HTMLElement {
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '16px';
    actions.appendChild(this.buildButton('Cancel', 'cancel', () => this.finish({ confirmed: false })));
    const confirm = this.buildButton('Export', 'confirm', () => this.confirm());
    confirm.disabled = !this.requireState().isValid();
    actions.appendChild(confirm);
    return actions;
  }

  /**
   * Builds a labeled select row.
   *
   * @param label Row label.
   * @param field Stable test/accessibility field id.
   * @param options Select options.
   * @param selected Selected value.
   * @param onChange Change callback.
   * @returns Control row.
   */
  private buildSelectRow(
    label: string,
    field: string,
    options: { value: string; label: string }[],
    selected: string,
    onChange: (value: string) => void,
  ): HTMLElement {
    const select = buildSelect(field, options, selected, onChange);
    return buildControlRow(label, select);
  }

  /**
   * Builds a dialog action button.
   *
   * @param label Button label.
   * @param action Stable action id.
   * @param onClick Click callback.
   * @returns Button.
   */
  private buildButton(label: string, action: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset['exportSettingsAction'] = action;
    styleButton(button);
    button.addEventListener('click', onClick);
    return button;
  }

  /** Confirms the current valid transient profile. */
  private confirm(): void {
    const state = this.requireState();
    if (!state.isValid()) return;
    this.finish({ confirmed: true, profile: state.buildExportProfile() });
  }

  /**
   * Handles Escape cancellation.
   *
   * @param event Keyboard event.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.finish({ confirmed: false });
  }

  /**
   * Resolves the active promise and removes modal resources.
   *
   * @param result Dialog result.
   */
  private finish(result: ExportSettingsDialogResult): void {
    const resolve = this.resolveResult;
    this.removeDialog();
    resolve?.(result);
  }

  /** Cancels an existing unresolved dialog before reopening or disposal. */
  private cancelOpenDialog(): void {
    if (!this.backdrop) return;
    this.finish({ confirmed: false });
  }

  /** Removes DOM and listener resources without resolving. */
  private removeDialog(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.backdrop?.remove();
    this.backdrop = null;
    this.formHost = null;
    this.state = null;
    this.resolveResult = null;
  }

  /**
   * Returns initialized dialog state.
   *
   * @returns Current state.
   * @throws Error when the dialog is not open.
   */
  private requireState(): ExportSettingsState {
    if (!this.state) throw new Error('Export settings dialog is not open');
    return this.state;
  }
}

/**
 * Builds a select with stable data attributes.
 *
 * @param field Stable field id.
 * @param options Option values and labels.
 * @param selected Selected value.
 * @param onChange Change callback.
 * @returns Select element.
 */
function buildSelect(
  field: string,
  options: { value: string; label: string }[],
  selected: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.dataset['exportSettingsField'] = field;
  options.forEach((option) => select.appendChild(new Option(option.label, option.value)));
  select.value = selected;
  styleSelect(select);
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

/**
 * Builds a two-column labeled control row.
 *
 * @param labelText Row label.
 * @param control Form control.
 * @returns Row element.
 */
function buildControlRow(labelText: string, control: HTMLElement): HTMLElement {
  const row = document.createElement('label');
  row.style.display = 'grid';
  row.style.gridTemplateColumns = '145px 1fr';
  row.style.alignItems = 'center';
  row.style.gap = '10px';
  row.style.marginBottom = '9px';
  const label = document.createElement('span');
  label.textContent = labelText;
  label.style.fontSize = '12px';
  row.append(label, control);
  return row;
}

/**
 * Styles the modal backdrop.
 *
 * @param backdrop Backdrop element.
 */
function styleBackdrop(backdrop: HTMLElement): void {
  backdrop.dataset['exportSettingsDialog'] = 'true';
  backdrop.style.position = 'fixed';
  backdrop.style.inset = '0';
  backdrop.style.zIndex = '10020';
  backdrop.style.display = 'flex';
  backdrop.style.alignItems = 'center';
  backdrop.style.justifyContent = 'center';
  backdrop.style.background = 'rgba(0, 0, 0, 0.66)';
}

/**
 * Styles the centered export panel.
 *
 * @param panel Panel element.
 */
function stylePanel(panel: HTMLElement): void {
  panel.style.width = 'min(520px, calc(100vw - 32px))';
  panel.style.padding = '18px';
  panel.style.borderRadius = '7px';
  panel.style.border = `1px solid ${Theme.inputBorderColor}`;
  panel.style.background = hexToRgb(Theme.propertiesPanelBackground);
  panel.style.color = Theme.buttonTextColor;
  panel.style.fontFamily = Theme.uiFontFamily;
  panel.style.boxShadow = '0 18px 48px rgba(0, 0, 0, 0.55)';
}

/**
 * Styles a form select.
 *
 * @param select Select element.
 */
function styleSelect(select: HTMLSelectElement): void {
  select.style.width = '100%';
  select.style.padding = '6px 8px';
  select.style.borderRadius = '4px';
  select.style.border = `1px solid ${Theme.inputBorderColor}`;
  select.style.background = Theme.inputBackgroundColor;
  select.style.color = Theme.buttonTextColor;
}

/**
 * Styles an action button.
 *
 * @param button Button element.
 */
function styleButton(button: HTMLButtonElement): void {
  button.style.padding = '7px 14px';
  button.style.borderRadius = '4px';
  button.style.border = `1px solid ${Theme.inputBorderColor}`;
  button.style.background = hexToRgb(Theme.buttonBackground);
  button.style.color = Theme.buttonTextColor;
  button.style.cursor = 'pointer';
}

/**
 * Formats export scale compactly.
 *
 * @param scale Units per editor meter.
 * @returns Compact decimal.
 */
function formatScale(scale: number): string {
  return Number(scale.toPrecision(8)).toString();
}
