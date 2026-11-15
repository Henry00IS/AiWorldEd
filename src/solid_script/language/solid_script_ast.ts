/** One named or positional argument of a call. */
export interface SolidScriptArgument {
  /** Argument name, or null for a positional argument. */
  name: string | null;
  /** Argument value expression. */
  value: SolidScriptExpression;
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
