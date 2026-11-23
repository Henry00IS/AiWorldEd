import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
  type SolidScriptFunctionGroup,
} from '@/solid_script/language/solid_script_function_docs.js';

/**
 * Returns the groups a built-in function is listed in: its own group, and both
 * List and Text when its first input takes a list as well as a text, such as
 * Len or Contains, so it is found under either.
 *
 * @param key Function key, such as len.
 * @returns Its group first, then the others; empty for an unknown function.
 */
export function solidScriptFunctionGroups(key: string): readonly SolidScriptFunctionGroup[] {
  const doc = SOLID_SCRIPT_FUNCTION_DOCS[key];
  if (!doc) return [];
  const first = solidScriptFunctionArguments(key)[0]?.type;
  const takesBoth = Array.isArray(first) && first.includes('List') && first.includes('Text');
  if (!takesBoth) return [doc.group];
  const both: readonly SolidScriptFunctionGroup[] = ['List', 'Text'];
  return [doc.group, ...both.filter((group) => group !== doc.group)];
}
