/**
 * Names under which SolidScript generators store their script, kept apart from
 * the kind so history and sync code can read them without loading the kind.
 */

/** Kind id of the SolidScript generator. */
export const MODIFIER_STACK_SOLID_SCRIPT_KIND = 'solidScript';

/** Parameter key of the stored script. */
export const MODIFIER_STACK_SOLID_SCRIPT_KEY = 'script';

/** Parameter key of the values of the script's Input lines, as text by name. */
export const MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY = 'inputs';
