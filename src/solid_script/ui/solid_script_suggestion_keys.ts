import type { SolidScriptName } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptFlowKeysJoin } from '@/solid_script/document/solid_script_document_flow_state.js';
import { solidScriptSentenceTyped } from '@/solid_script/language/solid_script_sentence.js';
import type { SolidScriptSuggestion, SolidScriptSuggestionPick } from './solid_script_suggestions.js';

/** A Dictionary read whole or through its .Data, such as Prices or Box.Data. */
interface SolidScriptSuggestionDictionary {
  /** Variable whose keys are known, such as Prices or Box. */
  owner: string;
  /** True when the typed value is the .Data of the variable. */
  data: boolean;
}

/**
 * Tells whether a typed value is a Dictionary whose keys a script may know: a
 * variable holding one, such as Prices, or the .Data of a variable, such as
 * Prices.Data or Box.Data.
 *
 * @param base Typed value before the dot.
 * @param kindsOf Kinds a typed value may hold.
 * @returns The variable and how it is read, or null for any other value.
 */
function solidScriptSuggestionDictionaryOf(
  base: string,
  kindsOf: (name: string) => readonly string[],
): SolidScriptSuggestionDictionary | null {
  const data = /\.data$/i.test(base);
  const owner = data ? base.slice(0, -'.data'.length) : base;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(owner)) return null;
  const dictionary = kindsOf(base).includes('Dictionary') || (data && kindsOf(owner).includes('Dictionary'));
  return dictionary ? { owner, data } : null;
}

/**
 * Lists what follows the dot of a Dictionary: its .Data, then the keys the
 * script gave it where the line stands, such as Prices.Wood. A field naming a
 * path a Set writes takes keys only under .Data, such as Prices.Data.Wood.
 *
 * @param base Typed value before the dot.
 * @param kindsOf Kinds a typed value may hold.
 * @param names Names of the script where the line stands.
 * @param pick How the suggestions are written.
 * @returns Suggestions, or null when the value is no Dictionary.
 */
export function solidScriptSuggestionDictionary(
  base: string,
  kindsOf: (name: string) => readonly string[],
  names: readonly SolidScriptName[],
  pick: SolidScriptSuggestionPick,
): SolidScriptSuggestion[] | null {
  const dictionary = solidScriptSuggestionDictionaryOf(base, kindsOf);
  if (!dictionary) return null;
  const { owner, data } = dictionary;
  const known = names.filter((entry) => entry.name.toLowerCase() === owner.toLowerCase());
  const keys = known.reduce<string[]>((all, entry) => solidScriptFlowKeysJoin(all, entry.keys ?? []), []);
  const member = (name: string, detail: string): SolidScriptSuggestion => ({
    label: `${base}.${name}`,
    detail,
    category: 'Members',
    pick,
  });
  const values =
    data || pick !== 'word' ? keys.map((key) => member(key, `Value under the key ${key} of ${owner}.`)) : [];
  if (data) return values;
  return [member('Data', solidScriptSentenceTyped('Dictionary', `the .Data of ${base}, the same values`)), ...values];
}
