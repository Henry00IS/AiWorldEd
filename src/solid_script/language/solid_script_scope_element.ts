import { solidScriptNameKey } from './solid_script_name_key.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import { SolidScriptElement, type SolidScriptValue } from './solid_script_value.js';

/** Element kinds that have a current-element name, such as $Face. */
const SOLID_SCRIPT_SCOPE_ELEMENT_KINDS = ['face', 'edge', 'vertex'] as const;

/**
 * Binds $Face, $Edge or $Vertex and $Index in a For Each or 🔁 scope, so a
 * nested scope's $Face is the innermost element.
 *
 * @param scope Scope of this round.
 * @param item Current item.
 * @param index Index from 0.
 */
export function solidScriptScopeElementBind(scope: SolidScriptScope, item: SolidScriptValue, index: number): void {
  if (!(item instanceof SolidScriptElement)) return;
  const kind = SOLID_SCRIPT_SCOPE_ELEMENT_KINDS.find((name) => name === item.kind);
  if (!kind) return;
  scope.variableDefine(solidScriptNameKey(`$${kind}`), item);
  scope.variableDefine(solidScriptNameKey('$Index'), index);
}
