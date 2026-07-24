/**
 * Unit system and length-unit presets for game profiles.
 */

/** Measurement system used by a game profile. */
export type UnitSystem = 'metric' | 'imperial';

/** Metric length units available under the Metric system. */
export type MetricUnit =
  | 'millimeter'
  | 'centimeter'
  | 'meter'
  | 'kilometer';

/** Imperial length units available under the Imperial system. */
export type ImperialUnit = 'inch' | 'foot' | 'yard' | 'mile';

/** Ordered metric unit options for dropdowns. */
export const METRIC_UNIT_OPTIONS: readonly MetricUnit[] = Object.freeze([
  'millimeter',
  'centimeter',
  'meter',
  'kilometer'
]);

/** Ordered imperial unit options for dropdowns. */
export const IMPERIAL_UNIT_OPTIONS: readonly ImperialUnit[] = Object.freeze([
  'inch',
  'foot',
  'yard',
  'mile'
]);

/** Human-readable labels for unit systems. */
export const UNIT_SYSTEM_LABELS: Readonly<Record<UnitSystem, string>> =
  Object.freeze({
    metric: 'Metric',
    imperial: 'Imperial'
  });

/** Human-readable labels for metric units. */
export const METRIC_UNIT_LABELS: Readonly<Record<MetricUnit, string>> =
  Object.freeze({
    millimeter: 'Millimeter',
    centimeter: 'Centimeter',
    meter: 'Meter',
    kilometer: 'Kilometer'
  });

/** Human-readable labels for imperial units. */
export const IMPERIAL_UNIT_LABELS: Readonly<Record<ImperialUnit, string>> =
  Object.freeze({
    inch: 'Inch',
    foot: 'Foot',
    yard: 'Yard',
    mile: 'Mile'
  });

/**
 * Returns the unit options for a measurement system.
 * @param system Unit system selection.
 * @returns Metric or imperial unit list.
 */
export function getUnitOptionsForSystem(
  system: UnitSystem
): readonly MetricUnit[] | readonly ImperialUnit[] {
  if (system === 'metric') {
    return METRIC_UNIT_OPTIONS;
  }
  return IMPERIAL_UNIT_OPTIONS;
}

/**
 * Returns the display label for a unit under the given system.
 * @param system Unit system selection.
 * @param unit Unit value within that system.
 * @returns Human-readable label.
 */
export function getUnitLabel(
  system: UnitSystem,
  unit: MetricUnit | ImperialUnit
): string {
  if (system === 'metric') {
    return METRIC_UNIT_LABELS[unit as MetricUnit] ?? String(unit);
  }
  return IMPERIAL_UNIT_LABELS[unit as ImperialUnit] ?? String(unit);
}
