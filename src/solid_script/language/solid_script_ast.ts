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
  | { kind: 'member'; target: SolidScriptExpression; name: string }
  /** A bracketed part of a field formula, read before the formula runs. */
  | { kind: 'slot'; index: number };

/** The direct parts of each kind of expression that has any. */
const SOLID_SCRIPT_EXPRESSION_CHILDREN: {
  readonly [Kind in SolidScriptExpression['kind']]?: (
    node: Extract<SolidScriptExpression, { kind: Kind }>,
  ) => SolidScriptExpression[];
} = {
  vector: (node) => node.items,
  comprehension: (node) => [...node.bindings.map((binding) => binding.value), node.body],
  range: (node) => [node.start, ...(node.step ? [node.step] : []), node.end],
  unary: (node) => [node.operand],
  binary: (node) => [node.left, node.right],
  ternary: (node) => [node.condition, node.whenTrue, node.whenFalse],
  call: (node) => node.args.map((arg) => arg.value),
  index: (node) => [node.target, node.index],
  member: (node) => [node.target],
};

/**
 * Lists the parts of an expression.
 *
 * @param node Expression.
 * @returns Its direct parts.
 */
export function solidScriptExpressionChildren(node: SolidScriptExpression): SolidScriptExpression[] {
  const rule = SOLID_SCRIPT_EXPRESSION_CHILDREN[node.kind] as
    ((node: SolidScriptExpression) => SolidScriptExpression[]) | undefined;
  return rule ? rule(node) : [];
}
