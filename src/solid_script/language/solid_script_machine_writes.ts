import { SolidScriptPaths } from './solid_script_paths.js';
import { solidScriptIntoName } from './solid_script_into.js';
import { SolidScriptBuiltFrames } from './solid_script_built_frames.js';
import { SolidScriptCopier } from './solid_script_object_copy.js';
import { solidScriptNameIsSystem, solidScriptNameKey } from './solid_script_name_key.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptMemberWriteParse, type SolidScriptMemberWrite } from './solid_script_name_rules.js';
import { SolidScriptMachineDataLists, solidScriptValueEmpty } from './solid_script_machine_data_lists.js';
import { solidScriptEachUsed } from './solid_script_each_uses.js';
import {
  solidScriptListItemParse,
  solidScriptListItemRemove,
  solidScriptListItemWrite,
} from './solid_script_list_item.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import { SolidScriptDictionary, type SolidScriptValue } from './solid_script_value.js';
import {
  SOLID_SCRIPT_LOCAL_PREFIX,
  SOLID_SCRIPT_NAME,
  SOLID_SCRIPT_NAMES_PLAIN,
  solidScriptLocalBare,
  solidScriptVectorComponent,
  solidScriptVectorComponentWrite,
  type SolidScriptSelectedKind,
  type SolidScriptVariableWhere,
} from './solid_script_machine_variables.js';

/** The $Selected lists a line may set, by kind. */
const SOLID_SCRIPT_SELECTED_LIST = /^\$selected\.(objects|faces|edges|vertices)$/;

/**
 * Every write of a running script to a variable goes through here: Set, Into
 * and the other fields that write a variable, the list lines, loop names and
 * Call results. Variables are dynamic: any write may give a variable a value of
 * another kind.
 */
export abstract class SolidScriptMachineWrites extends SolidScriptMachineDataLists {
  /** Paths of the run. */
  protected readonly paths = new SolidScriptPaths();

  /** The space each object was built in, read by Output and kept by a copy. */
  protected readonly builtFrames = new SolidScriptBuiltFrames();

  /** Makes the deep copies of Copy and Set with Copy on. */
  private readonly copier = new SolidScriptCopier({
    elements: this.elements,
    paths: this.paths,
    builtFrames: this.builtFrames,
  });

  /**
   * Makes a deep copy of a value for Copy and Set with Copy on.
   *
   * @param value Value to copy.
   * @param shown Name it was read from, for messages.
   * @returns The copy.
   */
  valueCopied(value: SolidScriptValue, shown: string): SolidScriptValue {
    return this.copier.value(value, shown);
  }

  /**
   * Sets a variable after checking its name and that lines may change it. A
   * list, Dictionary or any other value that is not a number or text is not
   * copied: the name becomes one more name for it.
   *
   * @param scope Scope of the line.
   * @param written Name.
   * @param given Value.
   */
  protected variableSet(scope: SolidScriptScope, written: string, given: SolidScriptValue): void {
    const value = given;
    const name = this.nameKey(written);
    if (SOLID_SCRIPT_NAMES_PLAIN.has(name)) {
      this.writableCheck(name, name);
      const home = scope.variableHas(name) ? scope : this.root;
      home.variableSet(name, value);
      return;
    }
    if (solidScriptNameIsSystem(name)) return this.variableSetSystem(scope, written, name, value);
    if (this.memberSet(scope, written, value)) return;
    const locals = name.startsWith(SOLID_SCRIPT_LOCAL_PREFIX) ? this.frameFunction()?.locals : undefined;
    const bare = locals ? solidScriptLocalBare(name) : '';
    if (locals && SOLID_SCRIPT_NAME.test(bare)) return locals.variableSet(bare, value);
    const where = this.variableWhere(name, scope);
    const component = solidScriptVectorComponent(where.name);
    if (component && !where.scope.variableHas(where.name)) return this.variableSetComponent(where, component, value);
    this.variableSetNamed(scope, where, value);
  }

  /**
   * Writes a Set value, evaluating a Vertex.Position formula once per corner
   * with $Vertex and $Index, from the geometry as it was before the line, and a
   * Data or FaceCorner.UV write through a list once per item with $Item and
   * $Index.
   *
   * @param scope Scope of the line.
   * @param written Name as written.
   * @param key Value field of the line.
   * @param run Line run, for the value.
   * @param copied Whether the name gets a deep copy of the value.
   */
  protected variableWrite(
    scope: SolidScriptScope,
    written: string,
    key: string,
    run: SolidScriptBlockRun,
    copied = false,
  ): void {
    const member = solidScriptMemberWriteParse(written);
    if (member && this.memberEach(scope, written, member, key, run, copied)) return;
    this.variableSet(scope, written, this.valueKept(run, key, run.valueItems(key), copied));
  }

  /**
   * Writes a member once per item when the value changes per item: a corner
   * Position always does, with $Vertex; Data and FaceCorner.UV do when the
   * value reads a per-item value, with $Item.
   *
   * @param scope Scope of the line.
   * @param written Name as written.
   * @param member The member write.
   * @param key Value field of the line.
   * @param run Line run, for the value.
   * @param copied Whether the member gets a deep copy of the value.
   * @returns True when the member was written.
   */
  private memberEach(
    scope: SolidScriptScope,
    written: string,
    member: SolidScriptMemberWrite,
    key: string,
    run: SolidScriptBlockRun,
    copied: boolean,
  ): boolean {
    const name = member.kind === 'position' ? '$Vertex' : '$Item';
    const perItem =
      member.kind === 'position' ||
      ((member.kind === 'data' || member.kind === 'uv') && solidScriptEachUsed(run.source(key)));
    if (!perItem) return false;
    return this.memberWrite(scope, written, (item, index, count) =>
      this.valueKept(run, key, run.valueWith(key, { [name]: item, $Index: index, $Count: count }), copied),
    );
  }

  /**
   * Gives the value a Set line keeps: the value itself, or with Copy on a deep
   * copy of it.
   *
   * @param run Line run, for the name the value was read from.
   * @param key Value field of the line.
   * @param value Value worked out.
   * @param copied Whether Copy is on.
   * @returns Value to keep.
   */
  private valueKept(run: SolidScriptBlockRun, key: string, value: SolidScriptValue, copied: boolean): SolidScriptValue {
    return copied ? this.valueCopied(value, solidScriptIntoName(run.source(key))) : value;
  }

  /**
   * Sets a name starting with $: a corner position, Mode, UVs or a value under
   * .Data reached through a system value, one of the $Selected lists or an item
   * of one. Anything else can only be read, which stops the line.
   *
   * @param scope Scope of the line.
   * @param written Name as written.
   * @param name Its key.
   * @param value Value.
   */
  private variableSetSystem(scope: SolidScriptScope, written: string, name: string, value: SolidScriptValue): void {
    if (this.memberSet(scope, written, value)) return;
    const item = solidScriptListItemParse(name);
    const kind = SOLID_SCRIPT_SELECTED_LIST.exec(item?.name ?? name)?.[1] as SolidScriptSelectedKind | undefined;
    if (!kind)
      throw new Error(
        `[${written}] is a built-in value and can only be read; through a system value you can set Vertex.Position, Face.UVs, FaceCorner.UV, Object.Mode and the values under .Data, such as [$Selected.Vertices.Positions(0)], and the $Selected lists`,
      );
    if (!item) {
      this.selected[kind] = Array.isArray(value) ? value : value === undefined ? [] : [value];
      return;
    }
    const list = this.selected[kind] ?? [];
    this.listEditCheck(list, item.name, value);
    const index = item.index === '' ? null : this.indexValue(item.index, scope);
    this.selected[kind] = solidScriptListItemWrite(item.name, list, index, value, this.nameShown);
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
    this.listEditCheck(vector, component.name);
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
    if (item) this.listEditCheck(home.variableGet(base), base, value);
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
   * kind it holds: a list becomes an empty list, a Dictionary one with no keys,
   * a number 0, a Yes/No No and anything else empty text; a name not set yet
   * becomes an empty list, ready for Add Item.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   */
  variableClearLine(scope: SolidScriptScope, name: string): void {
    if (this.dataClear(scope, name)) return;
    const where = this.variableWhere(name, scope);
    const old = where.scope.variableHas(where.name) ? where.scope.variableGet(where.name) : undefined;
    this.variableSet(scope, name, solidScriptValueEmpty(old));
  }

  /**
   * Changes a list variable in place for a list line, so every name for the
   * list sees the change. With create, a name not set yet starts as an empty
   * list.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   * @param change Changes the items.
   * @param create Whether a missing name becomes a list.
   */
  listChange(
    scope: SolidScriptScope,
    name: string,
    change: (items: SolidScriptValue[]) => void,
    create: boolean,
  ): void {
    if (this.dataListChange(scope, name, change, create)) return;
    const where = this.variableWhere(name, scope);
    if (create && !where.scope.variableHas(where.name)) {
      const made: SolidScriptValue[] = [];
      change(made);
      this.variableSet(scope, name, made);
      return;
    }
    const items = this.listRead(scope, name);
    if (!where.local) this.writableCheck(where.name);
    this.listEditCheck(items, where.name);
    change(items);
    if (where.persistent) this.persistentKeep(where.name);
  }

  /**
   * Changes a Dictionary variable in place for an Add Entry, Remove Entry or
   * Merge Dictionary line. With create, a name not set yet starts as an empty
   * Dictionary.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   * @param create Whether a missing name becomes a Dictionary.
   * @param change Changes the Dictionary; it checks before it changes, so a
   *   line that stops leaves the Dictionary as it was.
   */
  dictionaryChange(
    scope: SolidScriptScope,
    name: string,
    create: boolean,
    change: (dictionary: SolidScriptDictionary) => void,
  ): void {
    if (this.dataDictionaryChange(scope, name, create, change)) return;
    const where = this.variableWhere(name, scope);
    const made = create && !where.scope.variableHas(where.name);
    const dictionary = made ? new SolidScriptDictionary() : this.dictionaryRead(scope, name);
    if (!where.local) this.writableCheck(where.name);
    this.listEditCheck(dictionary, where.name);
    change(dictionary);
    if (made) this.variableSet(scope, name, dictionary);
    else if (where.persistent) this.persistentKeep(where.name);
  }

  /**
   * Takes one item out of a list for a Remove Item line, such as Points(2), or
   * the last one for Points().
   *
   * @param scope Scope of the line.
   * @param target Item as written.
   */
  variableItemRemove(scope: SolidScriptScope, target: string): void {
    if (this.dataItemRemove(scope, target)) return;
    const where = this.variableWhere(target, scope);
    const item = solidScriptListItemParse(where.name);
    if (!item) throw new Error(`"${target}" is not a list item; write list(2), or list() for the last item`);
    if (!where.local) this.writableCheck(item.name);
    if (!where.scope.variableHas(item.name))
      throw new Error(`there is no variable [${this.nameShown(item.name)}]; set it on a line above this one`);
    const index = item.index === '' ? null : this.indexValue(item.index, scope);
    this.listEditCheck(where.scope.variableGet(item.name), item.name);
    const left = solidScriptListItemRemove(item.name, where.scope.variableGet(item.name), index, this.nameShown);
    this.variableSet(scope, target.trim().replace(/\s*\(.*\)$/s, ''), left);
  }
}
