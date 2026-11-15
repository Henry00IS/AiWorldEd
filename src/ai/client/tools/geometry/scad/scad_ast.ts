/** One named or positional argument of a call. */
export interface ScadArgument {
  /** Argument name, or null for a positional argument. */
  name: string | null;
  /** Argument value expression. */
  value: ScadExpression;
}

/** One parameter of a module or function definition. */
export interface ScadParameter {
  /** Parameter name. */
  name: string;
  /** Default value expression, or null. */
  fallback: ScadExpression | null;
}

/** One loop variable binding of a for statement or comprehension. */
export interface ScadBinding {
  /** Variable name. */
  name: string;
  /** Range or list expression the variable walks. */
  value: ScadExpression;
}

/** Expression node of the supported OpenSCAD subset. */
export type ScadExpression =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'undef' }
  | { kind: 'variable'; name: string }
  | { kind: 'vector'; items: ScadExpression[] }
  | { kind: 'comprehension'; bindings: ScadBinding[]; body: ScadExpression }
  | { kind: 'range'; start: ScadExpression; step: ScadExpression | null; end: ScadExpression }
  | { kind: 'unary'; operator: string; operand: ScadExpression }
  | { kind: 'binary'; operator: string; left: ScadExpression; right: ScadExpression }
  | { kind: 'ternary'; condition: ScadExpression; whenTrue: ScadExpression; whenFalse: ScadExpression }
  | { kind: 'call'; name: string; args: ScadArgument[] }
  | { kind: 'index'; target: ScadExpression; index: ScadExpression }
  | { kind: 'member'; target: ScadExpression; name: string };

/** Statement node of the supported OpenSCAD subset. */
export type ScadStatement =
  | { kind: 'assign'; name: string; value: ScadExpression; line: number }
  | { kind: 'module_call'; name: string; args: ScadArgument[]; children: ScadStatement[]; line: number }
  | { kind: 'module_define'; name: string; params: ScadParameter[]; body: ScadStatement[]; line: number }
  | { kind: 'function_define'; name: string; params: ScadParameter[]; body: ScadExpression; line: number }
  | { kind: 'if'; condition: ScadExpression; then: ScadStatement[]; otherwise: ScadStatement[]; line: number }
  | { kind: 'for'; bindings: ScadBinding[]; body: ScadStatement[]; line: number }
  | { kind: 'block'; body: ScadStatement[]; line: number };
