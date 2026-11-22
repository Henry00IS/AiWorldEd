import { solidScriptNameKey } from './solid_script_name_key.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import type { SolidScriptElements } from './solid_script_elements.js';
import { solidScriptSystemFillShort } from './solid_script_system_fill_shorts.js';
import { SolidScriptElement, type SolidScriptValue } from './solid_script_value.js';

/** Element kinds that have a current-element name, such as $Face. */
const SOLID_SCRIPT_SCOPE_ELEMENT_KINDS = ['face', 'edge', 'vertex', 'facecorner'] as const;

/**
 * Binds $Face, $Edge, $Vertex or $FaceCorner, $Index and $Id in a For Each or
 * 🔁 scope, so a nested scope's $Face is the innermost element.
 *
 * @param scope Scope of this round.
 * @param item Current item.
 * @param index Index from 0.
 * @param elements Geometry values of the run, for $Id.
 */
export function solidScriptScopeElementBind(
  scope: SolidScriptScope,
  item: SolidScriptValue,
  index: number,
  elements: SolidScriptElements,
): void {
  if (!(item instanceof SolidScriptElement)) return;
  const kind = SOLID_SCRIPT_SCOPE_ELEMENT_KINDS.find((name) => name === item.kind);
  if (!kind) return;
  scope.variableDefine(solidScriptNameKey(`$${kind}`), item);
  scope.variableDefine(solidScriptNameKey('$Index'), index);
  solidScriptScopeIdBind(scope, elements);
}

/**
 * Binds $Id in a scope that holds a current item, from that item: its Id, or
 * its $Index when it has none.
 *
 * @param scope Scope of the current item.
 * @param elements Geometry values of the run.
 */
export function solidScriptScopeIdBind(scope: SolidScriptScope, elements: SolidScriptElements): void {
  const id = solidScriptSystemFillShort('$id', scope, elements);
  if (id !== undefined) scope.variableDefine(solidScriptNameKey('$Id'), id);
}
