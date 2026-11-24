import { solidScriptNameIsSystem } from '@/solid_script/language/solid_script_name_key.js';
import {
  solidScriptFlowItemOf,
  solidScriptFlowMember,
  solidScriptFlowNameKinds,
  solidScriptFlowPathKinds,
  solidScriptFlowUnique,
  SOLID_SCRIPT_FLOW_UNKNOWN,
  type SolidScriptFlowHead,
} from './solid_script_document_flow_kinds.js';
import { solidScriptExpressionChildren, type SolidScriptExpression } from '@/solid_script/language/solid_script_ast.js';
import { solidScriptBuiltinFind } from '@/solid_script/language/solid_script_expression_compile.js';
import { solidScriptExpressionParse } from '@/solid_script/language/solid_script_expression_parse.js';
import { solidScriptFieldPieces } from '@/solid_script/language/solid_script_field.js';
import { solidScriptFormulaListInline } from '@/solid_script/language/solid_script_formula_list_literal.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
} from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptKindFits, solidScriptKindsWords } from '@/solid_script/language/solid_script_kinds.js';
import { solidScriptFunctionSpelling, solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';

/** Name a bracketed part of a formula stands for while it is read. */
const SOLID_SCRIPT_FLOW_PART = '__flow_part_';

/** Operators that compare and give Yes or No. */
const SOLID_SCRIPT_FLOW_COMPARE: ReadonlySet<string> = new Set(['==', '!=', '<', '<=', '>', '>=', '&&', '||']);

/** A formula read for its kinds: its tree, and the kinds of its bracketed parts. */
export interface SolidScriptFlowFormula {
  /** Formula tree; the bracketed parts are variables named for their place. */
  readonly tree: SolidScriptExpression;
  /** Text of each bracketed part, without its brackets. */
  readonly parts: readonly string[];
}

/**
 * Where splitting a formula stands: its own text so far, the parts, and the
 * part being read.
 */
interface SolidScriptFlowSplitting {
  written: string;
  readonly parts: string[];
  part: string;
  depth: number;
  quoted: boolean;
}

/**
 * Splits formula text into its own text and its top-level bracketed parts,
 * skipping $-escapes and text in double quotes.
 *
 * @param text Formula text, without its = and outer brackets.
 * @returns Text with a name for every part, and the parts.
 */
function solidScriptFlowFormulaSplit(text: string): { written: string; parts: string[] } {
  const at: SolidScriptFlowSplitting = { written: '', parts: [], part: '', depth: 0, quoted: false };
  for (let index = 0; index < text.length; index++) {
    const char = text[index] ?? '';
    if (char !== '$' || index + 1 >= text.length) solidScriptFlowSplitChar(at, char);
    else if (at.depth > 0) at.part += char + (text[++index] ?? '');
    else at.written += text[++index] ?? '';
  }
  return { written: at.written, parts: at.parts };
}

/**
 * Takes one character of a formula being split.
 *
 * @param at Where splitting stands; changed.
 * @param char Character.
 */
function solidScriptFlowSplitChar(at: SolidScriptFlowSplitting, char: string): void {
  if (char === '"' && at.depth === 0) at.quoted = !at.quoted;
  const opens = !at.quoted && char === '[';
  const closes = !at.quoted && char === ']' && at.depth > 0;
  if (opens) at.depth++;
  if (closes) at.depth--;
  if (closes && at.depth === 0) {
    at.written += ` ${SOLID_SCRIPT_FLOW_PART}${at.parts.length} `;
    at.parts.push(at.part);
    at.part = '';
  } else if (at.depth > 0 && !(opens && at.depth === 1)) at.part += char;
  else if (at.depth === 0) at.written += char;
}

/**
 * Reads a formula for its kinds.
 *
 * @param text Formula as typed in brackets, starting with =.
 * @returns Formula, or null when it cannot be read.
 */
export function solidScriptFlowFormulaRead(text: string): SolidScriptFlowFormula | null {
  const { written, parts } = solidScriptFlowFormulaSplit(text.trimStart().replace(/^=/, ''));
  try {
    return { tree: solidScriptExpressionParse(written.trim()), parts };
  } catch {
    return null;
  }
}

/**
 * Tells the kinds a bracketed part of a formula holds: a formula of its own, or
 * a name followed through its members.
 *
 * @param part Text inside the brackets.
 * @param head Kinds the script's names may hold.
 * @returns Kinds; the unknown kind when only running tells.
 */
function solidScriptFlowPartKinds(part: string, head: SolidScriptFlowHead): string[] {
  if (part.trimStart().startsWith('=')) return solidScriptFlowFormulaKinds(part, head);
  if (solidScriptFlowPartIsList(part)) return solidScriptFlowFormulaKinds(`=$[${part}$]`, head);
  return solidScriptFlowNameKinds(part, head);
}

/**
 * Tells whether a bracketed part of a formula is a list the formula reads
 * itself, such as 0, [1, 1, 1], "Easy".
 *
 * @param part Text inside the brackets.
 * @returns True for such a list.
 */
function solidScriptFlowPartIsList(part: string): boolean {
  try {
    const [group] = solidScriptFieldPieces(`[${part}]`);
    return group?.kind === 'group' && solidScriptFormulaListInline(group);
  } catch {
    return false;
  }
}

/**
 * Tells the kinds a formula gives, such as Number for [=Abs([X])] whatever X
 * holds: built-in functions give what they declare, the script's Functions what
 * their Return lines give for the kinds passed, comparisons Yes or No and
 * arithmetic a number or a vector.
 *
 * @param text Formula as typed in brackets, starting with =.
 * @param head Kinds the script's names may hold.
 * @returns Kinds; the unknown kind when only running tells; none when the
 *   formula cannot give a value yet, such as a Function still being followed.
 */
export function solidScriptFlowFormulaKinds(text: string, head: SolidScriptFlowHead): string[] {
  const formula = solidScriptFlowFormulaRead(text);
  if (!formula) return [SOLID_SCRIPT_FLOW_UNKNOWN];
  return solidScriptFlowUnique(solidScriptFlowFormulaTree(formula, head));
}

/**
 * Tells the kinds the tree of a read formula gives.
 *
 * @param formula Formula.
 * @param head Kinds the script's names may hold.
 * @returns Kinds.
 */
export function solidScriptFlowFormulaTree(formula: SolidScriptFlowFormula, head: SolidScriptFlowHead): string[] {
  return solidScriptFlowExpressionKinds(formula.tree, solidScriptFlowFormulaNames(formula, head), head);
}

/**
 * Tells the kinds of the names a read formula uses: its bracketed parts, system
 * values and the script's names.
 *
 * @param formula Formula.
 * @param head Kinds the script's names may hold.
 * @returns Kinds by name as written; the unknown kind for a name not set.
 */
function solidScriptFlowFormulaNames(formula: SolidScriptFlowFormula, head: SolidScriptFlowHead): SolidScriptFlowNames {
  const parts = formula.parts.map((part) => solidScriptFlowPartKinds(part, head));
  return (name) => {
    if (name.startsWith(SOLID_SCRIPT_FLOW_PART)) return parts[Number(name.slice(SOLID_SCRIPT_FLOW_PART.length))] ?? [];
    if (solidScriptNameIsSystem(name)) return solidScriptFlowPathKinds(name, head);
    const kinds = head(solidScriptNameKey(name));
    return kinds.length > 0 ? [...kinds] : [SOLID_SCRIPT_FLOW_UNKNOWN];
  };
}

/** Kinds of the names a formula reads, by name as written. */
type SolidScriptFlowNames = (name: string) => string[];

/** One kind of expression, by its kind word. */
type SolidScriptFlowExpressionOf<Kind extends SolidScriptExpression['kind']> = Extract<
  SolidScriptExpression,
  { kind: Kind }
>;

/** Kinds of the parts of an expression, read the same way. */
type SolidScriptFlowInner = (inner: SolidScriptExpression) => string[];

/** What each kind of expression gives, from the kinds of its parts. */
/**
 * Joins a member chain into a dotted name, such as $Math.Pi.
 *
 * @param node Member or variable expression.
 * @returns Dotted name, or null when the start is not a name.
 */
function solidScriptFlowDotted(node: SolidScriptExpression): string | null {
  const names: string[] = [];
  let part: SolidScriptExpression = node;
  while (part.kind === 'member') {
    names.unshift(part.name);
    part = part.target;
  }
  return part.kind === 'variable' ? [part.name, ...names].join('.') : null;
}

/**
 * Tells the kinds of a member: a system value such as $Math.Pi, otherwise the
 * member of the kinds of its target.
 *
 * @param node Member expression.
 * @param kinds Kinds of a nested expression.
 * @param head Kinds the script's names may hold.
 * @returns Kinds.
 */
function solidScriptFlowSystemMember(
  node: SolidScriptFlowExpressionOf<'member'>,
  kinds: SolidScriptFlowInner,
  head: SolidScriptFlowHead,
): string[] {
  const path = solidScriptFlowDotted(node);
  return path && solidScriptNameIsSystem(path)
    ? solidScriptFlowPathKinds(path, head)
    : solidScriptFlowMember(kinds(node.target), node.name);
}

const SOLID_SCRIPT_FLOW_EXPRESSION_KINDS: {
  readonly [Kind in SolidScriptExpression['kind']]?: (
    node: SolidScriptFlowExpressionOf<Kind>,
    kinds: SolidScriptFlowInner,
    head: SolidScriptFlowHead,
  ) => string[];
} = {
  number: () => ['Number'],
  string: () => ['Text'],
  boolean: () => ['Yes/No'],
  vector: (node, kinds) => [solidScriptFlowVectorKind(node.items.map(kinds))],
  range: () => ['Number List'],
  unary: (node, kinds) =>
    node.operator === '!' ? ['Yes/No'] : solidScriptFlowArithmetic(kinds(node.operand), ['Number']),
  binary: (node, kinds) =>
    SOLID_SCRIPT_FLOW_COMPARE.has(node.operator)
      ? ['Yes/No']
      : solidScriptFlowArithmetic(kinds(node.left), kinds(node.right)),
  ternary: (node, kinds) => solidScriptFlowUnique([...kinds(node.whenTrue), ...kinds(node.whenFalse)]),
  call: (node, kinds, head) =>
    solidScriptFlowCallKinds(
      node.name,
      node.args.map((arg) => kinds(arg.value)),
      head,
    ),
  index: (node, kinds) => solidScriptFlowUnique(kinds(node.target).map(solidScriptFlowItemOf)),
  member: (node, kinds, head) => solidScriptFlowSystemMember(node, kinds, head),
};

/**
 * Tells the kinds an expression gives.
 *
 * @param node Expression.
 * @param names Kinds of the names it reads.
 * @param head Kinds the script's names may hold, and its Functions.
 * @returns Kinds; none when it cannot give a value yet.
 */
function solidScriptFlowExpressionKinds(
  node: SolidScriptExpression,
  names: SolidScriptFlowNames,
  head: SolidScriptFlowHead,
): string[] {
  if (node.kind === 'variable') return names(node.name);
  const rule = SOLID_SCRIPT_FLOW_EXPRESSION_KINDS[node.kind] as
    ((node: SolidScriptExpression, kinds: SolidScriptFlowInner, head: SolidScriptFlowHead) => string[]) | undefined;
  const kinds: SolidScriptFlowInner = (inner) => solidScriptFlowExpressionKinds(inner, names, head);
  return rule ? rule(node, kinds, head) : [SOLID_SCRIPT_FLOW_UNKNOWN];
}

/**
 * Tells the kind of a list typed in a formula, such as [1, 2, 3]: a Vector for
 * two or three numbers, a list of one kind, or a List.
 *
 * @param items Kinds of each item.
 * @returns Kind.
 */
function solidScriptFlowVectorKind(items: readonly string[][]): string {
  const only = items.every((item) => item.length === 1 && item[0] === items[0]?.[0]) ? items[0]?.[0] : undefined;
  if (only === 'Number' && (items.length === 2 || items.length === 3)) return 'Vector';
  if (only === undefined || only === SOLID_SCRIPT_FLOW_UNKNOWN || only.endsWith('List')) return 'List';
  return `${only} List`;
}

/**
 * Tells what + - * / % give: numbers give a number, a vector or list of numbers
 * with numbers gives that list; anything else only running tells.
 *
 * @param left Kinds of the left side.
 * @param right Kinds of the right side.
 * @returns Kinds; none when either side gives none yet.
 */
function solidScriptFlowArithmetic(left: readonly string[], right: readonly string[]): string[] {
  if (left.length === 0 || right.length === 0) return [];
  const numeric = (kind: string): boolean => kind === 'Number' || kind === 'Vector' || kind === 'Number List';
  const all = [...left, ...right];
  if (!all.every(numeric)) return [SOLID_SCRIPT_FLOW_UNKNOWN];
  const lists = all.filter((kind) => kind !== 'Number');
  return lists.length === 0 ? ['Number'] : solidScriptFlowUnique(lists);
}

/**
 * Tells what math that works per axis gives: a number unless an input may be a
 * vector or a list of numbers, which it then gives; Min or Max of one list
 * gives a number. An input whose kind is not known yet counts as a number.
 *
 * @param key Function key, such as abs.
 * @param values Kinds of the values passed.
 * @returns Kinds.
 */
function solidScriptFlowPerAxisKinds(key: string | undefined, values: readonly string[][]): string[] {
  if ((key === 'min' || key === 'max') && values.length === 1) return ['Number'];
  const listed = values.map((value) => value.filter((kind) => kind === 'Vector' || kind === 'Number List'));
  const lists = solidScriptFlowUnique(listed.flat());
  if (lists.length === 0) return ['Number'];
  const always = values.some((value, index) => value.length > 0 && listed[index]?.length === value.length);
  return always ? lists : ['Number', ...lists];
}

/**
 * Tells what a call in a formula gives: a built-in function what it declares, a
 * Function of the script what its Return lines give for these kinds.
 *
 * @param name Function name as written.
 * @param values Kinds of the values passed.
 * @param head Kinds the script's names may hold, and its Functions.
 * @returns Kinds.
 */
function solidScriptFlowCallKinds(name: string, values: readonly string[][], head: SolidScriptFlowHead): string[] {
  const builtin = solidScriptBuiltinFind(name);
  const doc = builtin === undefined ? undefined : SOLID_SCRIPT_FUNCTION_DOCS[builtin];
  if (doc?.perAxis) return solidScriptFlowPerAxisKinds(builtin, values);
  const gives = doc?.gives;
  if (gives !== undefined) return gives === 'Any' ? [SOLID_SCRIPT_FLOW_UNKNOWN] : [...gives];
  const own = head.call?.(name, values);
  return own === undefined ? [SOLID_SCRIPT_FLOW_UNKNOWN] : [...own];
}

/**
 * Finds the calls of built-in functions in a formula given a value no run can
 * use: a value whose every possible kind is one the function's input does not
 * declare, such as Abs of a Brush.
 *
 * @param text Formula as typed in brackets, starting with =.
 * @param head Kinds the script's names may hold.
 * @returns Messages, in the words a running formula stops with.
 */
export function solidScriptFlowFormulaProblems(text: string, head: SolidScriptFlowHead): string[] {
  const formula = solidScriptFlowFormulaRead(text);
  if (!formula) return [];
  const names = solidScriptFlowFormulaNames(formula, head);
  const problems: string[] = [];
  const visit = (node: SolidScriptExpression): void => {
    solidScriptExpressionChildren(node).forEach(visit);
    if (node.kind === 'call') problems.push(...solidScriptFlowCallProblems(node, names, head));
  };
  visit(formula.tree);
  return problems;
}

/**
 * Checks the values of one call of a built-in function against the kinds its
 * inputs declare.
 *
 * @param node The call.
 * @param names Kinds of the names the formula reads.
 * @param head Kinds the script's names may hold.
 * @returns Messages for the values no run can use.
 */
function solidScriptFlowCallProblems(
  node: SolidScriptFlowExpressionOf<'call'>,
  names: SolidScriptFlowNames,
  head: SolidScriptFlowHead,
): string[] {
  const builtin = solidScriptBuiltinFind(node.name);
  if (builtin === undefined) return [];
  const inputs = solidScriptFunctionArguments(builtin);
  const more = inputs.find((input) => input.name === '...');
  return node.args.flatMap((arg, index) => {
    const input = inputs[index] ?? more;
    const kinds = solidScriptFlowExpressionKinds(arg.value, names, head);
    if (!input || input.type === 'Any' || kinds.length === 0 || kinds.includes(SOLID_SCRIPT_FLOW_UNKNOWN)) return [];
    if (kinds.some((kind) => solidScriptKindFits(input.type, kind, true))) return [];
    const needs = `${solidScriptKindsWords(input.type)} for ${solidScriptFunctionSpelling(input.name)}`;
    return [
      `${solidScriptFunctionSpelling(builtin)}() needs ${needs}, not ${solidScriptFlowArticle(kinds.join(' or '))}`,
    ];
  });
}

/**
 * Puts a or an before kinds, such as an Edge.
 *
 * @param kinds Kinds in words.
 * @returns Kinds with their article.
 */
function solidScriptFlowArticle(kinds: string): string {
  return `${/^[AEIOU]/.test(kinds) ? 'an' : 'a'} ${kinds}`;
}
