import { solidScriptExpressionChildren, type SolidScriptExpression } from './solid_script_ast.js';
import { solidScriptFieldPieces, type SolidScriptFieldPiece } from './solid_script_field.js';
import { SolidScriptFormulaSource } from './solid_script_formula_source.js';
import { SOLID_SCRIPT_VECTOR_AXES } from './solid_script_members.js';
import { solidScriptNameKey } from './solid_script_name_key.js';

/** A bracketed part of field text. */
type SolidScriptFieldGroupPiece = Extract<SolidScriptFieldPiece, { kind: 'group' }>;

/** A name written with $, such as $Width or $Edge.Start, its first name apart. */
const SOLID_SCRIPT_BARE_DOLLAR = /^\$([A-Za-z_]\w*)(?:\.[A-Za-z_]\w*)*$/;

/** A plain name of the script, without a $, such as Edge. */
const SOLID_SCRIPT_BARE_PLAIN = /^[A-Za-z_]\w*$/;

/** Members a formula reads from any value, .X, .Y and .Z of a vector, folded. */
const SOLID_SCRIPT_BARE_AXES: ReadonlySet<string> = new Set(SOLID_SCRIPT_VECTOR_AXES.map(solidScriptNameKey));

/** A member read to write in brackets: where it stands and the name to write. */
interface SolidScriptBareMember {
  from: number;
  to: number;
  name: string;
}

/**
 * Writes, in every [= ] formula of field text, a member read of a variable the
 * line sees that has no brackets of its own, such as Edge.Start or
 * [Edge].Start, as [Edge.Start]. A formula reads .X, .Y and .Z of a value
 * itself, but any other member only from a name in brackets, so these always
 * read nothing.
 *
 * @param text Field text.
 * @param sees Tells whether the line sees a variable of that name.
 * @param plain True also writes a variable read bare without members, such as
 *   Edge in [=Edge + 1], as [Edge], for formulas that read names only in
 *   brackets.
 * @returns Rewritten text, the same when there is nothing to write.
 */
export function solidScriptMistakeBareMembers(text: string, sees: (name: string) => boolean, plain = false): string {
  let pieces: SolidScriptFieldPiece[];
  try {
    pieces = solidScriptFieldPieces(text);
  } catch {
    return text;
  }
  const formulas = pieces.flatMap((piece) => (piece.kind === 'group' && text[piece.from + 1] === '=' ? [piece] : []));
  return formulas.reduceRight((written, group) => {
    const formula = text.slice(group.from + 2, group.to - 1);
    const fixed = solidScriptBareMembersFormula(formula, sees, plain);
    return written.slice(0, group.from + 2) + fixed + written.slice(group.to - 1);
  }, text);
}

/**
 * Writes the member reads of one formula that need brackets with them.
 *
 * @param formula Formula without its [= and ].
 * @param sees Tells whether the line sees a variable of that name.
 * @param plain True also writes a variable read bare without members.
 * @returns Rewritten formula, the same when it cannot be read.
 */
function solidScriptBareMembersFormula(formula: string, sees: (name: string) => boolean, plain: boolean): string {
  let source: SolidScriptFormulaSource;
  try {
    source = SolidScriptFormulaSource.read(formula);
  } catch {
    return formula;
  }
  return solidScriptBareMembersFind(source, sees, plain)
    .sort((left, right) => right.from - left.from)
    .reduce((written, read) => `${written.slice(0, read.from)}[${read.name}]${written.slice(read.to)}`, formula);
}

/**
 * Finds the member reads of a formula that need brackets, outermost first; a
 * name a list comprehension binds is its own and left alone.
 *
 * @param source Formula read.
 * @param sees Tells whether the line sees a variable of that name.
 * @param plain True also finds a variable read bare without members.
 * @returns Member reads.
 */
function solidScriptBareMembersFind(
  source: SolidScriptFormulaSource,
  sees: (name: string) => boolean,
  plain: boolean,
): SolidScriptBareMember[] {
  const found: SolidScriptBareMember[] = [];
  const visit = (node: SolidScriptExpression, bound: ReadonlySet<string>): void => {
    const read =
      node.kind === 'member' || (plain && node.kind === 'variable')
        ? solidScriptBareMember(source, node, bound, sees, plain)
        : null;
    if (read) return void found.push(read);
    const names = node.kind === 'comprehension' ? node.bindings.map((binding) => solidScriptNameKey(binding.name)) : [];
    solidScriptExpressionChildren(node).forEach((child) => visit(child, new Set([...bound, ...names])));
  };
  visit(source.tree, new Set());
  return found;
}

/**
 * Reads a member chain, such as Edge.Start.X, as one that needs brackets: it
 * starts at a variable the line sees, written bare or as [Edge], and reads a
 * member other than .X, .Y or .Z; with plain, any bare read of such a
 * variable.
 *
 * @param source Formula read.
 * @param node Outermost member of the chain, or a bare variable read.
 * @param bound Names a list comprehension around it binds, folded.
 * @param sees Tells whether the line sees a variable of that name.
 * @param plain True also takes a bare read without members.
 * @returns The read to write in brackets, or null.
 */
function solidScriptBareMember(
  source: SolidScriptFormulaSource,
  node: Extract<SolidScriptExpression, { kind: 'member' | 'variable' }>,
  bound: ReadonlySet<string>,
  sees: (name: string) => boolean,
  plain: boolean,
): SolidScriptBareMember | null {
  const members: string[] = [];
  let part: SolidScriptExpression = node;
  for (; part.kind === 'member'; part = part.target) members.unshift(part.name);
  if (part.kind !== 'variable' || (part === node && source.slot(part))) return null;
  if (!plain && members.every((name) => SOLID_SCRIPT_BARE_AXES.has(solidScriptNameKey(name)))) return null;
  const root = source.slot(part) ? source.slice(part).slice(1, -1).trim() : part.name;
  if (!SOLID_SCRIPT_BARE_PLAIN.test(root) || bound.has(solidScriptNameKey(root)) || !sees(root)) return null;
  return { ...source.span(node), name: [root, ...members].join('.') };
}

/**
 * Lists every bracketed part of field text, those inside others too.
 *
 * @param pieces Pieces of the text.
 * @returns Bracketed parts.
 */
function solidScriptBareGroups(pieces: readonly SolidScriptFieldPiece[]): SolidScriptFieldGroupPiece[] {
  return pieces.flatMap((piece) => (piece.kind === 'group' ? [piece, ...solidScriptBareGroups(piece.pieces)] : []));
}

/**
 * Drops the $ from a [$Name] that names a variable the line sees and no system
 * value, such as [$Width] for [Width], [=[$Width] - 1] too: a $ marks only
 * system values, so the name with it reads nothing.
 *
 * @param text Field text.
 * @param sees Tells whether the line sees a variable of that name.
 * @param system Tells whether a name written with $ is a system value.
 * @returns Rewritten text, the same when there is nothing to drop.
 */
export function solidScriptMistakeUserDollars(
  text: string,
  sees: (name: string) => boolean,
  system: (name: string) => boolean,
): string {
  let groups: SolidScriptFieldGroupPiece[];
  try {
    groups = solidScriptBareGroups(solidScriptFieldPieces(text));
  } catch {
    return text;
  }
  return groups
    .map((group) => ({ group, name: SOLID_SCRIPT_BARE_DOLLAR.exec(text.slice(group.from + 1, group.to - 1).trim()) }))
    .filter(({ name }) => name !== null && sees(name[1]!) && !system(name[0]!))
    .sort((left, right) => right.group.from - left.group.from)
    .reduce(
      (written, { group, name }) => `${written.slice(0, group.from)}[${name![0]!.slice(1)}]${written.slice(group.to)}`,
      text,
    );
}
