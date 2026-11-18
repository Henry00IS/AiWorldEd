import {
  solidScriptFlowFormulaRead,
  solidScriptFlowFormulaTree,
  type SolidScriptFlowFormula,
} from './solid_script_document_flow_formula.js';
import { SOLID_SCRIPT_FLOW_UNKNOWN, type SolidScriptFlowHead } from './solid_script_document_flow_kinds.js';
import {
  solidScriptFlowVariableJoin,
  solidScriptFlowVariableKeep,
  type SolidScriptFlowState,
} from './solid_script_document_flow_state.js';
import type { SolidScriptExpression } from '@/solid_script/language/solid_script_ast.js';
import { solidScriptBuiltinFind } from '@/solid_script/language/solid_script_expression_compile.js';
import { SOLID_SCRIPT_FUNCTION_DOCS } from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';

/** Variables on each side of a condition; null for a side no run can take. */
export interface SolidScriptFlowSides {
  /** Variables where the condition holds. */
  readonly then: SolidScriptFlowState | null;
  /** Variables where it does not. */
  readonly otherwise: SolidScriptFlowState | null;
}

/** Comparisons that stop the script unless both sides are numbers or both text. */
const SOLID_SCRIPT_NARROW_ORDER: ReadonlySet<string> = new Set(['<', '<=', '>', '>=']);

/** What a condition is read with: its formula, the variables and their kinds. */
interface SolidScriptNarrowContext {
  readonly formula: SolidScriptFlowFormula;
  readonly head: SolidScriptFlowHead;
}

/**
 * Narrows what each variable may hold on both sides of an If condition, the way
 * a run that took that side must have seen it: a comparison with a number makes
 * a name a Number, == with a value gives it that value's kind, a check such as
 * IsNum keeps or drops the kinds it declares, and !, && and || combine them. A
 * side whose condition cannot hold, such as [Mode] == "Wide" where Mode is a
 * number Input, gets no variables.
 *
 * @param condition Condition as typed.
 * @param state Variables before the If.
 * @param head Kinds of names and Functions for the values in the condition.
 * @returns Variables on each side.
 */
export function solidScriptFlowNarrow(
  condition: string,
  state: SolidScriptFlowState,
  head: SolidScriptFlowHead,
): SolidScriptFlowSides {
  const text = condition.trim();
  const inner = /^\[(=.*)\]$/s.exec(text)?.[1] ?? `=${text}`;
  const formula = solidScriptFlowFormulaRead(inner);
  if (!formula || text === '') return { then: state, otherwise: state };
  const context: SolidScriptNarrowContext = { formula, head };
  return {
    then: solidScriptNarrowAssume(context, formula.tree, true, state),
    otherwise: solidScriptNarrowAssume(context, formula.tree, false, state),
  };
}

/**
 * Narrows variables assuming a condition came out one way.
 *
 * @param context Condition being read.
 * @param node Part of the condition.
 * @param truth The way it came out.
 * @param state Variables before; null when no run gets here.
 * @returns Variables after; null when no run can see it come out that way.
 */
function solidScriptNarrowAssume(
  context: SolidScriptNarrowContext,
  node: SolidScriptExpression,
  truth: boolean,
  state: SolidScriptFlowState | null,
): SolidScriptFlowState | null {
  if (state === null) return null;
  if (node.kind === 'unary' && node.operator === '!')
    return solidScriptNarrowAssume(context, node.operand, !truth, state);
  if (node.kind === 'binary' && (node.operator === '&&' || node.operator === '||'))
    return solidScriptNarrowLogical(context, node, truth, state);
  const constant = solidScriptNarrowConstant(node);
  if (constant !== undefined) return constant === truth ? state : null;
  if (node.kind === 'binary') return solidScriptNarrowCompare(context, node, truth, state);
  if (node.kind === 'call') return solidScriptNarrowCheck(context, node, truth, state);
  return state;
}

/**
 * Narrows variables assuming an && or || came out one way: both sides hold when
 * && is true or || is false; otherwise either the left side held, or it did not
 * and the right side did.
 *
 * @param context Condition being read.
 * @param node The && or ||.
 * @param truth The way it came out.
 * @param state Variables before.
 * @returns Variables after; null when no run can see it come out that way.
 */
function solidScriptNarrowLogical(
  context: SolidScriptNarrowContext,
  node: Extract<SolidScriptExpression, { kind: 'binary' }>,
  truth: boolean,
  state: SolidScriptFlowState,
): SolidScriptFlowState | null {
  const assume = (inner: SolidScriptExpression, way: boolean, from: SolidScriptFlowState | null) =>
    solidScriptNarrowAssume(context, inner, way, from);
  const left = assume(node.left, truth, state);
  if ((node.operator === '&&') === truth) return assume(node.right, truth, left);
  return solidScriptNarrowJoin(left, assume(node.right, truth, assume(node.left, !truth, state)));
}

/**
 * Joins the variables of two ways to the same place; a way no run takes adds
 * nothing.
 *
 * @param left Variables of one way.
 * @param right Variables of the other.
 * @returns Joined variables.
 */
export function solidScriptNarrowJoin(
  left: SolidScriptFlowState | null,
  right: SolidScriptFlowState | null,
): SolidScriptFlowState | null {
  if (left === null) return right;
  if (right === null) return left;
  const joined = new Map(left);
  for (const [key, variable] of right) {
    const known = joined.get(key);
    joined.set(key, known ? solidScriptFlowVariableJoin(known, variable) : variable);
  }
  return joined;
}

/**
 * Tells the value of a condition made only of typed values, such as 1 == 2.
 *
 * @param node Condition.
 * @returns Yes or No, or nothing when it reads a name.
 */
function solidScriptNarrowConstant(node: SolidScriptExpression): boolean | undefined {
  if (node.kind === 'boolean') return node.value;
  if (node.kind === 'number') return node.value !== 0;
  if (node.kind !== 'binary') return undefined;
  const plain = (side: SolidScriptExpression): number | string | boolean | undefined =>
    side.kind === 'number' || side.kind === 'string' || side.kind === 'boolean' ? side.value : undefined;
  const left = plain(node.left);
  const right = plain(node.right);
  if (left === undefined || right === undefined) return undefined;
  if (node.operator === '==') return left === right;
  if (node.operator === '!=') return left !== right;
  if (typeof left !== typeof right || typeof left === 'boolean') return undefined;
  if (node.operator === '<') return left < right;
  if (node.operator === '<=') return left <= right;
  if (node.operator === '>') return left > right;
  return node.operator === '>=' ? left >= right : undefined;
}

/**
 * Names the variable a side of a condition reads, when it is a plain name such
 * as [Henry] or Henry.
 *
 * @param context Condition being read.
 * @param side Side.
 * @returns Name key, or nothing for anything else.
 */
function solidScriptNarrowName(context: SolidScriptNarrowContext, side: SolidScriptExpression): string | undefined {
  if (side.kind !== 'variable') return undefined;
  const part = /^__flow_part_(\d+)$/.exec(side.name)?.[1];
  const name = part === undefined ? side.name : (context.formula.parts[Number(part)] ?? '');
  return /^((local|persistent)\.)?[A-Za-z_]\w*$/i.test(name.trim()) ? solidScriptNameKey(name.trim()) : undefined;
}

/**
 * Tells the kinds a side of a condition gives.
 *
 * @param context Condition being read.
 * @param side Side.
 * @returns Kinds.
 */
function solidScriptNarrowKinds(context: SolidScriptNarrowContext, side: SolidScriptExpression): string[] {
  return solidScriptFlowFormulaTree({ tree: side, parts: context.formula.parts }, context.head);
}

/**
 * Narrows a variable compared with something: <, <=, > and >= need both sides
 * numbers or both text, whichever way they come out; == gives the variable the
 * other side's kind where it holds, != where it does not.
 *
 * @param context Condition being read.
 * @param node Comparison.
 * @param truth The way it came out.
 * @param state Variables before.
 * @returns Variables after, or null when no run can see it.
 */
function solidScriptNarrowCompare(
  context: SolidScriptNarrowContext,
  node: Extract<SolidScriptExpression, { kind: 'binary' }>,
  truth: boolean,
  state: SolidScriptFlowState,
): SolidScriptFlowState | null {
  let after: SolidScriptFlowState | null = state;
  for (const [side, other] of [
    [node.left, node.right],
    [node.right, node.left],
  ] as const) {
    const key = solidScriptNarrowName(context, side);
    const kinds = solidScriptNarrowKinds(context, other);
    if (key === undefined || kinds.length === 0 || kinds.includes(SOLID_SCRIPT_FLOW_UNKNOWN)) continue;
    if (SOLID_SCRIPT_NARROW_ORDER.has(node.operator))
      after = solidScriptNarrowKeep(
        after,
        key,
        kinds.filter((kind) => kind === 'Number' || kind === 'Text'),
      );
    else if ((node.operator === '==') === truth) after = solidScriptNarrowKeep(after, key, kinds);
  }
  return after;
}

/**
 * Narrows a variable a check such as IsNum([X]) asks about: where it says Yes
 * the variable holds one of the kinds the check declares, where it says No none
 * of them.
 *
 * @param context Condition being read.
 * @param node Call.
 * @param truth The way it came out.
 * @param state Variables before.
 * @returns Variables after, or null when no run can see it.
 */
function solidScriptNarrowCheck(
  context: SolidScriptNarrowContext,
  node: Extract<SolidScriptExpression, { kind: 'call' }>,
  truth: boolean,
  state: SolidScriptFlowState,
): SolidScriptFlowState | null {
  const builtin = solidScriptBuiltinFind(node.name);
  const checks = builtin === undefined ? undefined : SOLID_SCRIPT_FUNCTION_DOCS[builtin]?.checks;
  const value = node.args[0]?.value;
  const key = value ? solidScriptNarrowName(context, value) : undefined;
  if (!checks || key === undefined) return state;
  const matches = (kind: string): boolean =>
    checks.includes(kind as never) || (checks.includes('List') && kind.endsWith('List'));
  const current = [...(state.get(key)?.kinds ?? [SOLID_SCRIPT_FLOW_UNKNOWN])];
  if (truth)
    return solidScriptNarrowKeep(
      state,
      key,
      current.includes(SOLID_SCRIPT_FLOW_UNKNOWN) ? [...checks] : current.filter(matches),
    );
  const left = current.filter((kind) => kind === SOLID_SCRIPT_FLOW_UNKNOWN || !matches(kind));
  return left.length === 0 ? null : new Map(state).set(key, solidScriptFlowVariableKeep(state.get(key), left));
}

/**
 * Keeps only some kinds of a variable: a variable whose kind only running tells
 * now holds them, one that holds none of them cannot get here.
 *
 * @param state Variables before; null when no run gets here.
 * @param key Name key.
 * @param kinds Kinds it may hold here.
 * @returns Variables after, or null when no run can get here.
 */
function solidScriptNarrowKeep(
  state: SolidScriptFlowState | null,
  key: string,
  kinds: readonly string[],
): SolidScriptFlowState | null {
  if (state === null) return null;
  if (kinds.length === 0) return null;
  const current = [...(state.get(key)?.kinds ?? [SOLID_SCRIPT_FLOW_UNKNOWN])];
  const kept = current.includes(SOLID_SCRIPT_FLOW_UNKNOWN)
    ? [...kinds]
    : current.filter((kind) => kinds.includes(kind));
  return kept.length === 0 ? null : new Map(state).set(key, solidScriptFlowVariableKeep(state.get(key), kept));
}
