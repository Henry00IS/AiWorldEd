import type { SolidScriptExpression, SolidScriptParameter, SolidScriptStatement } from './solid_script_ast.js';
import type { SolidScriptValue } from './solid_script_value.js';

/** A user module: parameters, body and the scope it was defined in. */
export interface SolidScriptModuleDefinition {
  params: SolidScriptParameter[];
  body: SolidScriptStatement[];
  scope: SolidScriptScope;
}

/** A user function: parameters, body and the scope it was defined in. */
export interface SolidScriptFunctionDefinition {
  params: SolidScriptParameter[];
  body: SolidScriptExpression;
  scope: SolidScriptScope;
}

/** The children a module call passed in, for children() inside the module. */
export interface SolidScriptChildren {
  statements: SolidScriptStatement[];
  scope: SolidScriptScope;
}

/** Lexical scope of variables, functions and modules. */
export class SolidScriptScope {
  private readonly variables = new Map<string, SolidScriptValue>();
  private readonly functions = new Map<string, SolidScriptFunctionDefinition>();
  private readonly modules = new Map<string, SolidScriptModuleDefinition>();

  /**
   * Creates a scope.
   *
   * @param parent Enclosing scope, or null for the root.
   * @param children Children of the module call this scope belongs to.
   * @param moduleName Name of the user module this scope runs, or empty.
   */
  constructor(
    readonly parent: SolidScriptScope | null,
    readonly children: SolidScriptChildren | null = parent?.children ?? null,
    readonly moduleName: string = parent?.moduleName ?? '',
  ) {}

  /**
   * Sets a variable in this scope.
   *
   * @param name Variable name.
   * @param value Value.
   */
  variableSet(name: string, value: SolidScriptValue): void {
    this.variables.set(name, value);
  }

  /**
   * Looks up a variable through the scope chain.
   *
   * @param name Variable name.
   * @returns Value, or undefined when unknown.
   */
  variableGet(name: string): SolidScriptValue {
    if (this.variables.has(name)) return this.variables.get(name);
    return this.parent ? this.parent.variableGet(name) : undefined;
  }

  /**
   * Returns whether a variable is defined here or in an outer scope, even when
   * its value is undef.
   *
   * @param name Variable name.
   * @returns True when defined.
   */
  variableHas(name: string): boolean {
    return this.variables.has(name) || (this.parent?.variableHas(name) ?? false);
  }

  /**
   * Lists the variables this scope sees, outer scopes first and inner names
   * replacing outer ones; the special $ settings are left out.
   *
   * @returns Visible variables by name.
   */
  variablesVisible(): Map<string, SolidScriptValue> {
    const visible = this.parent ? this.parent.variablesVisible() : new Map<string, SolidScriptValue>();
    for (const [name, value] of this.variables) {
      visible.delete(name);
      if (!name.startsWith('$')) visible.set(name, value);
    }
    return visible;
  }

  /**
   * Defines a function in this scope.
   *
   * @param name Function name.
   * @param definition Definition.
   */
  functionSet(name: string, definition: SolidScriptFunctionDefinition): void {
    this.functions.set(name, definition);
  }

  /**
   * Looks up a function through the scope chain.
   *
   * @param name Function name.
   * @returns Definition, or undefined.
   */
  functionGet(name: string): SolidScriptFunctionDefinition | undefined {
    return this.functions.get(name) ?? this.parent?.functionGet(name);
  }

  /**
   * Defines a module in this scope.
   *
   * @param name Module name.
   * @param definition Definition.
   */
  moduleSet(name: string, definition: SolidScriptModuleDefinition): void {
    this.modules.set(name, definition);
  }

  /**
   * Looks up a module through the scope chain.
   *
   * @param name Module name.
   * @returns Definition, or undefined.
   */
  moduleGet(name: string): SolidScriptModuleDefinition | undefined {
    return this.modules.get(name) ?? this.parent?.moduleGet(name);
  }
}
