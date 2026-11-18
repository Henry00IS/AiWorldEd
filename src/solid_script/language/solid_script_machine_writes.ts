import {
  SOLID_SCRIPT_TYPES,
  solidScriptTypeConvert,
  solidScriptTypeDefault,
  solidScriptTypeProblem,
} from './solid_script_types.js';
import { solidScriptFieldResolve } from './solid_script_field.js';
import {
  solidScriptListItemParse,
  solidScriptListItemRemove,
  solidScriptListItemWrite,
} from './solid_script_list_item.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import {
  SolidScriptElement,
  solidScriptValueText,
  solidScriptValueType,
  type SolidScriptValue,
} from './solid_script_value.js';
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
 * Call results. Each write is fitted to the Type declared for its variable, so
 * no line can give a typed variable a value of another kind.
 */
export abstract class SolidScriptMachineWrites extends SolidScriptMachineVariables {
  /** Kinds variables were declared as with a Set Type, by name key. */
  private readonly declared = new Map<string, string>();

  /**
   * Keeps the Type a Set line declares for its variable, or forgets it for Any;
   * an empty Type keeps the one declared before. The write that follows checks
   * the value against it.
   *
   * @param name Variable as written.
   * @param type Declared kind, empty for none.
   */
  typeKeep(name: string, type: string): void {
    if (type !== '' && !SOLID_SCRIPT_TYPES.includes(type))
      throw new Error(`Type must be one of ${SOLID_SCRIPT_TYPES.join(', ')}, not "${type}"`);
    const key = solidScriptNameKey(name.replace(/^\[(.*)\]$/s, '$1'));
    if (type === 'Any') this.declared.delete(key);
    else if (type !== '') this.declared.set(key, type);
  }

  /**
   * Fits a value written to a variable to the Type declared for it: turns it
   * into that kind where the meaning is plain and stops when it does not fit. A
   * variable without a Type takes any value as it is.
   *
   * @param key Name key of the variable, with its Local. or Persistent. start.
   * @param value Value written.
   * @returns Value to keep.
   */
  protected declaredFit(key: string, value: SolidScriptValue): SolidScriptValue {
    const type = this.declared.get(key);
    if (type === undefined) return value;
    const fitted = solidScriptTypeConvert(type, value);
    const problem = solidScriptTypeProblem(this.nameShown(key), type, fitted);
    if (problem) throw new Error(problem);
    return fitted;
  }

  /**
   * Gives the value Clear Variable leaves: the empty value of the declared
   * Type, else an empty list for a list and empty text for anything else.
   *
   * @param key Name key of the variable.
   * @param old Value it holds, undefined when it is not set.
   * @returns Empty value.
   */
  protected declaredEmpty(key: string, old: SolidScriptValue): SolidScriptValue {
    const type = this.declared.get(key);
    if (type !== undefined) return solidScriptTypeDefault(type);
    return old === undefined || Array.isArray(old) ? [] : '';
  }

  /**
   * Forgets the Type declared for a variable, as when it is deleted.
   *
   * @param key Name key of the variable.
   */
  protected declaredForget(key: string): void {
    this.declared.delete(key);
  }

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
          `only brushes, faces, edges and corners have .Data; ${parts.slice(0, at).join('.')} is ${solidScriptValueType(item)}`,
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
      home.variableSet(name, this.declaredFit(name, value));
      return;
    }
    if (name.startsWith(SOLID_SCRIPT_SYSTEM_PREFIX)) return this.variableSetSelected(written, name, value);
    if (this.dataSet(written, scope, value)) return;
    const locals = name.startsWith(SOLID_SCRIPT_LOCAL_PREFIX) ? this.frameFunction()?.locals : undefined;
    const bare = locals ? solidScriptLocalBare(name) : '';
    if (locals && SOLID_SCRIPT_NAME.test(bare)) return locals.variableSet(bare, this.declaredFit(name, value));
    const where = this.variableWhere(name, scope);
    const prefix = name.slice(0, name.length - where.name.length);
    const component = solidScriptVectorComponent(where.name);
    if (component && !where.scope.variableHas(where.name))
      return this.variableSetComponent(where, prefix, component, value);
    this.variableSetNamed(scope, where, prefix, value);
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
   * Sets one part of a vector variable, such as Pos.y.
   *
   * @param where Where the name lives.
   * @param prefix Local. or Persistent. start of the name, or empty.
   * @param component Vector and part.
   * @param value Value of the part.
   */
  private variableSetComponent(
    where: SolidScriptVariableWhere,
    prefix: string,
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
    where.scope.variableSet(component.name, this.declaredFit(prefix + component.name, changed));
    if (where.persistent) this.persistentKeep(component.name);
  }

  /**
   * Sets a variable by its name, or one item of a list such as Points(2).
   *
   * @param scope Scope of the line.
   * @param where Where the name lives.
   * @param prefix Local. or Persistent. start of the name, or empty.
   * @param value Value.
   */
  private variableSetNamed(
    scope: SolidScriptScope,
    where: SolidScriptVariableWhere,
    prefix: string,
    value: SolidScriptValue,
  ): void {
    const item = solidScriptListItemParse(where.name);
    const base = item?.name ?? where.name;
    this.nameCheck(base, 'a variable');
    if (!where.local) this.writableCheck(base);
    const home = !where.local && !where.persistent && !scope.variableHas(base) ? this.root : where.scope;
    const index = item && item.index !== '' ? this.indexValue(item.index, scope) : null;
    const whole = item ? solidScriptListItemWrite(base, home.variableGet(base), index, value, this.nameShown) : value;
    home.variableSet(base, this.declaredFit(prefix + base, whole));
    if (where.persistent) this.persistentKeep(base);
  }

  /**
   * Forgets a variable for a Delete Variable line, with the Type declared for
   * it.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   */
  variableDeleteLine(scope: SolidScriptScope, name: string): void {
    const where = this.variableWhere(name, scope);
    if (!where.local) this.writableCheck(where.name);
    if (!where.scope.variableDelete(where.name))
      throw new Error(
        `there is no variable [${this.nameShown(solidScriptNameKey(name))}] to delete; set it on a line above this one`,
      );
    this.declaredForget(solidScriptNameKey(name));
    if (where.persistent) this.persistentKeep(where.name);
  }

  /**
   * Empties a variable for a Clear Variable line; a name not set yet becomes an
   * empty list, ready for Add Item.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   */
  variableClearLine(scope: SolidScriptScope, name: string): void {
    const where = this.variableWhere(name, scope);
    const old = where.scope.variableHas(where.name) ? where.scope.variableGet(where.name) : undefined;
    this.variableSet(scope, name, this.declaredEmpty(solidScriptNameKey(name), old));
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
