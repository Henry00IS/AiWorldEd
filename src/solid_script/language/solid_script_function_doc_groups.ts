import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
  type SolidScriptFunctionGroup,
} from '@/solid_script/language/solid_script_function_docs.js';

/**
 * Returns the groups a built-in function is listed in: its own group, both List
 * and Text when its first input takes a list as well as a text, such as Len or
 * Contains, so it is found under either, and Dictionary when it takes or checks
 * for a Dictionary, such as Contains or IsDictionary.
 *
 * @param key Function key, such as len.
 * @returns Its group first, then the others; empty for an unknown function.
 */
export function solidScriptFunctionGroups(key: string): readonly SolidScriptFunctionGroup[] {
  const doc = SOLID_SCRIPT_FUNCTION_DOCS[key];
  if (!doc) return [];
  const first = solidScriptFunctionArguments(key)[0]?.type;
  const takes = Array.isArray(first) ? first : [];
  const also: SolidScriptFunctionGroup[] = takes.includes('List') && takes.includes('Text') ? ['List', 'Text'] : [];
  if (takes.includes('Dictionary') || doc.checks?.includes('Dictionary')) also.push('Dictionary');
  return [doc.group, ...also.filter((group) => group !== doc.group)];
}
