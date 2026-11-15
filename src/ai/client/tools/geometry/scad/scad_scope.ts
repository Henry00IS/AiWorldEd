import type { ScadExpression, ScadParameter, ScadStatement } from './scad_ast.js';
import type { ScadValue } from './scad_value.js';

/** A user module: parameters, body and the scope it was defined in. */
export interface ScadModuleDefinition {
  params: ScadParameter[];
  body: ScadStatement[];
  scope: ScadScope;
}

/** A user function: parameters, body and the scope it was defined in. */
export interface ScadFunctionDefinition {
  params: ScadParameter[];
  body: ScadExpression;
  scope: ScadScope;
}

/** The children a module call passed in, for children() inside the module. */
export interface ScadChildren {
  statements: ScadStatement[];
  scope: ScadScope;
}

/** Lexical scope of variables, functions and modules. */
export class ScadScope {
  private readonly variables = new Map<string, ScadValue>();
  private readonly functions = new Map<string, ScadFunctionDefinition>();
  private readonly modules = new Map<string, ScadModuleDefinition>();

  /**
   * Creates a scope.
   *
   * @param parent Enclosing scope, or null for the root.
   * @param children Children of the module call this scope belongs to.
   * @param moduleName Name of the user module this scope runs, or empty.
   */
  constructor(
    readonly parent: ScadScope | null,
    readonly children: ScadChildren | null = parent?.children ?? null,
    readonly moduleName: string = parent?.moduleName ?? '',
  ) {}

  /**
   * Sets a variable in this scope.
   *
   * @param name Variable name.
   * @param value Value.
   */
  variableSet(name: string, value: ScadValue): void {
    this.variables.set(name, value);
  }

  /**
   * Looks up a variable through the scope chain.
   *
   * @param name Variable name.
   * @returns Value, or undefined when unknown.
   */
  variableGet(name: string): ScadValue {
    if (this.variables.has(name)) return this.variables.get(name);
    return this.parent ? this.parent.variableGet(name) : undefined;
  }

  /**
   * Defines a function in this scope.
   *
   * @param name Function name.
   * @param definition Definition.
   */
  functionSet(name: string, definition: ScadFunctionDefinition): void {
    this.functions.set(name, definition);
  }

  /**
   * Looks up a function through the scope chain.
   *
   * @param name Function name.
   * @returns Definition, or undefined.
   */
  functionGet(name: string): ScadFunctionDefinition | undefined {
    return this.functions.get(name) ?? this.parent?.functionGet(name);
  }

  /**
   * Defines a module in this scope.
   *
   * @param name Module name.
   * @param definition Definition.
   */
  moduleSet(name: string, definition: ScadModuleDefinition): void {
    this.modules.set(name, definition);
  }

  /**
   * Looks up a module through the scope chain.
   *
   * @param name Module name.
   * @returns Definition, or undefined.
   */
  moduleGet(name: string): ScadModuleDefinition | undefined {
    return this.modules.get(name) ?? this.parent?.moduleGet(name);
  }
}
