import { solidScriptDocumentNormalize } from './solid_script_document.js';
import type { SolidScriptEvent, SolidScriptHandled } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptProgramHandle } from '@/solid_script/language/solid_script_program.js';
import {
  solidScriptPersistentInputsWithoutLegacy,
  solidScriptPersistentRecordApply,
  type SolidScriptPersistentRecord,
} from '@/solid_script/language/persistent/solid_script_persistent_record.js';

/** Input values and persistent values a handler leaves stored on the generator. */
export interface SolidScriptDocumentEventNext {
  /** Input values to store, without older persistent keys. */
  next: Record<string, string>;
  /** Persistent record to store. */
  persistent: SolidScriptPersistentRecord;
  /** What the handlers said. */
  handled: SolidScriptHandled;
}

/**
 * Handles an inspector or scene event of a script: writes the new value of a
 * changed input, runs its When Input Changes or When Button Pressed blocks and
 * keeps what they set, Persistent values too.
 *
 * @param script Stored script.
 * @param event Event that happened.
 * @param values Stored input values.
 * @param text New value of the changed input, or null for a button press.
 * @param persistent Stored persistent record already on the generator.
 * @returns Input values and persistent values to store, and what the handlers
 *   said.
 */
export function solidScriptDocumentEvent(
  script: unknown,
  event: SolidScriptEvent,
  values: Readonly<Record<string, string>>,
  text: string | null,
  persistent: Readonly<Record<string, unknown>> = {},
): SolidScriptDocumentEventNext {
  const typed = text === null ? { ...values } : { ...values, [event.name]: text };
  const handled = solidScriptProgramHandle(solidScriptDocumentNormalize(script), event, typed, persistent);
  const next: Record<string, string> = solidScriptPersistentInputsWithoutLegacy({ ...typed, ...handled.inputs });
  for (const key of handled.removed) delete next[key];
  return {
    next,
    persistent: solidScriptPersistentRecordApply(persistent, handled.persistent, handled.persistentRemoved),
    handled,
  };
}
