import type { SolidScriptValue } from './solid_script_value.js';

/**
 * Variables visible to the lines of one block. Each block that runs its lines
 * opens a child scope; setting a variable changes it where it was first set, so
 * a counter kept outside a Repeat keeps counting across its rounds.
 */
export class SolidScriptScope {
  private readonly variables = new Map<string, SolidScriptValue>();

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
    this.variables.set(name, value);
  }

  /**
   * Sets a variable where it already exists, or defines it here.
   *
   * @param name Name.
   * @param value Value.
   */
  variableSet(name: string, value: SolidScriptValue): void {
    for (let scope: SolidScriptScope | null = this; scope; scope = scope.parent) {
      if (scope.variables.has(name)) {
        scope.variables.set(name, value);
        return;
      }
    }
    this.variables.set(name, value);
  }

  /**
   * Forgets a variable where it was set, so reading it stops the script.
   *
   * @param name Name.
   * @returns True when it existed.
   */
  variableDelete(name: string): boolean {
    for (let scope: SolidScriptScope | null = this; scope; scope = scope.parent)
      if (scope.variables.delete(name)) return true;
    return false;
  }

  /**
   * Reads a variable from this scope or an enclosing one.
   *
   * @param name Name.
   * @returns Value, or undefined when unknown.
   */
  variableGet(name: string): SolidScriptValue {
    if (this.variables.has(name)) return this.variables.get(name);
    return this.parent ? this.parent.variableGet(name) : undefined;
  }

  /**
   * Returns whether a variable is visible here.
   *
   * @param name Name.
   * @returns True when it is.
   */
  variableHas(name: string): boolean {
    return this.variables.has(name) || (this.parent?.variableHas(name) ?? false);
  }

  /**
   * Lists the variables visible here, innermost last.
   *
   * @returns Visible variables by name.
   */
  variablesVisible(): Map<string, SolidScriptValue> {
    const visible = this.parent ? this.parent.variablesVisible() : new Map<string, SolidScriptValue>();
    for (const [name, value] of this.variables) {
      visible.delete(name);
      visible.set(name, value);
    }
    return visible;
  }
}
