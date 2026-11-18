import { solidScriptKindNamed } from './solid_script_kinds.js';
import { solidScriptFieldResolve } from './solid_script_field.js';
import {
  solidScriptListItemParse,
  solidScriptListItemRemove,
  solidScriptListItemWrite,
} from './solid_script_list_item.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import { SolidScriptElement, solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';
import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import {
  solidScriptFaceUvsFit,
  solidScriptMeshFaceUvsWrite,
  solidScriptSolidFaceUvsWrite,
  solidScriptUvsFromValue,
} from './solid_script_uvs.js';
import {
  SOLID_SCRIPT_LOCAL_PREFIX,
  SOLID_SCRIPT_NAME,
  SOLID_SCRIPT_NAMES_PLAIN,
  SOLID_SCRIPT_SYSTEM_PREFIX,
  SolidScriptMachineVariables,
  solidScriptLocalBare,
  solidScriptMemberParts,
  solidScriptVectorComponent,
  solidScriptVectorComponentWrite,
  type SolidScriptSelectedKind,
  type SolidScriptVariableWhere,
} from './solid_script_machine_variables.js';

/**
 * Every write of a running script to a variable goes through here: Set, Into
 * and the other fields that write a variable, the list lines, loop names and
 * Call results. Variables are dynamic: any write may give a variable a value of
 * another kind.
 */
export abstract class SolidScriptMachineWrites extends SolidScriptMachineVariables {
  /**
   * Returns what a solid or mesh became after later writes.
   *
   * @param leaf Solid or mesh.
   * @returns Latest version.
   */
  protected abstract leafLatest(leaf: SolidScriptGeometryLeaf): SolidScriptGeometryLeaf;

  /**
   * Replaces a solid or mesh with a later version.
   *
   * @param leaf Solid or mesh to replace.
   * @param by Replacement.
   */
  protected abstract leafRewrite(leaf: SolidScriptGeometryLeaf, by: SolidScriptGeometryLeaf): void;

  /**
   * Writes a user value under .Data, such as Face.Data.Height, to one element
   * or every element of a list.
   *
   * @param written Name as written.
   * @param scope Scope of the line.
   * @param value Value.
   * @returns True when the name was such a value.
   */
  protected dataSet(written: string, scope: SolidScriptScope, value: SolidScriptValue): boolean {
    const parts = solidScriptMemberParts(written);
    const at = parts.length - 2;
    if (at < 1 || parts[at]!.toLowerCase() !== 'data') return false;
    const owner = this.fieldVariable(solidScriptNameKey(parts.slice(0, at).join('.')), scope);
    const last = parts[parts.length - 1]!;
    const name = last.includes('[')
      ? solidScriptValueText(solidScriptFieldResolve('value', last, this.fieldContext(scope))).trim()
      : last;
    if (!SOLID_SCRIPT_NAME.test(name))
      throw new Error(`"${name}" cannot be a Data key; keys use letters, digits and _, not starting with a digit`);
    const items = Array.isArray(owner) ? owner : [owner];
    for (const item of items) {
      if (!(item instanceof SolidScriptElement))
        throw new Error(
          `only brushes, faces, edges and corners have .Data; ${parts.slice(0, at).join('.')} is ${solidScriptKindNamed(item)}`,
        );
      this.elements.dataWrite(
        item.kind === 'data' ? item : this.elements.data(item),
        solidScriptNameKey(name),
        name,
        value,
      );
    }
    return true;
  }

  /**
   * Writes Face.UVs, or the UVs of every face in a list, from a list of U and V
   * pairs, one per corner.
   *
   * @param written Name as written.
   * @param scope Scope of the line.
   * @param value Corner UVs.
   * @returns True when the name was Face.UVs or a list of faces' UVs.
   */
  protected uvsSet(written: string, scope: SolidScriptScope, value: SolidScriptValue): boolean {
    const parts = solidScriptMemberParts(written);
    const last = parts[parts.length - 1];
    if (parts.length < 2 || last?.toLowerCase() !== 'uvs') return false;
    const owner = this.fieldVariable(solidScriptNameKey(parts.slice(0, -1).join('.')), scope);
    const uvs = solidScriptUvsFromValue(value);
    const items = Array.isArray(owner) ? owner : [owner];
    for (const item of items) this.uvsSetFace(item, uvs, parts.slice(0, -1).join('.'));
    return true;
  }

  /**
   * Writes corner UVs onto one face value.
   *
   * @param item Face element.
   * @param uvs Corner UVs.
   * @param shown Owner name, for messages.
   */
  private uvsSetFace(item: SolidScriptValue, uvs: readonly [number, number][], shown: string): void {
    if (!(item instanceof SolidScriptElement) || item.kind !== 'face')
      throw new Error(`only faces have .UVs; ${shown} is ${solidScriptKindNamed(item)}`);
    const [face] = this.elements.faces(item);
    if (!face) throw new Error(`${String(item)} was cut away`);
    if (uvs.length !== face.corners.length)
      throw new Error(`Face.UVs needs ${face.corners.length} corners, not ${uvs.length}`);
    const latest = this.leafLatest(face.leaf);
    if (latest.kind === 'mesh') {
      this.leafRewrite(latest, solidScriptMeshFaceUvsWrite(latest, face.index, uvs));
      return;
    }
    if (latest.kind === 'solid')
      this.leafRewrite(latest, solidScriptSolidFaceUvsWrite(latest, [solidScriptFaceUvsFit(face, uvs)]));
  }

  /**
   * Sets a variable after checking its name and that lines may change it.
   *
   * @param scope Scope of the line.
   * @param name Name.
   * @param value Value.
   */
  protected variableSet(scope: SolidScriptScope, written: string, value: SolidScriptValue): void {
    const name = this.nameKey(written);
    if (SOLID_SCRIPT_NAMES_PLAIN.has(name)) {
      this.writableCheck(name, name);
      const home = scope.variableHas(name) ? scope : this.root;
      home.variableSet(name, value);
      return;
    }
    if (name.startsWith(SOLID_SCRIPT_SYSTEM_PREFIX)) return this.variableSetSelected(written, name, value);
    if (this.dataSet(written, scope, value)) return;
    if (this.uvsSet(written, scope, value)) return;
    const locals = name.startsWith(SOLID_SCRIPT_LOCAL_PREFIX) ? this.frameFunction()?.locals : undefined;
    const bare = locals ? solidScriptLocalBare(name) : '';
    if (locals && SOLID_SCRIPT_NAME.test(bare)) return locals.variableSet(bare, value);
    const where = this.variableWhere(name, scope);
    const component = solidScriptVectorComponent(where.name);
    if (component && !where.scope.variableHas(where.name)) return this.variableSetComponent(where, component, value);
    this.variableSetNamed(scope, where, value);
  }

  /**
   * Sets one of the [$Selected.*] lists, the only system values a line may set.
   *
   * @param written Name as written.
   * @param name Its key.
   * @param value Value.
   */
  private variableSetSelected(written: string, name: string, value: SolidScriptValue): void {
    const kind = /^\$selected\.(brushes|faces|edges|vertices)$/.exec(name)?.[1] as SolidScriptSelectedKind | undefined;
    if (!kind)
      throw new Error(`[${written}] is a system value and can only be read; only the $Selected lists can be set`);
    this.selected[kind] = Array.isArray(value) ? [...value] : value === undefined ? [] : [value];
  }

  /**
   * Sets one part of a vector variable, such as Pos.Y.
   *
   * @param where Where the name lives.
   * @param component Vector and part.
   * @param value Value of the part.
   */
  private variableSetComponent(
    where: SolidScriptVariableWhere,
    component: NonNullable<ReturnType<typeof solidScriptVectorComponent>>,
    value: SolidScriptValue,
  ): void {
    if (!where.scope.variableHas(component.name)) {
      const shown = this.nameShown(component.name);
      throw new Error(`there is no vector [${shown}] to change; set it first, such as Set ${shown} to 0, 0, 0`);
    }
    const vector = where.scope.variableGet(component.name);
    if (!where.local && !where.persistent) this.writableCheck(component.name);
    const changed = solidScriptVectorComponentWrite(component, vector, value);
    where.scope.variableSet(component.name, changed);
    if (where.persistent) this.persistentKeep(component.name);
  }

  /**
   * Sets a variable by its name, or one item of a list such as Points(2).
   *
   * @param scope Scope of the line.
   * @param where Where the name lives.
   * @param value Value.
   */
  private variableSetNamed(scope: SolidScriptScope, where: SolidScriptVariableWhere, value: SolidScriptValue): void {
    const item = solidScriptListItemParse(where.name);
    const base = item?.name ?? where.name;
    this.nameCheck(base, 'a variable');
    if (!where.local) this.writableCheck(base);
    const home = !where.local && !where.persistent && !scope.variableHas(base) ? this.root : where.scope;
    const index = item && item.index !== '' ? this.indexValue(item.index, scope) : null;
    const whole = item ? solidScriptListItemWrite(base, home.variableGet(base), index, value, this.nameShown) : value;
    home.variableSet(base, whole);
    if (where.persistent) this.persistentKeep(base);
  }

  /**
   * Forgets a variable for a Delete Variable line.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   */
  variableDeleteLine(scope: SolidScriptScope, name: string): void {
    const where = this.variableWhere(name, scope);
    this.nameCheck(where.name, 'a variable');
    if (!where.local) this.writableCheck(where.name);
    if (!where.scope.variableDelete(where.name))
      throw new Error(
        `there is no variable [${this.nameShown(solidScriptNameKey(name))}] to delete; set it on a line above this one`,
      );
    if (where.persistent) this.persistentKeep(where.name);
  }

  /**
   * Empties a variable for a Clear Variable line with the empty value of the
   * kind it holds: a list becomes an empty list, a number 0, a Yes/No No and
   * anything else empty text; a name not set yet becomes an empty list, ready
   * for Add Item.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   */
  variableClearLine(scope: SolidScriptScope, name: string): void {
    const where = this.variableWhere(name, scope);
    const old = where.scope.variableHas(where.name) ? where.scope.variableGet(where.name) : undefined;
    this.variableSet(scope, name, solidScriptValueEmpty(old));
  }

  /**
   * Takes one item out of a list for a Remove Item line, such as Points(2), or
   * the last one for Points().
   *
   * @param scope Scope of the line.
   * @param target Item as written.
   */
  variableItemRemove(scope: SolidScriptScope, target: string): void {
    const where = this.variableWhere(target, scope);
    const item = solidScriptListItemParse(where.name);
    if (!item) throw new Error(`"${target}" is not a list item; write list(2), or list() for the last item`);
    if (!where.local) this.writableCheck(item.name);
    if (!where.scope.variableHas(item.name))
      throw new Error(`there is no variable [${this.nameShown(item.name)}]; set it on a line above this one`);
    const index = item.index === '' ? null : this.indexValue(item.index, scope);
    const left = solidScriptListItemRemove(item.name, where.scope.variableGet(item.name), index, this.nameShown);
    this.variableSet(scope, target.trim().replace(/\s*\(.*\)$/s, ''), left);
  }
}

/**
 * Gives the empty value of the kind a value holds, for Clear Variable: an empty
 * list for a list or nothing, 0 for a number, No for a Yes/No and empty text
 * for anything else.
 *
 * @param old Value the variable holds, undefined when it is not set.
 * @returns Empty value.
 */
function solidScriptValueEmpty(old: SolidScriptValue): SolidScriptValue {
  if (old === undefined || Array.isArray(old)) return [];
  if (typeof old === 'number') return 0;
  return typeof old === 'boolean' ? false : '';
}
