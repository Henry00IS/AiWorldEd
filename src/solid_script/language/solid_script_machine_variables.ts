import { SOLID_SCRIPT_SYSTEM_GLOBALS, type SolidScriptSystemReader } from './solid_script_system.js';
import type { SolidScriptExpression } from './solid_script_ast.js';
import { SolidScriptExpressionEvaluator } from './solid_script_expression_evaluator.js';
import { solidScriptExpressionParse } from './solid_script_expression_parse.js';
import type { SolidScriptCompiled } from './solid_script_expression_compile.js';
import { solidScriptFieldResolve, type SolidScriptFieldContext } from './solid_script_field.js';
import { SolidScriptFieldReader, type SolidScriptFieldHost } from './solid_script_field_reader.js';
import {
  solidScriptListItemParse,
  solidScriptListItemRead,
  solidScriptListItemWrite,
} from './solid_script_list_item.js';
import type { SolidScriptBlockNode } from './solid_script_block_tree.js';
import type { SolidScriptFrame, SolidScriptMachineCommand, SolidScriptVariable } from './solid_script_machine_types.js';
import { solidScriptNameFind, solidScriptNameKey, solidScriptNameSpelling } from './solid_script_name_key.js';
import { SolidScriptScope } from './solid_script_scope.js';
import { solidScriptValueText, solidScriptValueType, type SolidScriptValue } from './solid_script_value.js';

/** Pattern of a variable or part name. */
export const SOLID_SCRIPT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Prefix of a variable that belongs to the Function it is used in. */
export const SOLID_SCRIPT_LOCAL_PREFIX = 'local.';

/**
 * Start of a variable kept with the generator between runs, such as
 * [persistent.presses]. Its value is stored, saved and shared like an input
 * that has no row in the inspector.
 */
export const SOLID_SCRIPT_PERSISTENT_PREFIX = 'persistent.';

/**
 * Reads the persistent values stored among a generator's input values.
 *
 * @param inputs Stored input values by name.
 * @returns Persistent values by bare name.
 */
export function solidScriptPersistentRead(inputs: Readonly<Record<string, string>>): Map<string, SolidScriptValue> {
  const values = new Map<string, SolidScriptValue>();
  for (const [key, text] of Object.entries(inputs)) {
    if (!key.startsWith(SOLID_SCRIPT_PERSISTENT_PREFIX)) continue;
    let value: SolidScriptValue = text;
    try {
      value = JSON.parse(text) as SolidScriptValue;
    } catch {
      value = text;
    }
    values.set(key.slice(SOLID_SCRIPT_PERSISTENT_PREFIX.length), value);
  }
  return values;
}

/** Most list items the variable explorer lists under one list. */
export const SOLID_SCRIPT_VARIABLE_ITEMS_MAX = 256;

/**
 * Describes a variable for the debugger and the variable explorer: its value as
 * text, its friendly type and, for a list, its items by number.
 *
 * @param name Name.
 * @param value Value.
 * @returns View.
 */
export function solidScriptVariableView(name: string, value: SolidScriptValue): SolidScriptVariable {
  const items = Array.isArray(value)
    ? value
        .slice(0, SOLID_SCRIPT_VARIABLE_ITEMS_MAX)
        .map((item, index) => solidScriptVariableView(`${name}(${index})`, item))
    : [];
  return { name, value: solidScriptValueText(value), type: solidScriptValueType(value), items };
}

/** One part of a vector variable, such as pos.x. */
interface SolidScriptVectorPart {
  /** Vector variable. */
  name: string;
  /** Part letter. */
  axis: 'x' | 'y' | 'z';
  /** Position in the vector. */
  index: number;
}

/**
 * Reads a name such as pos.x as a part of the vector pos.
 *
 * @param name Variable name.
 * @returns Part, or null for other names.
 */
function solidScriptVectorComponent(name: string): SolidScriptVectorPart | null {
  const known = SOLID_SCRIPT_VECTOR_PARTS.get(name);
  if (known !== undefined) return known;
  const part = solidScriptVectorComponentParse(name);
  if (SOLID_SCRIPT_VECTOR_PARTS.size >= 20000) SOLID_SCRIPT_VECTOR_PARTS.clear();
  SOLID_SCRIPT_VECTOR_PARTS.set(name, part);
  return part;
}

/** First names of the built-in values, such as Time. */
const SOLID_SCRIPT_SYSTEM_GROUPS: ReadonlySet<string> = new Set(
  SOLID_SCRIPT_SYSTEM_GLOBALS.map((entry) => solidScriptNameKey(entry.name.slice(0, entry.name.indexOf('.')))),
);

/** Spellings of the built-in values every script can read, by key. */
const SOLID_SCRIPT_SYSTEM_NAMES: ReadonlyMap<string, string> = new Map(
  SOLID_SCRIPT_SYSTEM_GLOBALS.map((entry) => [solidScriptNameKey(entry.name), entry.name]),
);

/**
 * Names already checked to be plain names, so setting them again skips the
 * checks.
 */
const SOLID_SCRIPT_NAMES_PLAIN = new Set<string>();

/** Vector parts by name, read once. */
const SOLID_SCRIPT_VECTOR_PARTS = new Map<string, SolidScriptVectorPart | null>();

/**
 * Reads a name such as pos.x without the cache.
 *
 * @param name Variable name.
 * @returns Part, or null for other names.
 */
function solidScriptVectorComponentParse(name: string): SolidScriptVectorPart | null {
  const match = /^(.+)\.([xyzXYZ])$/.exec(name);
  if (!match) return null;
  const axis = match[2]!.toLowerCase() as 'x' | 'y' | 'z';
  return { name: match[1]!, axis, index: 'xyz'.indexOf(axis) };
}

/**
 * Reads one part of a vector.
 *
 * @param part Part.
 * @param vector Vector value.
 * @returns Number.
 */
function solidScriptVectorComponentRead(part: SolidScriptVectorPart, vector: SolidScriptValue): SolidScriptValue {
  if (!Array.isArray(vector) || vector[part.index] === undefined)
    throw new Error(`[${part.name}] is ${solidScriptValueType(vector)}, not a vector with a .${part.axis}`);
  return vector[part.index];
}

/**
 * Changes one part of a vector, keeping the others.
 *
 * @param part Part.
 * @param vector Vector value.
 * @param value New number.
 * @returns New vector.
 */
function solidScriptVectorComponentWrite(
  part: SolidScriptVectorPart,
  vector: SolidScriptValue,
  value: SolidScriptValue,
): SolidScriptValue {
  if (!Array.isArray(vector) || vector.length < 2 || vector.length > 3 || part.index >= vector.length)
    throw new Error(`[${part.name}] is ${solidScriptValueType(vector)}, not a vector with a .${part.axis}`);
  const changed = [...vector];
  changed[part.index] = value;
  return changed;
}

/** Names without their local. start, by full name, so reads do not cut text. */
const SOLID_SCRIPT_LOCAL_BARE = new Map<string, string>();

/** Most names kept in SOLID_SCRIPT_LOCAL_BARE before it starts over. */
const SOLID_SCRIPT_LOCAL_BARE_MAX = 4096;

/**
 * Returns a local name without its local. start.
 *
 * @param name Name starting with local.
 * @returns Bare name.
 */
function solidScriptLocalBare(name: string): string {
  let bare = SOLID_SCRIPT_LOCAL_BARE.get(name);
  if (bare === undefined) {
    bare = name.slice(SOLID_SCRIPT_LOCAL_PREFIX.length);
    // Names built while running, such as local.p[i], could fill it up.
    if (SOLID_SCRIPT_LOCAL_BARE.size >= SOLID_SCRIPT_LOCAL_BARE_MAX) SOLID_SCRIPT_LOCAL_BARE.clear();
    SOLID_SCRIPT_LOCAL_BARE.set(name, bare);
  }
  return bare;
}

/**
 * What a script machine knows about names: its variables, inputs and persistent
 * values, the Functions running, and how field text reads them. The machine
 * that runs lines builds on it.
 */
export abstract class SolidScriptMachineVariables implements SolidScriptFieldHost {
  protected readonly expressions = new SolidScriptExpressionEvaluator(
    () => this.workTake(),
    (name, values) => this.functionCall(name, values),
    (name) => this.systemRead(name),
    (key) => this.nameShown(key),
  );
  protected readonly readOnly = new Map<string, string>();
  /** First spelling of every name by its key, for the variable explorer. */
  protected readonly spellings = new Map<string, string>();
  /** Top-level lines of the script running, whose texts spell its names. */
  protected scriptLines: readonly SolidScriptBlockNode<SolidScriptMachineCommand>[] = [];
  /**
   * Spells a name key for a message or the debugger: as the run stored it, else
   * as the script first wrote it.
   */
  protected readonly nameShown = (key: string): string =>
    solidScriptNameSpelling(
      key,
      (found) => this.spellings.get(found) ?? solidScriptNameFind(found, this.scriptTexts()),
    );
  /** Keys by name as written, for the names this run has seen. */
  protected readonly keys = new Map<string, string>();
  /** Functions and parts running inside each other, innermost last. */
  protected readonly stack: SolidScriptFrame[] = [];
  /** True while an inspector event runs its handlers. */
  protected handling = false;
  protected readonly inputsChanged: Record<string, string> = {};
  /** Stored persistent names the handlers deleted. */
  protected readonly inputsRemoved = new Set<string>();
  /** Variables kept with the generator between runs, by bare name. */
  protected readonly persistent = new SolidScriptScope(null);
  protected root = new SolidScriptScope(null);

  /**
   * Creates the variables of a run.
   *
   * @param inputs Inspector values of the script's Input lines, by name.
   * @param system Built-in values.
   */
  constructor(
    protected readonly inputs: Readonly<Record<string, string>>,
    protected readonly system: SolidScriptSystemReader,
  ) {}

  /** Counts one step of work and stops a run that never ends. */
  protected abstract workTake(): void;

  /**
   * Works out a Function used in a formula.
   *
   * @param name Function name.
   * @param values Values passed.
   * @returns Result, or null when no such function is defined.
   */
  protected abstract functionCall(
    name: string,
    values: readonly SolidScriptValue[],
  ): { value: SolidScriptValue } | null;

  /**
   * Returns the innermost Function running.
   *
   * @returns Frame, or undefined outside every Function.
   */
  protected frameFunction(): SolidScriptFrame | undefined {
    for (let index = this.stack.length - 1; index >= 0; index--)
      if (this.stack[index]?.kind === 'function') return this.stack[index];
    return undefined;
  }

  /**
   * Finds where a variable name lives: [local.x] in the innermost Function's
   * own variables, any other name in the scopes of the running line.
   *
   * @param name Name as written.
   * @param scope Scope of the running line.
   * @returns Scope and the name without the prefix.
   */
  protected variableWhere(
    written: string,
    scope: SolidScriptScope,
  ): { scope: SolidScriptScope; name: string; local: boolean; persistent: boolean } {
    const name = solidScriptNameKey(written);
    if (name.startsWith(SOLID_SCRIPT_PERSISTENT_PREFIX))
      return {
        scope: this.persistent,
        name: name.slice(SOLID_SCRIPT_PERSISTENT_PREFIX.length),
        local: false,
        persistent: true,
      };
    if (!name.startsWith(SOLID_SCRIPT_LOCAL_PREFIX)) return { scope, name, local: false, persistent: false };
    const bare = solidScriptLocalBare(name);
    const frame = this.frameFunction();
    if (!frame?.locals)
      throw new Error(
        `[${this.nameShown(name)}] is a local variable, and Local. only works inside a Function; outside one, write [${this.nameShown(name).slice(SOLID_SCRIPT_LOCAL_PREFIX.length)}]`,
      );
    return { scope: frame.locals, name: bare, local: true, persistent: false };
  }

  /**
   * Lists the field texts of the script running, line by line.
   *
   * @param lines Lines to read.
   * @yields Field texts.
   */
  private *scriptTexts(lines = this.scriptLines): Generator<string> {
    for (const node of lines) {
      yield* Object.values(node.values);
      yield* this.scriptTexts(node.children);
      if (node.otherwise) yield* this.scriptTexts(node.otherwise);
    }
  }

  /**
   * Gives field text access to the variables of a scope and to formulas.
   *
   * @param scope Scope.
   * @returns Context.
   */
  protected fieldContext(scope: SolidScriptScope): SolidScriptFieldContext {
    return (scope.fieldContext ??= new SolidScriptFieldReader(this, scope));
  }

  /**
   * Reads any variable name as written in brackets, such as width, local.n,
   * pos.x, points(2) or Box.Width; throws when there is none.
   *
   * @param name Name as written.
   * @param scope Scope of the running line.
   * @returns Value.
   */
  fieldVariable(name: string, scope: SolidScriptScope): SolidScriptValue {
    // Plain names, the most common read, take one walk out.
    if (!name.includes('.') && !name.includes('(')) {
      const found = scope.variableGet(name);
      if (found !== undefined) return found;
    } else if (name.startsWith(SOLID_SCRIPT_LOCAL_PREFIX)) {
      // A Function's own input or variable, the common read inside one.
      const found = this.fieldLocal(solidScriptLocalBare(name));
      if (found !== undefined) return found;
    } else {
      const builtIn = this.systemRead(name);
      if (builtIn !== undefined) return builtIn;
    }
    return this.fieldVariableWhere(name, scope);
  }

  /**
   * Reads a variable name as written from where it lives: a list item, a vector
   * part or a whole variable; throws when there is none.
   *
   * @param name Name as written.
   * @param scope Scope of the running line.
   * @returns Value.
   */
  protected fieldVariableWhere(name: string, scope: SolidScriptScope): SolidScriptValue {
    const where = this.variableWhere(name, scope);
    const item = solidScriptListItemParse(where.name);
    const base = item?.name ?? where.name;
    if (!item && !where.scope.variableHas(base)) {
      const component = solidScriptVectorComponent(base);
      if (component && where.scope.variableHas(component.name))
        return solidScriptVectorComponentRead(component, where.scope.variableGet(component.name));
    }
    if (!where.scope.variableHas(base)) {
      if (where.persistent && !item) return undefined;
      const written = this.nameShown(where.local ? `${SOLID_SCRIPT_LOCAL_PREFIX}${base}` : base);
      throw new Error(
        where.local
          ? `there is no local variable [${written}]; it is an input of the Function or set with Set ${written}`
          : `there is no variable [${written}]; set it on a line above this one`,
      );
    }
    if (!item) return where.scope.variableGet(base);
    const index = item.index === '' ? null : this.indexValue(item.index, scope);
    return solidScriptListItemRead(base, where.scope.variableGet(base), index, item.method, this.nameShown);
  }

  /**
   * Reads a variable of the innermost Function running.
   *
   * @param bare Name after local.
   * @returns Value, or undefined outside a Function or when it has none.
   */
  fieldLocal(bare: string): SolidScriptValue {
    return this.frameFunction()?.locals?.variableOwn(bare);
  }

  /**
   * Returns whether a first name starts built-in values, such as Box.
   *
   * @param name First name.
   * @returns True for a built-in group.
   */
  fieldSystemGroup(name: string): boolean {
    return SOLID_SCRIPT_SYSTEM_GROUPS.has(name);
  }

  /**
   * Computes formula text.
   *
   * @param text Formula text.
   * @param scope Scope of the running line.
   * @returns Value.
   */
  fieldFormula(text: string, scope: SolidScriptScope): SolidScriptValue {
    let expression: SolidScriptExpression;
    try {
      expression = solidScriptExpressionParse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`the formula "${text}" cannot be read: ${message}`);
    }
    return this.expressions.evaluate(expression, scope);
  }

  /**
   * Parses formula text.
   *
   * @param text Formula text.
   * @returns Parsed formula, or null when it cannot be read.
   */
  fieldFormulaParse(text: string): SolidScriptExpression | null {
    try {
      return solidScriptExpressionParse(text);
    } catch {
      return null;
    }
  }

  /**
   * Computes a compiled formula.
   *
   * @param formula Compiled formula.
   * @param scope Scope of the running line.
   * @returns Value.
   */
  fieldFormulaRun(formula: SolidScriptCompiled, scope: SolidScriptScope): SolidScriptValue {
    return this.expressions.evaluateCompiled(formula, scope);
  }

  /**
   * Notes a changed persistent value so the inspector stores it. Only When
   * Button Pressed and When Input Changes blocks store values; the normal build
   * may change them for its own run, so every rebuild gives the same shape.
   *
   * @param name Bare name.
   */
  protected persistentKeep(name: string): void {
    if (!this.handling) return;
    const key = `${SOLID_SCRIPT_PERSISTENT_PREFIX}${name}`;
    if (!this.persistent.variableHas(name)) {
      delete this.inputsChanged[key];
      this.inputsRemoved.add(key);
      return;
    }
    this.inputsRemoved.delete(key);
    this.inputsChanged[key] = JSON.stringify(this.persistent.variableGet(name));
  }

  /**
   * Reads a list variable.
   *
   * @param scope Scope of the line.
   * @param name Name.
   * @returns Items.
   */
  protected listRead(scope: SolidScriptScope, name: string): readonly SolidScriptValue[] {
    const where = this.variableWhere(name, scope);
    if (!where.scope.variableHas(where.name)) {
      const shown = this.nameShown(solidScriptNameKey(name));
      throw new Error(`there is no list [${shown}]; make one with Add Item or Set ${shown}()`);
    }
    const value = where.scope.variableGet(where.name);
    if (!Array.isArray(value))
      throw new Error(`[${this.nameShown(solidScriptNameKey(name))}] is ${solidScriptValueType(value)}, not a list`);
    return value;
  }

  /**
   * Reads a built-in value such as Time.Year, or a part of one such as
   * Box.Size.x.
   *
   * @param name Name as written.
   * @returns Value, or undefined when the name is not a built-in value.
   */
  protected systemRead(name: string): SolidScriptValue {
    const dot = name.indexOf('.');
    if (dot < 0 || !SOLID_SCRIPT_SYSTEM_GROUPS.has(name.slice(0, dot))) return undefined;
    const value = this.system.get(name);
    if (value !== undefined) return value;
    const part = solidScriptVectorComponent(name);
    const whole = part ? this.system.get(part.name) : undefined;
    if (part && whole !== undefined) return solidScriptVectorComponentRead(part, whole);
    const base = part && SOLID_SCRIPT_SYSTEM_NAMES.has(part.name) ? part.name : name;
    if (SOLID_SCRIPT_SYSTEM_NAMES.has(base)) return this.systemMissing(SOLID_SCRIPT_SYSTEM_NAMES.get(base) ?? base);
    return undefined;
  }

  /**
   * Stands in for a built-in value this run does not have, such as a Box value
   * outside a generator, and warns on the line reading it.
   *
   * @param name Value name as taught, such as Box.Width.
   * @returns Stand-in value.
   */
  protected abstract systemMissing(name: string): SolidScriptValue;

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
    const locals = name.startsWith(SOLID_SCRIPT_LOCAL_PREFIX) ? this.frameFunction()?.locals : undefined;
    const bare = locals ? solidScriptLocalBare(name) : '';
    if (locals && SOLID_SCRIPT_NAME.test(bare)) {
      locals.variableSet(bare, value);
      return;
    }
    const where = this.variableWhere(name, scope);
    const component = solidScriptVectorComponent(where.name);
    if (component && !where.scope.variableHas(where.name)) {
      if (!where.scope.variableHas(component.name)) {
        const shown = this.nameShown(component.name);
        throw new Error(`there is no vector [${shown}] to change; set it first, such as Set ${shown} to 0, 0, 0`);
      }
      const vector = where.scope.variableGet(component.name);
      if (!where.local && !where.persistent) this.writableCheck(component.name);
      where.scope.variableSet(component.name, solidScriptVectorComponentWrite(component, vector, value));
      if (where.persistent) this.persistentKeep(component.name);
      return;
    }
    const item = solidScriptListItemParse(where.name);
    if (item?.method) throw new Error(`${item.name}().${item.method} can only be read`);
    const base = item?.name ?? where.name;
    this.nameCheck(base, 'a variable');
    if (!where.local) this.writableCheck(base);
    // A plain name not set yet is the script's: it lives on after the block that set it.
    const home = !where.local && !where.persistent && !scope.variableHas(base) ? this.root : where.scope;
    if (!item) home.variableSet(base, value);
    else {
      const index = item.index === '' ? null : this.indexValue(item.index, scope);
      home.variableSet(base, solidScriptListItemWrite(base, home.variableGet(base), index, value, this.nameShown));
    }
    if (where.persistent) this.persistentKeep(base);
  }

  /**
   * Reads the item number of a list reference, which may use variables and
   * formulas such as points([i]).
   *
   * @param text Index text.
   * @param scope Scope.
   * @returns Index value.
   */
  protected indexValue(text: string, scope: SolidScriptScope): SolidScriptValue {
    return solidScriptFieldResolve('number', text, this.fieldContext(scope));
  }

  /** Inspector values by name key, made on first use. */
  protected inputsKeyed: Map<string, string> | null = null;

  /**
   * Returns the inspector values by name key, so an input finds its value
   * whatever case the inspector stored it under.
   *
   * @returns Values by key.
   */
  protected inputKeyed(): Map<string, string> {
    return (this.inputsKeyed ??= new Map(
      Object.entries(this.inputs).map(([name, value]) => [solidScriptNameKey(name), value]),
    ));
  }

  /**
   * Returns the key of a name and keeps its first spelling for display.
   *
   * @param name Name as written.
   * @returns Key.
   */
  protected nameKey(name: string): string {
    let key = this.keys.get(name);
    if (key === undefined) {
      key = solidScriptNameKey(name);
      if (!this.spellings.has(key)) this.spellings.set(key, name);
      this.keys.set(name, key);
    }
    return key;
  }

  /**
   * Fails on a name that cannot be used for a variable or counter.
   *
   * @param name Name.
   * @param what What it names, for the message.
   */
  protected nameCheck(name: string, what: string): void {
    if (SOLID_SCRIPT_NAMES_PLAIN.has(name)) return;
    if (!SOLID_SCRIPT_NAME.test(name))
      throw new Error(
        `"${this.nameShown(solidScriptNameKey(name))}" cannot name ${what}; use letters, digits and _, not starting with a digit`,
      );
    if (SOLID_SCRIPT_NAMES_PLAIN.size < 20000) SOLID_SCRIPT_NAMES_PLAIN.add(name);
  }

  /**
   * Fails when a line sets a name that may only be read.
   *
   * @param name Name being set.
   * @param key Its key, when the caller has it.
   */
  protected writableCheck(name: string, key = solidScriptNameKey(name)): void {
    const origin = this.readOnly.get(key);
    if (origin !== undefined)
      throw new Error(
        `"${this.nameShown(key)}" is an ${origin} of this script and can only be read; change its value in the inspector`,
      );
  }
}
