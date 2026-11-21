import { solidScriptFieldTokens } from './solid_script_field_tokens.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { solidScriptSystemFill } from './solid_script_system_names.js';

/**
 * Per-item values each field text mentions, by the text, so a field is scanned
 * once.
 */
const SOLID_SCRIPT_EACH_USES = new Map<string, ReadonlySet<string>>();

/** Most field texts kept before the kept scans are dropped. */
const SOLID_SCRIPT_EACH_USES_LIMIT = 4096;

/**
 * Lists the per-item values a field text mentions, such as $index for
 * [=[$Index] * 2] or $vertex for [$Vertex.Position.Y], each folded and once.
 * Words in quotes and plain text never count.
 *
 * @param text Field text.
 * @returns Folded official names.
 */
export function solidScriptEachUses(text: string): ReadonlySet<string> {
  const known = SOLID_SCRIPT_EACH_USES.get(text);
  if (known) return known;
  const uses = new Set<string>();
  if (text.includes('$'))
    for (const token of solidScriptFieldTokens(text)) {
      if (token.kind !== 'system') continue;
      const head = text.slice(token.from, token.to).split('.')[0] ?? '';
      const official = solidScriptSystemFill(head)?.name;
      if (official) uses.add(solidScriptNameKey(official));
    }
  if (SOLID_SCRIPT_EACH_USES.size >= SOLID_SCRIPT_EACH_USES_LIMIT) SOLID_SCRIPT_EACH_USES.clear();
  SOLID_SCRIPT_EACH_USES.set(text, uses);
  return uses;
}
