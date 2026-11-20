import { solidScriptModeOf, type SolidScriptMode } from './solid_script_mode.js';
import { solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';

/**
 * Reads a Mode word a Set line writes onto a brush. Empty is not allowed;
 * inheritance only applies when the Mode field was left unset.
 *
 * @param value Value of the Set line.
 * @returns Mode.
 */
export function solidScriptModeWriteValue(value: SolidScriptValue): SolidScriptMode {
  const text = solidScriptValueText(value);
  const mode = solidScriptModeOf(text);
  if (mode) return mode;
  throw new Error(`Mode must be Additive, Subtractive or Intersecting, not "${text}"`);
}
