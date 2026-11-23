import { solidScriptDocumentNormalize } from './solid_script_document.js';
import type { SolidScriptEvent, SolidScriptHandled } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptProgramHandle } from '@/solid_script/language/solid_script_program.js';

/**
 * Handles an inspector or scene event of a script: writes the new value of a
 * changed input, runs its When Input Changes or When Button Pressed blocks and
 * keeps what they set, Persistent values too.
 *
 * @param script Stored script.
 * @param event Event that happened.
 * @param values Stored input values.
 * @param text New value of the changed input, or null for a button press.
 * @returns Input values to store, and what the handlers said.
 */
export function solidScriptDocumentEvent(
  script: unknown,
  event: SolidScriptEvent,
  values: Readonly<Record<string, string>>,
  text: string | null,
): { next: Record<string, string>; handled: SolidScriptHandled } {
  const typed = text === null ? { ...values } : { ...values, [event.name]: text };
  const handled = solidScriptProgramHandle(solidScriptDocumentNormalize(script), event, typed);
  const next: Record<string, string> = { ...typed, ...handled.inputs };
  for (const key of handled.removed) delete next[key];
  return { next, handled };
}
