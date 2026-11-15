/** One named or positional argument of a call. */
export interface SolidScriptArgument {
  /** Argument name, or null for a positional argument. */
  name: string | null;
  /** Argument value expression. */
  value: SolidScriptExpression;
}

/** One parameter of a module or function definition. */
export interface SolidScriptParameter {
  /** Parameter name. */
  name: string;
  /** Default value expression, or null. */
  fallback: SolidScriptExpression | null;
}

/** One loop variable binding of a for statement or comprehension. */
export interface SolidScriptBinding {
  /** Variable name. */
  name: string;
  /** Range or list expression the variable walks. */
  value: SolidScriptExpression;
}

/** Expression node of the solid script language. */
export type SolidScriptExpression =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'undef' }
  | { kind: 'variable'; name: string }
  | { kind: 'vector'; items: SolidScriptExpression[] }
  | { kind: 'comprehension'; bindings: SolidScriptBinding[]; body: SolidScriptExpression }
  | { kind: 'range'; start: SolidScriptExpression; step: SolidScriptExpression | null; end: SolidScriptExpression }
  | { kind: 'unary'; operator: string; operand: SolidScriptExpression }
  | { kind: 'binary'; operator: string; left: SolidScriptExpression; right: SolidScriptExpression }
  | {
      kind: 'ternary';
      condition: SolidScriptExpression;
      whenTrue: SolidScriptExpression;
      whenFalse: SolidScriptExpression;
    }
  | { kind: 'call'; name: string; args: SolidScriptArgument[] }
  | { kind: 'index'; target: SolidScriptExpression; index: SolidScriptExpression }
  | { kind: 'member'; target: SolidScriptExpression; name: string };

/** Statement node of the solid script language. */
export type SolidScriptStatement =
  | { kind: 'assign'; name: string; value: SolidScriptExpression; line: number }
  | { kind: 'module_call'; name: string; args: SolidScriptArgument[]; children: SolidScriptStatement[]; line: number }
  | { kind: 'module_define'; name: string; params: SolidScriptParameter[]; body: SolidScriptStatement[]; line: number }
  | { kind: 'function_define'; name: string; params: SolidScriptParameter[]; body: SolidScriptExpression; line: number }
  | {
      kind: 'if';
      condition: SolidScriptExpression;
      then: SolidScriptStatement[];
      otherwise: SolidScriptStatement[];
      line: number;
    }
  | { kind: 'for'; bindings: SolidScriptBinding[]; body: SolidScriptStatement[]; line: number }
  | { kind: 'block'; body: SolidScriptStatement[]; line: number };
