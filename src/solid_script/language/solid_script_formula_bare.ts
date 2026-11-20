import { solidScriptExpressionChildren, type SolidScriptExpression } from './solid_script_ast.js';
import { SolidScriptFormulaSource } from './solid_script_formula_source.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { solidScriptSystemOfficial } from './solid_script_system_names.js';

/**
 * What the error of a name a formula writes without brackets says, for the hint
 * after it.
 */
export const SOLID_SCRIPT_FORMULA_BARE_TOLD = 'needs brackets in a formula';

/**
 * A name written in a formula without brackets, such as Width or Edge.Start in
 * [=Width + Edge.Start]: the read and the whole name with its members.
 */
export interface SolidScriptFormulaBareRead {
  /** The read: the name itself or the outermost member read of it. */
  node: SolidScriptExpression;
  /** The name without its members, as written. */
  root: string;
  /** The whole name with its members, as written, such as Edge.Start. */
  name: string;
}

/**
 * Finds every name a formula writes without brackets. A formula reads each name
 * of the script and each system value in brackets, such as [Width] or
 * [$Box.Width]; a word without brackets is only ever a function, such as
 * Sin(5). A name a list comprehension binds is its own and left alone.
 *
 * @param tree Formula read.
 * @param part Tells whether a name stands for a bracketed part.
 * @returns Names without brackets, in the order they are written.
 */
export function solidScriptFormulaBareReads(
  tree: SolidScriptExpression,
  part: (node: SolidScriptExpression) => boolean,
): SolidScriptFormulaBareRead[] {
  const found: SolidScriptFormulaBareRead[] = [];
  const visit = (node: SolidScriptExpression, bound: ReadonlySet<string>): void => {
    const read = solidScriptFormulaBareRead(node, bound, part);
    if (read) return void found.push(read);
    const names = node.kind === 'comprehension' ? node.bindings.map((binding) => solidScriptNameKey(binding.name)) : [];
    for (const child of solidScriptExpressionChildren(node)) visit(child, new Set([...bound, ...names]));
  };
  visit(tree, new Set());
  return found;
}

/**
 * Reads one part of a formula as a name without brackets: a name, or a chain of
 * member reads starting at one.
 *
 * @param node Part.
 * @param bound Names a list comprehension around it binds, folded.
 * @param part Tells whether a name stands for a bracketed part.
 * @returns The read, or null when the part is no such name.
 */
function solidScriptFormulaBareRead(
  node: SolidScriptExpression,
  bound: ReadonlySet<string>,
  part: (node: SolidScriptExpression) => boolean,
): SolidScriptFormulaBareRead | null {
  const members: string[] = [];
  let root: SolidScriptExpression = node;
  for (; root.kind === 'member'; root = root.target) members.unshift(root.name);
  if (root.kind !== 'variable' || part(root) || bound.has(solidScriptNameKey(root.name))) return null;
  return { node, root: root.name, name: [root.name, ...members].join('.') };
}

/**
 * Writes the brackets a name without them needs in a formula: a system value
 * written without its $ gets it, such as [$Box.Width] for Box.Width.
 *
 * @param read Name without brackets.
 * @param known Tells whether the script has a variable of that name.
 * @returns The name in brackets.
 */
export function solidScriptFormulaBareBracketed(
  read: SolidScriptFormulaBareRead,
  known: (name: string) => boolean,
): string {
  if (known(read.root)) return `[${read.name}]`;
  const official = solidScriptSystemOfficial(read.name);
  if (official) return `[${official}]`;
  const head = read.name.split('.');
  const group = head.length >= 2 ? solidScriptSystemOfficial(`${head[0]}.${head[1]}`) : undefined;
  return `[${group ? [group, ...head.slice(2)].join('.') : read.name}]`;
}

/**
 * Tells whether a name without brackets surely means a variable or a system
 * value, so the formula can be written for it.
 *
 * @param read Name without brackets.
 * @param known Tells whether the script has a variable of that name.
 * @returns True when it does.
 */
function solidScriptFormulaBareMeant(read: SolidScriptFormulaBareRead, known: (name: string) => boolean): boolean {
  return (
    known(read.root) ||
    read.root.startsWith('$') ||
    solidScriptFormulaBareBracketed(read, () => false) !== `[${read.name}]`
  );
}

/**
 * Explains a name a formula writes without brackets, with how to write the name
 * when it surely means a variable or a system value. The hint of the field
 * writes the whole formula.
 *
 * @param read Name without brackets.
 * @param known Tells whether the script has a variable of a name.
 * @returns Message.
 */
export function solidScriptFormulaBareMessage(
  read: SolidScriptFormulaBareRead,
  known: (name: string) => boolean,
): string {
  const lead = `${read.name} ${SOLID_SCRIPT_FORMULA_BARE_TOLD}; a word without them can only be a function, such as Sin(5)`;
  if (!solidScriptFormulaBareMeant(read, known))
    return `${lead}. There is no variable ${read.root} either; for a variable write [${read.root}], for text write "${read.name}"`;
  return `${lead}; write ${solidScriptFormulaBareBracketed(read, known)}`;
}

/**
 * Checks that a formula writes every name in brackets.
 *
 * @param source Formula read.
 * @returns Problem in plain words, or an empty string.
 */
export function solidScriptFormulaBareProblem(source: SolidScriptFormulaSource): string {
  const read = solidScriptFormulaBareReads(source.tree, (node) => source.slot(node))[0];
  return read ? solidScriptFormulaBareMessage(read, () => true) : '';
}

/**
 * Checks that a formula can be read, without running it: it parses, and it
 * writes every name in brackets.
 *
 * @param text Formula.
 * @returns Problem in plain words, or an empty string.
 */
export function solidScriptFormulaProblem(text: string): string {
  try {
    return solidScriptFormulaBareProblem(SolidScriptFormulaSource.read(text));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
