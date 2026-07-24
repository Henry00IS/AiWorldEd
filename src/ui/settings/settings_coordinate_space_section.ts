import type { EditorSettingsStore } from '../../settings/editor_settings_store.js';
import {
  formatCoordinateSpaceSummary
} from '../../settings/coordinate_space_presets.js';
import type {
  AxisDirection,
  CoordinateSpaceDefinition
} from '../../settings/coordinate_space_types.js';
import {
  AXIS_DIRECTION_LABELS,
  AXIS_DIRECTION_OPTIONS
} from '../../settings/coordinate_space_types.js';
import type { GameProfile } from '../../settings/settings_types.js';
import { Theme } from '../../theme.js';
import {
  createSettingsCategory,
  createSettingsControlRow,
  createSettingsSecondaryButton,
  createSettingsSelect,
  createSettingsTextInput
} from './settings_form_controls.js';

/** Sentinel value for the "create custom" dropdown action. */
export const CREATE_CUSTOM_COORDINATE_SPACE_VALUE = '__create_custom__';

/**
 * Builds the Coordinate space category for a game profile editor.
 */
export class SettingsCoordinateSpaceSection {
  private readonly store: EditorSettingsStore;

  /**
   * Creates the section builder.
   * @param store Settings store for coordinate space mutations.
   */
  constructor(store: EditorSettingsStore) {
    this.store = store;
  }

  /**
   * Builds the full coordinate space category for the active profile.
   * @param profile Active game profile.
   * @returns Category section element.
   */
  build(profile: GameProfile): HTMLElement {
    const { section, body } = createSettingsCategory('Coordinate space');
    body.appendChild(this.createPresetRow(profile));
    body.appendChild(this.createSummaryRow(profile.coordinateSpace));
    if (profile.coordinateSpace.isCustom) {
      this.appendCustomEditors(body, profile);
    }
    return section;
  }

  /**
   * Appends custom-only name/axis/remove controls.
   * @param body Category body container.
   * @param profile Active profile using a custom space.
   */
  private appendCustomEditors(body: HTMLElement, profile: GameProfile): void {
    body.appendChild(this.createCustomNameRow(profile));
    body.appendChild(this.createAxisRow(profile, 'up', 'Up'));
    body.appendChild(this.createAxisRow(profile, 'right', 'Right'));
    body.appendChild(this.createAxisRow(profile, 'forward', 'Forward'));
    body.appendChild(this.createRemoveCustomRow(profile));
  }

  /**
   * Creates the preset selection dropdown.
   * @param profile Active profile.
   * @returns Control row.
   */
  private createPresetRow(profile: GameProfile): HTMLElement {
    const options = this.buildPresetOptions();
    const select = createSettingsSelect(
      options,
      profile.coordinateSpace.presetId,
      (value) => this.handlePresetSelection(profile.id, value)
    );
    select.dataset.settingsField = 'coordinate-space-preset';
    return createSettingsControlRow('Preset', select);
  }

  /**
   * Builds dropdown options for built-in, custom, and create-new entries.
   * @returns Option list for the preset select.
   */
  private buildPresetOptions(): { value: string; label: string }[] {
    const presets = this.store.listCoordinateSpacePresets();
    const options = presets.map((space) => ({
      value: space.presetId,
      label: space.isCustom ? `${space.name} (Custom)` : space.name
    }));
    options.push({
      value: CREATE_CUSTOM_COORDINATE_SPACE_VALUE,
      label: '+ Create custom…'
    });
    return options;
  }

  /**
   * Handles preset dropdown changes including custom creation.
   * @param profileId Active profile id.
   * @param value Selected option value.
   */
  private handlePresetSelection(profileId: string, value: string): void {
    if (value === CREATE_CUSTOM_COORDINATE_SPACE_VALUE) {
      this.store.addCustomCoordinateSpace(profileId);
      return;
    }
    this.store.setGameProfileCoordinateSpacePreset(profileId, value);
  }

  /**
   * Creates a read-only summary of the active axes.
   * @param space Active coordinate space.
   * @returns Summary row element.
   */
  private createSummaryRow(space: CoordinateSpaceDefinition): HTMLElement {
    const summary = document.createElement('div');
    summary.dataset.settingsField = 'coordinate-space-summary';
    summary.textContent = formatCoordinateSpaceSummary(space);
    summary.style.fontSize = '11px';
    summary.style.fontFamily = 'monospace';
    summary.style.color = Theme.statusBarTextColor;
    summary.style.lineHeight = '1.45';
    summary.style.padding = '2px 0 4px';
    return summary;
  }

  /**
   * Creates the custom preset name field.
   * @param profile Active profile.
   * @returns Control row.
   */
  private createCustomNameRow(profile: GameProfile): HTMLElement {
    const input = createSettingsTextInput(
      profile.coordinateSpace.name,
      'Custom coordinate space name',
      (value) => {
        this.store.renameCustomCoordinateSpace(
          profile.coordinateSpace.presetId,
          value
        );
      }
    );
    input.dataset.settingsField = 'coordinate-space-name';
    return createSettingsControlRow('Preset name', input);
  }

  /**
   * Creates an axis direction dropdown for custom presets.
   * @param profile Active profile.
   * @param axis Axis role.
   * @param label Row label.
   * @returns Control row.
   */
  private createAxisRow(
    profile: GameProfile,
    axis: 'up' | 'right' | 'forward',
    label: string
  ): HTMLElement {
    const options = AXIS_DIRECTION_OPTIONS.map((direction) => ({
      value: direction,
      label: AXIS_DIRECTION_LABELS[direction]
    }));
    const select = createSettingsSelect(
      options,
      profile.coordinateSpace[axis],
      (value) => {
        this.store.setCustomCoordinateSpaceAxis(
          profile.coordinateSpace.presetId,
          axis,
          value as AxisDirection
        );
      }
    );
    select.dataset.settingsField = `coordinate-space-${axis}`;
    return createSettingsControlRow(label, select);
  }

  /**
   * Creates a remove action for the active custom preset.
   * @param profile Active profile.
   * @returns Control row.
   */
  private createRemoveCustomRow(profile: GameProfile): HTMLElement {
    const button = createSettingsSecondaryButton('Remove Custom Preset', () => {
      this.store.removeCustomCoordinateSpace(profile.coordinateSpace.presetId);
    });
    button.dataset.settingsAction = 'remove-coordinate-space';
    return createSettingsControlRow('Manage', button);
  }
}
