import type { SolidScriptFieldContext } from './solid_script_field.js';
import type { SolidScriptValue } from './solid_script_value.js';

/**
 * Variables visible to the lines of one block. Each block that runs its lines
 * opens a child scope; setting a variable changes it where it was first set, so
 * a counter kept outside a Repeat keeps counting across its rounds.
 */
export class SolidScriptScope {
  /**
   * Name of the only variable set here while there is one, such as the counter
   * of a Repeat round; empty when none is, or when there are more.
   */
  private soloName = '';
  /** Value of the only variable. */
  private soloValue: SolidScriptValue = undefined;
  /**
   * Variables set here once there are two or more, in the order they were first
   * set; null before that.
   */
  private variables: Map<string, SolidScriptValue> | null = null;
  /** What field text reads here, made once by the running script. */
  fieldContext: SolidScriptFieldContext | null = null;

  /**
   * Creates a scope.
   *
   * @param parent Enclosing scope, or null for the script itself.
   * @param partName Part whose lines run here, naming the brushes they build.
   */
  constructor(
    readonly parent: SolidScriptScope | null,
    readonly partName: string = parent?.partName ?? '',
  ) {}

  /**
   * Defines a variable in this scope, such as a loop counter.
   *
   * @param name Name.
   * @param value Value.
   */
  variableDefine(name: string, value: SolidScriptValue): void {
    if (this.variables !== null) this.variables.set(name, value);
    else if (this.soloName === '' || this.soloName === name) {
      this.soloName = name;
      this.soloValue = value;
    } else this.variablesSpread(name, value);
  }

  /**
   * Moves the only variable into a map with a second one after it.
   *
   * @param name Second name.
   * @param value Its value.
   */
  private variablesSpread(name: string, value: SolidScriptValue): void {
    this.variables = new Map([
      [this.soloName, this.soloValue],
      [name, value],
    ]);
    this.soloName = '';
    this.soloValue = undefined;
  }

  /**
   * Returns whether this scope itself sets a variable.
   *
   * @param name Name.
   * @returns True when it does.
   */
  private variableIsOwn(name: string): boolean {
    return this.variables !== null ? this.variables.has(name) : this.soloName === name && name !== '';
  }

  /**
   * Finds the scope that holds a variable, walking out once.
   *
   * @param name Name.
   * @returns Scope, or null when unknown.
   */
  variableHome(name: string): SolidScriptScope | null {
    for (let scope: SolidScriptScope | null = this; scope; scope = scope.parent)
      if (scope.variableIsOwn(name)) return scope;
    return null;
  }

  /**
   * Reads a variable of this scope only.
   *
   * @param name Name.
   * @returns Value, or undefined.
   */
  variableOwn(name: string): SolidScriptValue {
    if (this.variables !== null) return this.variables.get(name);
    return this.soloName === name ? this.soloValue : undefined;
  }

  /**
   * Sets a variable where it already exists, or defines it here.
   *
   * @param name Name.
   * @param value Value.
   */
  variableSet(name: string, value: SolidScriptValue): void {
    const home = this.variableHome(name) ?? this;
    home.variableDefine(name, value);
  }

  /**
   * Forgets a variable where it was set, so reading it stops the script.
   *
   * @param name Name.
   * @returns True when it existed.
   */
  variableDelete(name: string): boolean {
    const home = this.variableHome(name);
    if (!home) return false;
    if (home.variables !== null) home.variables.delete(name);
    else {
      home.soloName = '';
      home.soloValue = undefined;
    }
    return true;
  }

  /**
   * Reads a variable from this scope or an enclosing one.
   *
   * @param name Name.
   * @returns Value, or undefined when unknown.
   */
  variableGet(name: string): SolidScriptValue {
    for (let scope: SolidScriptScope | null = this; scope; scope = scope.parent) {
      const variables = scope.variables;
      if (variables === null) {
        if (scope.soloName === name) return scope.soloValue;
        continue;
      }
      const value = variables.get(name);
      if (value !== undefined || variables.has(name)) return value;
    }
    return undefined;
  }

  /**
   * Returns whether a variable is visible here.
   *
   * @param name Name.
   * @returns True when it is.
   */
  variableHas(name: string): boolean {
    return this.variableHome(name) !== null;
  }

  /**
   * Lists the variables visible here, innermost last.
   *
   * @returns Visible variables by name.
   */
  variablesVisible(): Map<string, SolidScriptValue> {
    const visible = this.parent ? this.parent.variablesVisible() : new Map<string, SolidScriptValue>();
    const own: Iterable<[string, SolidScriptValue]> =
      this.variables ?? (this.soloName === '' ? [] : [[this.soloName, this.soloValue]]);
    for (const [name, value] of own) {
      visible.delete(name);
      visible.set(name, value);
    }
    return visible;
  }
}
