import {
  areValidCoordinateAxes,
  cloneCoordinateSpace,
  deriveHandedness,
  formatCoordinateSpaceSummary,
} from '../settings/coordinate_space_presets.js';
import type { AxisDirection, CoordinateSpaceDefinition } from '../settings/coordinate_space_types.js';
import { cloneProfile } from '../settings/game_profile_clone.js';
import { createDefaultGameProfile } from '../settings/settings_defaults.js';
import type { GameProfile } from '../settings/settings_types.js';
import type { ImperialUnit, MetricUnit, UnitSystem } from '../settings/unit_presets.js';

/** Ephemeral preset id used by manual export-axis overrides. */
export const EXPORT_CUSTOM_COORDINATE_SPACE_ID = '__export_custom__';

/** Mutable, non-persisted state for one export settings dialog. */
export class ExportSettingsState {
  private readonly profiles: GameProfile[];
  private readonly presets: CoordinateSpaceDefinition[];
  private draft: GameProfile;
  private axesValid: boolean;

  /**
   * Creates one-export state from settings snapshots.
   *
   * @param profiles Available game profiles.
   * @param presets Built-in and custom coordinate presets.
   * @param activeProfileId Initially selected profile id.
   */
  constructor(profiles: GameProfile[], presets: CoordinateSpaceDefinition[], activeProfileId: string | null) {
    this.profiles = profiles.map((profile) => cloneProfile(profile));
    this.presets = presets.map((preset) => cloneCoordinateSpace(preset));
    this.draft = this.resolveInitialProfile(activeProfileId);
    this.axesValid = true;
  }

  /**
   * Returns independent profile options.
   *
   * @returns Available profiles.
   */
  getProfiles(): GameProfile[] {
    return this.profiles.map((profile) => cloneProfile(profile));
  }

  /**
   * Returns independent coordinate preset options.
   *
   * @returns Available presets.
   */
  getPresets(): CoordinateSpaceDefinition[] {
    return this.presets.map((preset) => cloneCoordinateSpace(preset));
  }

  /**
   * Returns a cloned draft for rendering.
   *
   * @returns Current transient profile.
   */
  getDraft(): GameProfile {
    return cloneProfile(this.draft);
  }

  /**
   * Selects a profile and resets all one-export overrides.
   *
   * @param profileId Profile id.
   */
  selectProfile(profileId: string): void {
    const selected = this.profiles.find((profile) => profile.id === profileId);
    if (!selected) return;
    this.draft = cloneProfile(selected);
    this.axesValid = true;
  }

  /**
   * Selects a built-in or saved custom coordinate preset.
   *
   * @param presetId Coordinate preset id.
   */
  selectCoordinatePreset(presetId: string): void {
    if (presetId === EXPORT_CUSTOM_COORDINATE_SPACE_ID) {
      this.beginCustomOverride();
      return;
    }
    const selected = this.presets.find((preset) => preset.presetId === presetId);
    if (!selected) return;
    this.draft.coordinateSpace = cloneCoordinateSpace(selected);
    this.axesValid = true;
  }

  /** Starts a manually editable coordinate override from the current axes. */
  beginCustomOverride(): void {
    this.draft.coordinateSpace = {
      ...cloneCoordinateSpace(this.draft.coordinateSpace),
      presetId: EXPORT_CUSTOM_COORDINATE_SPACE_ID,
      name: 'Custom Export',
      isCustom: true,
    };
    this.axesValid = true;
  }

  /**
   * Updates one custom export axis and re-derives handedness when valid.
   *
   * @param role Semantic axis role.
   * @param direction New signed direction.
   */
  setCustomAxis(role: 'up' | 'right' | 'forward', direction: AxisDirection): void {
    this.draft.coordinateSpace[role] = direction;
    const space = this.draft.coordinateSpace;
    this.axesValid = areValidCoordinateAxes(space.up, space.right, space.forward);
    const handedness = deriveHandedness(space.up, space.right, space.forward);
    if (handedness) space.handedness = handedness;
  }

  /**
   * Updates the one-export measurement system.
   *
   * @param unitSystem Metric or imperial.
   */
  setUnitSystem(unitSystem: UnitSystem): void {
    this.draft.unitSystem = unitSystem;
  }

  /**
   * Updates the one-export metric unit.
   *
   * @param unit Metric unit.
   */
  setMetricUnit(unit: MetricUnit): void {
    this.draft.metricUnit = unit;
  }

  /**
   * Updates the one-export imperial unit.
   *
   * @param unit Imperial unit.
   */
  setImperialUnit(unit: ImperialUnit): void {
    this.draft.imperialUnit = unit;
  }

  /**
   * Reports whether the current axes form an orthogonal basis.
   *
   * @returns True when export may proceed.
   */
  isValid(): boolean {
    return this.axesValid;
  }

  /**
   * Builds coordinate summary text or a validation message.
   *
   * @returns Human-readable summary.
   */
  getCoordinateSummary(): string {
    if (!this.axesValid) return 'Choose three different perpendicular axes.';
    return formatCoordinateSpaceSummary(this.draft.coordinateSpace);
  }

  /**
   * Returns a confirmed transient profile.
   *
   * @returns Cloned profile.
   * @throws Error when custom axes are invalid.
   */
  buildExportProfile(): GameProfile {
    if (!this.axesValid) throw new Error('Export coordinate axes are invalid');
    return cloneProfile(this.draft);
  }

  /**
   * Resolves the active profile or an identity-compatible fallback.
   *
   * @param activeProfileId Active profile id.
   * @returns Initial draft.
   */
  private resolveInitialProfile(activeProfileId: string | null): GameProfile {
    const active = this.profiles.find((profile) => profile.id === activeProfileId);
    if (active) return cloneProfile(active);
    if (this.profiles[0]) return cloneProfile(this.profiles[0]);
    return createDefaultGameProfile('export-default', 'Default');
  }
}
