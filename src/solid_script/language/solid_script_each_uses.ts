import { solidScriptFieldTokens } from './solid_script_field_tokens.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { solidScriptSystemFill } from './solid_script_system_names.js';
import { solidScriptWhereHelperFills, solidScriptWhereHelperNamed } from './solid_script_where_helpers.js';

/**
 * Per-item values each field text mentions, by the text, so a field is scanned
 * once.
 */
const SOLID_SCRIPT_EACH_USES = new Map<string, ReadonlySet<string>>();

/** Most field texts kept before the kept scans are dropped. */
const SOLID_SCRIPT_EACH_USES_LIMIT = 4096;

/**
 * Lists the per-item values a field text mentions, such as $index for
 * [=[$Index] * 2] or $vertex for [$Vertex.Position.Y], each folded and once. A
 * Where helper that leaves off an input a per-item field fills in counts too,
 * such as $index for [=Random(0, 1)]. Plain text never counts.
 *
 * @param text Field text.
 * @returns Folded official names.
 */
export function solidScriptEachUses(text: string): ReadonlySet<string> {
  const known = SOLID_SCRIPT_EACH_USES.get(text);
  if (known) return known;
  const uses = new Set<string>();
  if (text.includes('$') || text.includes('('))
    for (const token of solidScriptFieldTokens(text)) {
      if (token.kind === 'function') {
        const helper = solidScriptWhereHelperNamed(text.slice(token.from, token.to));
        if (!helper) continue;
        for (const fill of solidScriptWhereHelperFills(helper.key, solidScriptEachCallInputs(text, token.to)))
          if (fill.variable !== null) uses.add(fill.variable);
        continue;
      }
      if (token.kind !== 'system') continue;
      const head = text.slice(token.from, token.to).split('.')[0] ?? '';
      const official = solidScriptSystemFill(head)?.name;
      if (official) uses.add(solidScriptNameKey(official));
    }
  if (SOLID_SCRIPT_EACH_USES.size >= SOLID_SCRIPT_EACH_USES_LIMIT) SOLID_SCRIPT_EACH_USES.clear();
  SOLID_SCRIPT_EACH_USES.set(text, uses);
  return uses;
}

/**
 * Tells whether a field text reads a per-item value, so it is worked out per
 * item; [=[Height] * 2] is worked out once.
 *
 * @param text Field text.
 * @returns Yes when the text mentions a per-item value.
 */
export function solidScriptEachUsed(text: string): boolean {
  return solidScriptEachUses(text).size > 0;
}

/**
 * Counts the inputs of a call: the values between the parentheses after a
 * function name, split at the commas outside inner brackets and quotes.
 *
 * @param text Field text.
 * @param from Position right after the function name.
 * @returns How many inputs the call gives.
 */
function solidScriptEachCallInputs(text: string, from: number): number {
  let at = from;
  while (text[at] === ' ') at += 1;
  if (text[at] !== '(') return 0;
  let depth = 0;
  let inputs = 0;
  let quote = '';
  for (at += 1; at < text.length; at += 1) {
    const character = text[at]!;
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(' || character === '[') depth += 1;
    else if (character === ']' || (character === ')' && depth > 0)) depth -= 1;
    else if (character === ')') break;
    else if (character === ',' && depth === 0) inputs += 1;
  }
  const inside = text.slice(text.indexOf('(', from) + 1, at).trim();
  return inside === '' ? 0 : inputs + 1;
}
