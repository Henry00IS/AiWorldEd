import type { EditorSettingsStore } from '../../settings/editor_settings_store.js';
import type { GameProfile } from '../../settings/settings_types.js';
import { FileDialogManager } from '../../io/file_dialog_manager.js';
import {
  getUnitLabel,
  getUnitOptionsForSystem,
  IMPERIAL_UNIT_LABELS,
  METRIC_UNIT_LABELS,
  UNIT_SYSTEM_LABELS,
  type ImperialUnit,
  type MetricUnit,
  type UnitSystem
} from '../../settings/unit_presets.js';
import { Theme } from '../../theme.js';
import { hexToRgb } from '../../utils/color_utils.js';
import {
  createSettingsButton,
  createSettingsCategory,
  createSettingsControlRow,
  createSettingsSecondaryButton,
  createSettingsSelect,
  createSettingsTextInput
} from './settings_form_controls.js';
import { SettingsCoordinateSpaceSection } from './settings_coordinate_space_section.js';

/**
 * Games tab content: game profiles list and unit preset editors.
 */
export class SettingsGamesTab {
  private readonly store: EditorSettingsStore;
  private readonly fileDialogs: FileDialogManager;
  private readonly coordinateSpaceSection: SettingsCoordinateSpaceSection;
  private readonly root: HTMLElement;
  private readonly listHost: HTMLElement;
  private readonly detailHost: HTMLElement;

  /**
   * Creates the Games tab panel.
   * @param store Settings store driving profile data.
   */
  constructor(store: EditorSettingsStore) {
    this.store = store;
    this.fileDialogs = new FileDialogManager();
    this.coordinateSpaceSection = new SettingsCoordinateSpaceSection(store);
    this.root = document.createElement('div');
    this.listHost = document.createElement('div');
    this.detailHost = document.createElement('div');
    this.buildLayout();
    this.rebuild();
  }

  /**
   * Returns the tab root element.
   * @returns Root element.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /**
   * Rebuilds profile list and active profile editor from the store.
   */
  rebuild(): void {
    this.listHost.replaceChildren();
    this.detailHost.replaceChildren();
    this.buildProfileList();
    this.buildActiveProfileEditor();
  }

  /**
   * Builds the outer Games tab layout.
   */
  private buildLayout(): void {
    this.root.style.display = 'flex';
    this.root.style.flexDirection = 'column';
    this.root.style.gap = '12px';
    this.root.appendChild(this.buildToolbar());
    this.root.appendChild(this.listHost);
    this.root.appendChild(this.detailHost);
    this.styleListHost();
  }

  /**
   * Builds the game-profile file and creation toolbar row.
   * @returns Toolbar element.
   */
  private buildToolbar(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'flex-end';
    row.style.gap = '8px';
    const addButton = createSettingsButton('+ Add Game Profile', () => {
      this.store.addGameProfile();
    });
    addButton.setAttribute('aria-label', 'Add game profile');
    addButton.dataset.settingsAction = 'add-game-profile';
    row.appendChild(addButton);
    const loadButton = createSettingsSecondaryButton('Load Game Profile', () => {
      void this.loadGameProfile();
    });
    loadButton.dataset.settingsAction = 'load-game-profile';
    row.appendChild(loadButton);
    const saveButton = createSettingsSecondaryButton('Save Game Profile', () => {
      void this.saveGameProfile();
    });
    saveButton.dataset.settingsAction = 'save-game-profile';
    row.appendChild(saveButton);
    return row;
  }

  /**
   * Saves the active profile as a portable JSON file.
   */
  private async saveGameProfile(): Promise<void> {
    const profile = this.store.getActiveGameProfile();
    if (!profile) {
      return;
    }
    const json = this.store.getGameProfileJson(profile.id);
    const fileName = this.store.getGameProfileFileName(profile.id);
    if (!json || !fileName) {
      return;
    }
    await this.fileDialogs.saveJSON(json, fileName);
  }

  /**
   * Loads a profile JSON file and adds it as the active profile.
   */
  private async loadGameProfile(): Promise<void> {
    const json = await this.fileDialogs.loadJSON();
    if (!json) {
      return;
    }
    try {
      this.store.importGameProfileJson(json);
    } catch {
      return;
    }
  }

  /**
   * Styles the profile list container.
   */
  private styleListHost(): void {
    this.listHost.style.display = 'flex';
    this.listHost.style.flexDirection = 'column';
    this.listHost.style.gap = '6px';
  }

  /**
   * Renders selectable profile rows.
   */
  private buildProfileList(): void {
    const snapshot = this.store.getSnapshot();
    snapshot.gameProfiles.forEach((profile) => {
      this.listHost.appendChild(
        this.createProfileListItem(profile, snapshot.activeGameProfileId)
      );
    });
  }

  /**
   * Creates one selectable profile list item.
   * @param profile Profile data.
   * @param activeId Active profile id.
   * @returns List item element.
   */
  private createProfileListItem(
    profile: GameProfile,
    activeId: string | null
  ): HTMLElement {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = profile.name;
    item.dataset.profileId = profile.id;
    item.dataset.settingsAction = 'select-game-profile';
    this.styleProfileListItem(item, profile.id === activeId);
    item.addEventListener('click', () => {
      this.store.setActiveGameProfileId(profile.id);
    });
    return item;
  }

  /**
   * Applies list item chrome for active/inactive states.
   * @param item Button element.
   * @param isActive Whether the profile is selected.
   */
  private styleProfileListItem(item: HTMLElement, isActive: boolean): void {
    item.style.textAlign = 'left';
    item.style.padding = '7px 10px';
    item.style.borderRadius = '4px';
    item.style.cursor = 'pointer';
    item.style.fontFamily = Theme.uiFontFamily;
    item.style.fontSize = '12px';
    item.style.fontWeight = '500';
    item.style.color = Theme.buttonTextColor;
    item.style.border = isActive
      ? `1px solid ${hexToRgb(Theme.selectionColor)}`
      : `1px solid ${Theme.inputBorderColor}`;
    item.style.background = isActive
      ? Theme.outlinerSelectedColor
      : hexToRgb(Theme.buttonBackground);
  }

  /**
   * Builds the unit and coordinate space editors for the active profile.
   */
  private buildActiveProfileEditor(): void {
    const profile = this.store.getActiveGameProfile();
    if (!profile) {
      return;
    }
    this.detailHost.appendChild(this.buildProfileIdentitySection(profile));
    this.detailHost.appendChild(this.buildUnitPresetSection(profile));
    this.detailHost.appendChild(this.coordinateSpaceSection.build(profile));
  }

  /**
   * Builds the profile name / remove section.
   * @param profile Active profile.
   * @returns Section element.
   */
  private buildProfileIdentitySection(profile: GameProfile): HTMLElement {
    const { section, body } = createSettingsCategory('Profile');
    body.appendChild(this.createNameRow(profile));
    if (this.store.getSnapshot().gameProfiles.length > 1) {
      body.appendChild(this.createRemoveRow(profile));
    }
    return section;
  }

  /**
   * Builds the unit preset category.
   * @param profile Active profile.
   * @returns Section element.
   */
  private buildUnitPresetSection(profile: GameProfile): HTMLElement {
    const { section, body } = createSettingsCategory('Unit preset');
    body.appendChild(this.createUnitSystemRow(profile));
    body.appendChild(this.createLengthUnitRow(profile));
    return section;
  }

  /**
   * Creates the profile name field.
   * @param profile Active profile.
   * @returns Control row.
   */
  private createNameRow(profile: GameProfile): HTMLElement {
    const input = createSettingsTextInput(profile.name, 'Game profile name', (value) => {
      this.store.renameGameProfile(profile.id, value);
    });
    return createSettingsControlRow('Profile name', input);
  }

  /**
   * Creates the Imperial/Metric system dropdown.
   * @param profile Active profile.
   * @returns Control row.
   */
  private createUnitSystemRow(profile: GameProfile): HTMLElement {
    const options = (Object.keys(UNIT_SYSTEM_LABELS) as UnitSystem[]).map(
      (value) => ({ value, label: UNIT_SYSTEM_LABELS[value] })
    );
    const select = createSettingsSelect(options, profile.unitSystem, (value) => {
      this.store.setGameProfileUnitSystem(profile.id, value as UnitSystem);
    });
    select.dataset.settingsField = 'unit-system';
    return createSettingsControlRow('System', select);
  }

  /**
   * Creates the length unit dropdown for the active system.
   * @param profile Active profile.
   * @returns Control row.
   */
  private createLengthUnitRow(profile: GameProfile): HTMLElement {
    const options = getUnitOptionsForSystem(profile.unitSystem).map((unit) => ({
      value: unit,
      label: getUnitLabel(profile.unitSystem, unit)
    }));
    const selected =
      profile.unitSystem === 'metric'
        ? profile.metricUnit
        : profile.imperialUnit;
    const select = createSettingsSelect(options, selected, (value) => {
      this.applyLengthUnit(profile, value);
    });
    select.dataset.settingsField = 'length-unit';
    return createSettingsControlRow('Unit', select);
  }

  /**
   * Applies a length unit change for the active measurement system.
   * @param profile Active profile.
   * @param value Selected unit value.
   */
  private applyLengthUnit(profile: GameProfile, value: string): void {
    if (profile.unitSystem === 'metric') {
      if (value in METRIC_UNIT_LABELS) {
        this.store.setGameProfileMetricUnit(profile.id, value as MetricUnit);
      }
      return;
    }
    if (value in IMPERIAL_UNIT_LABELS) {
      this.store.setGameProfileImperialUnit(profile.id, value as ImperialUnit);
    }
  }

  /**
   * Creates a remove-profile action row.
   * @param profile Active profile.
   * @returns Control row.
   */
  private createRemoveRow(profile: GameProfile): HTMLElement {
    const button = createSettingsSecondaryButton('Remove Profile', () => {
      this.store.removeGameProfile(profile.id);
    });
    button.dataset.settingsAction = 'remove-game-profile';
    return createSettingsControlRow('Manage', button);
  }
}
