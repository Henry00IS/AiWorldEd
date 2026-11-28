import type { SolidScriptScope } from '@/solid_script/language/solid_script_scope.js';
import { solidScriptPersistentValueEncode } from './solid_script_persistent_codec.js';

/**
 * Writes the persistent values of a scope as they are now, by folded name, as
 * stored text.
 *
 * @param persistent Scope of the persistent values.
 * @param into Map that gets the stored text of each value.
 */
export function solidScriptPersistentSnapshotTake(persistent: SolidScriptScope, into: Map<string, string>): void {
  for (const [name, value] of persistent.variablesVisible())
    into.set(name, JSON.stringify(solidScriptPersistentValueEncode(value) ?? null));
}

/**
 * Lists the persistent values that differ from a snapshot, such as a list that
 * grew in place through another name.
 *
 * @param persistent Scope of the persistent values.
 * @param started Stored text of each value when the snapshot was taken.
 * @returns Folded names of the values that changed.
 */
export function solidScriptPersistentSnapshotChanged(
  persistent: SolidScriptScope,
  started: ReadonlyMap<string, string>,
): string[] {
  const changed: string[] = [];
  for (const [name, value] of persistent.variablesVisible())
    if (JSON.stringify(solidScriptPersistentValueEncode(value) ?? null) !== started.get(name)) changed.push(name);
  return changed;
}
