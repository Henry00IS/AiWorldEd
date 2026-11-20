import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import type { SolidScriptValue } from './solid_script_value.js';

/**
 * Reads an optional field of a running line once: an empty field, or one whose
 * value is blank text, gives undefined.
 *
 * @param run Running line.
 * @param key Field key.
 * @returns Value of the field, or undefined when it gives nothing.
 */
export function solidScriptRunValueOptional(run: SolidScriptBlockRun, key: string): SolidScriptValue {
  if (run.source(key).trim() === '') return undefined;
  const value = run.value(key);
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}
