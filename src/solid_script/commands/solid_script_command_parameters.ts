import type { SolidScriptCommandParameter, SolidScriptCommandParameterType } from './solid_script_command.js';

/**
 * Describes one command parameter.
 *
 * @param key Argument name and stored key.
 * @param label Visible caption.
 * @param type Configurator editor.
 * @param fallback Value of new lines, as code text.
 * @param hint Hover text.
 * @returns Parameter.
 */
export function solidScriptParameter(
  key: string,
  label: string,
  type: SolidScriptCommandParameterType,
  fallback: string,
  hint: string,
): SolidScriptCommandParameter {
  return { key, label, type, default: fallback, hint };
}

/**
 * Describes the Center switch shared by shapes that can sit on their corner or
 * around the origin.
 *
 * @returns Parameter.
 */
export function solidScriptParameterCenter(): SolidScriptCommandParameter {
  return solidScriptParameter(
    'center',
    'Center',
    'boolean',
    'false',
    'On: the shape is centred on the origin. Off: it starts at the origin and grows along the positive axes.',
  );
}
