import * as THREE from 'three';
import { curveDecode, curveEncode, curveFromData, curveToData } from '@/curve/model/curve_codec.js';
import { solidScriptCurveFromText } from '@/solid_script/language/solid_script_curve_read.js';
import type { ModifierStackKind } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierVolumeBevel, type ModifierBevelVolumeSettings } from '@/modifier/volume/modifier_volume_bevel.js';
import { MODIFIER_BEVEL_SETTINGS_FIELDS } from '@/modifier/volume/modifier_volume_bevel_fields.js';
import { MODIFIER_BEVEL_OPTION_FIELDS } from '@/modifier/volume/modifier_volume_bevel_option_fields.js';
import { modifierBevelOptionsNormalize } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { MODIFIER_STACK_KIND_BEVEL } from '@/modifier/volume/modifier_volume_record.js';

/** Validated parameters and notes about adjusted values. */
export interface ModifierParametersPatched {
  parameters: Record<string, unknown>;
  warnings: string[];
}

/**
 * Resolves an object reference (brush id or scene uuid) to the uuid object
 * fields store.
 */
export type ModifierObjectResolve = (reference: string) => string | null;

/**
 * Reads stored parameters under the keys modifier_parameters_set accepts: a
 * bevel reads through its settings carrier (ignored objects are the stack's
 * excludedIds), other kinds normalize.
 *
 * @param kind Modifier kind.
 * @param stored Stored parameters.
 * @returns Parameter values by key.
 */
export function modifierParametersRead(
  kind: ModifierStackKind,
  stored: Record<string, unknown>,
): Record<string, unknown> {
  const parameters = modifierCurvesShown(kind, kind.normalizeParameters(stored));
  if (kind.id !== MODIFIER_STACK_KIND_BEVEL) return parameters;
  const carrier = new THREE.Object3D();
  carrier.userData = { ...parameters };
  const { blacklist: _ignored, ...settings } = ModifierVolumeBevel.readSettings(carrier);
  return settings;
}

/**
 * Shows each curve parameter as curve data, the same shape curve_get returns,
 * instead of the encoded text the inspector stores.
 *
 * @param kind Modifier kind.
 * @param parameters Stored parameters.
 * @returns Parameters with curve data.
 */
export function modifierCurvesShown(
  kind: ModifierStackKind,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  const shown = { ...parameters };
  for (const field of kind.fields.filter((candidate) => candidate.type === 'curve')) {
    const text = shown[field.key];
    const curve = typeof text === 'string' && text.trim().startsWith('{') ? curveDecode(text) : null;
    if (curve) shown[field.key] = curveToData(curve);
  }
  return shown;
}

/**
 * Validates and applies a parameter patch the way the inspector would.
 *
 * @param kind Modifier kind.
 * @param current Current stored parameters.
 * @param patch Requested values by key.
 * @param resolve Object reference resolver.
 * @returns Normalized parameters and warnings.
 */
export function modifierParametersPatch(
  kind: ModifierStackKind,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  resolve: ModifierObjectResolve,
): ModifierParametersPatched {
  if (kind.id === MODIFIER_STACK_KIND_BEVEL) return modifierBevelParametersPatch(kind, current, patch);
  const fields = kind.fields.filter((field) => !field.hidden);
  const next = { ...current };
  const warnings: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const field = fields.find((candidate) => candidate.key === key);
    if (!field)
      throw new Error(
        `${kind.label} has no parameter "${key}". Parameters: ${fields.map((entry) => entry.key).join(', ')}`,
      );
    if (field.type === 'action') throw new Error(`${key} is a button, not a value; press it with modifier_action_run`);
    if (field.type === 'widget' && !field.acceptsText)
      throw new Error(`${key} stores nothing; ${field.hint ?? 'it is an inspector row'}`);
    next[key] = modifierFieldValueCheck(field, value, resolve, warnings);
  }
  return { parameters: kind.normalizeParameters(next), warnings };
}

/**
 * Checks one value against its field contract.
 *
 * @param field Field.
 * @param value Requested value.
 * @param resolve Object reference resolver.
 * @param warnings Receives clamping notes.
 * @returns Value to store.
 */
function modifierFieldValueCheck(
  field: ModifierStackField,
  value: unknown,
  resolve: ModifierObjectResolve,
  warnings: string[],
): unknown {
  if (field.type === 'number') return modifierNumberCheck(field.key, value, field, warnings);
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`${field.key} must be true or false`);
    return value;
  }
  if (field.type === 'choice') return modifierChoiceCheck(field.key, value, field.choices ?? []);
  if (field.type === 'curve') return modifierCurveCheck(field.key, value);
  if (typeof value !== 'string') throw new Error(`${field.key} must be a string`);
  if (field.type === 'object' && value !== '') {
    const uuid = resolve(value);
    if (!uuid) throw new Error(`${field.key}: no brush or CSG group ${value}`);
    return uuid;
  }
  return value;
}

/**
 * Checks and clamps a number.
 *
 * @param key Parameter key.
 * @param value Requested value.
 * @param limits Range and integer flag.
 * @param limits.min Inclusive minimum.
 * @param limits.max Inclusive maximum.
 * @param limits.integer True rounds to whole numbers.
 * @param warnings Receives clamping notes.
 * @returns Number to store.
 */
function modifierNumberCheck(
  key: string,
  value: unknown,
  limits: { min?: number | undefined; max?: number | undefined; integer?: boolean | undefined },
  warnings: string[],
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
  const rounded = limits.integer ? Math.round(value) : value;
  const clamped = Math.min(limits.max ?? Infinity, Math.max(limits.min ?? -Infinity, rounded));
  if (clamped !== value) warnings.push(`${key} adjusted from ${value} to ${clamped}`);
  return clamped;
}

/**
 * Checks a choice value.
 *
 * @param key Parameter key.
 * @param value Requested value.
 * @param choices Allowed choices.
 * @returns Value to store.
 */
function modifierChoiceCheck(key: string, value: unknown, choices: readonly { value: string }[]): string {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text === 'string' && choices.some((choice) => choice.value === text)) return text;
  throw new Error(`${key} must be one of: ${choices.map((choice) => choice.value).join(', ')}`);
}

/**
 * Accepts a curve as curve data like curve_get returns, or as Solid Script
 * curve text: a number, a preset name or points such as "[0, 1], [1, 0]".
 *
 * @param key Parameter key.
 * @param value Requested value.
 * @returns Encoded curve.
 */
function modifierCurveCheck(key: string, value: unknown): string {
  const curve =
    typeof value === 'string' || typeof value === 'number'
      ? solidScriptCurveFromText(String(value))
      : curveFromData(value);
  if (!curve)
    throw new Error(
      `${key} must be curve data like curve_get returns, a number, a preset name or points such as "[0, 1], [1, 0]"; the curve_* tools edit single points`,
    );
  return curveEncode(curve);
}

/**
 * Applies a bevel settings patch through the bevel settings codec. Keys are
 * settings names, options.<name>, or an options object.
 *
 * @param kind Bevel kind.
 * @param current Current stored parameters.
 * @param patch Requested values.
 * @returns Normalized parameters and warnings.
 */
function modifierBevelParametersPatch(
  kind: ModifierStackKind,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): ModifierParametersPatched {
  const carrier = new THREE.Object3D();
  carrier.userData = { ...current };
  const settings: ModifierBevelVolumeSettings = ModifierVolumeBevel.readSettings(carrier);
  const options: Record<string, unknown> = { ...modifierBevelOptionsNormalize(settings.options) };
  const warnings: string[] = [];
  for (const [key, value] of modifierBevelEntries(patch)) {
    if (key.startsWith('options.')) options[key.slice(8)] = modifierBevelOptionCheck(key, value);
    else (settings as unknown as Record<string, unknown>)[key] = modifierBevelSettingCheck(key, value, warnings);
  }
  ModifierVolumeBevel.writeSettings(carrier, { ...settings, options: modifierBevelOptionsNormalize(options) });
  return { parameters: kind.normalizeParameters(carrier.userData), warnings };
}

/**
 * Flattens an options object into options.<name> entries.
 *
 * @param patch Requested values.
 * @returns Key and value pairs.
 */
function modifierBevelEntries(patch: Record<string, unknown>): [string, unknown][] {
  return Object.entries(patch).flatMap(([key, value]): [string, unknown][] =>
    key === 'options' && value && typeof value === 'object'
      ? Object.entries(value).map(([name, entry]) => [`options.${name}`, entry])
      : [[key, value]],
  );
}

/**
 * Checks one main bevel setting.
 *
 * @param key Settings key.
 * @param value Requested value.
 * @param warnings Receives clamping notes.
 * @returns Value to store.
 */
function modifierBevelSettingCheck(key: string, value: unknown, warnings: string[]): unknown {
  const field = MODIFIER_BEVEL_SETTINGS_FIELDS.find((candidate) => candidate.key === key);
  const keys = [
    ...MODIFIER_BEVEL_SETTINGS_FIELDS.map((entry) => entry.key),
    ...MODIFIER_BEVEL_OPTION_FIELDS.map((entry) => `options.${entry.key}`),
  ];
  if (!field) throw new Error(`Bevel has no parameter "${key}". Parameters: ${keys.join(', ')}`);
  if (field.type === 'number') return modifierNumberCheck(key, value, field, warnings);
  if (field.type === 'choice') return modifierChoiceCheck(key, value, field.choices ?? []);
  if (typeof value !== 'string') throw new Error(`${key} must be a texture id string`);
  return value;
}

/**
 * Checks one contextual bevel option.
 *
 * @param key Options.<name> key.
 * @param value Requested value.
 * @returns Value to store.
 */
function modifierBevelOptionCheck(key: string, value: unknown): unknown {
  const field = MODIFIER_BEVEL_OPTION_FIELDS.find((candidate) => `options.${candidate.key}` === key);
  if (!field)
    throw new Error(
      `Bevel has no option "${key}". Options: ${MODIFIER_BEVEL_OPTION_FIELDS.map((entry) => entry.key).join(', ')}`,
    );
  const stored = (modifierBevelOptionsNormalize({}) as unknown as Record<string, unknown>)[field.key];
  if (typeof stored === 'boolean') {
    if (typeof value === 'boolean') return value;
    return modifierChoiceCheck(key, value, field.choices ?? []) === 'on';
  }
  if (field.choices && field.choices.length > 0) return modifierChoiceCheck(key, value, field.choices);
  if (typeof stored === 'number') return modifierNumberCheck(key, value, {}, []);
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  return value;
}
