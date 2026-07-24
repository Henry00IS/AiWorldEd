import {
  createDefaultCoordinateSpace,
  parseCoordinateSpaceDefinition
} from './coordinate_space_presets.js';
import type { CoordinateSpaceDefinition } from './coordinate_space_types.js';
import type { GameProfile } from './settings_types.js';
import type { ImperialUnit, MetricUnit, UnitSystem } from './unit_presets.js';
import {
  IMPERIAL_UNIT_OPTIONS,
  METRIC_UNIT_OPTIONS
} from './unit_presets.js';

/** JSON schema version embedded in each game profile file. */
export const GAME_PROFILE_JSON_VERSION = 2;

/**
 * On-disk shape of a single game profile JSON file.
 */
export interface GameProfileJsonDocument {
  version: number;
  id: string;
  name: string;
  unitSystem: UnitSystem;
  metricUnit: MetricUnit;
  imperialUnit: ImperialUnit;
  coordinateSpace: CoordinateSpaceDefinition;
}

/**
 * Serializes a game profile to a pretty-printed JSON string for one file.
 * @param profile Profile to serialize.
 * @returns JSON text suitable for a `.json` file.
 */
export function serializeGameProfileToJson(profile: GameProfile): string {
  const document: GameProfileJsonDocument = {
    version: GAME_PROFILE_JSON_VERSION,
    id: profile.id,
    name: profile.name,
    unitSystem: profile.unitSystem,
    metricUnit: profile.metricUnit,
    imperialUnit: profile.imperialUnit,
    coordinateSpace: profile.coordinateSpace
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Parses and validates a game profile JSON document string.
 * @param jsonText Raw JSON file contents.
 * @returns Parsed game profile.
 * @throws Error when the document is invalid.
 */
export function parseGameProfileJson(jsonText: string): GameProfile {
  const parsed = JSON.parse(jsonText) as Partial<GameProfileJsonDocument>;
  validateGameProfileDocument(parsed);
  return {
    id: String(parsed.id),
    name: String(parsed.name),
    unitSystem: parsed.unitSystem as UnitSystem,
    metricUnit: parsed.metricUnit as MetricUnit,
    imperialUnit: parsed.imperialUnit as ImperialUnit,
    coordinateSpace: resolveCoordinateSpace(parsed.coordinateSpace)
  };
}

/**
 * Builds a safe `.json` filename for a profile display name.
 * @param profileName Profile display name.
 * @returns Filename ending in `.json`.
 */
export function buildGameProfileFileName(profileName: string): string {
  const sanitized = profileName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 64);
  const baseName = sanitized.length > 0 ? sanitized : 'game_profile';
  return `${baseName}.json`;
}

/**
 * Validates required fields on a parsed game profile document.
 * @param document Candidate document object.
 */
function validateGameProfileDocument(
  document: Partial<GameProfileJsonDocument>
): void {
  if (!document || typeof document !== 'object') {
    throw new Error('Game profile JSON must be an object');
  }
  requireNonEmptyString(document.id, 'id');
  requireNonEmptyString(document.name, 'name');
  requireUnitSystem(document.unitSystem);
  requireMetricUnit(document.metricUnit);
  requireImperialUnit(document.imperialUnit);
}

/**
 * Resolves coordinate space from JSON, defaulting when absent (v1 profiles).
 * @param value Candidate coordinate space field.
 * @returns Valid coordinate space definition.
 */
function resolveCoordinateSpace(value: unknown): CoordinateSpaceDefinition {
  if (value === undefined || value === null) {
    return createDefaultCoordinateSpace();
  }
  return parseCoordinateSpaceDefinition(value);
}

/**
 * Ensures a field is a non-empty string.
 * @param value Candidate value.
 * @param fieldName Field label for errors.
 */
function requireNonEmptyString(value: unknown, fieldName: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Game profile JSON missing valid ${fieldName}`);
  }
}

/**
 * Ensures the unit system field is metric or imperial.
 * @param value Candidate value.
 */
function requireUnitSystem(value: unknown): void {
  if (value !== 'metric' && value !== 'imperial') {
    throw new Error('Game profile JSON has invalid unitSystem');
  }
}

/**
 * Ensures the metric unit field is a supported option.
 * @param value Candidate value.
 */
function requireMetricUnit(value: unknown): void {
  if (!METRIC_UNIT_OPTIONS.includes(value as MetricUnit)) {
    throw new Error('Game profile JSON has invalid metricUnit');
  }
}

/**
 * Ensures the imperial unit field is a supported option.
 * @param value Candidate value.
 */
function requireImperialUnit(value: unknown): void {
  if (!IMPERIAL_UNIT_OPTIONS.includes(value as ImperialUnit)) {
    throw new Error('Game profile JSON has invalid imperialUnit');
  }
}
