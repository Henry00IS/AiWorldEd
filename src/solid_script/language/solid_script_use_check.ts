import {
  solidScriptDocumentUses,
  type SolidScriptBlock,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentActiveLines } from '@/solid_script/document/solid_script_document_active.js';
import { solidScriptBlockNesting } from '@/solid_script/document/solid_script_document_indent.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptWarning } from './solid_script_machine_types.js';
import { solidScriptFieldMistakeOf } from './solid_script_field_mistakes.js';

/**
 * A Box value written in a field or formula, such as [$Box.Width] or
 * Box.Size.X.
 */
const SOLID_SCRIPT_USE_CHECK_BOX = /\bBox\.(Width|Depth|Height|Size)\b/i;

/**
 * Finds, without running the script, the lines a modifier would run that read a
 * Box value, which only a generator has. It follows If Used As and its Else and
 * skips lines that are off; a script that cannot be used as a modifier has
 * none.
 *
 * @param document Script.
 * @returns One warning per such line, in line order.
 */
export function solidScriptUseCheck(document: SolidScriptDocument): SolidScriptWarning[] {
  if (!solidScriptDocumentUses(document).modifier) return [];
  const warnings: SolidScriptWarning[] = [];
  const open: SolidScriptUseCheckBlock[] = [];
  for (const { block, line: index } of solidScriptDocumentActiveLines(document.blocks)) {
    const nesting = solidScriptBlockNesting(block);
    const top = open.at(-1);
    if (nesting === 'close') open.pop();
    if (nesting === 'continue' && top) top.runs = top.otherwise;
    if (nesting === 'close' || nesting === 'continue') continue;
    const warning = open.every((entry) => entry.runs) ? solidScriptUseCheckBox(block, index) : undefined;
    if (warning) warnings.push(warning);
    if (nesting === 'open') open.push(solidScriptUseCheckOpen(block));
  }
  return warnings;
}

/**
 * An open block: whether a modifier runs its lines, and what it runs after an
 * Else.
 */
interface SolidScriptUseCheckBlock {
  runs: boolean;
  readonly otherwise: boolean;
}

/**
 * Tells whether a modifier runs the lines of a block it opens: If Used As
 * Modifier runs them and not its Else, If Used As Generator the other way
 * round.
 *
 * @param block Line that opens a block.
 * @returns The open block.
 */
function solidScriptUseCheckOpen(block: SolidScriptBlock): SolidScriptUseCheckBlock {
  if (block.command !== 'if_used_as') return { runs: true, otherwise: true };
  const use = solidScriptCommandFind(block.command)?.valueText(block.values, 'use') ?? '';
  const modifier = use.toLowerCase() === 'modifier';
  return { runs: modifier, otherwise: !modifier };
}

/**
 * Warns about a line a modifier runs that reads a Box value.
 *
 * @param block Line.
 * @param index 0-based line.
 * @returns Warning, or nothing when it reads none.
 */
function solidScriptUseCheckBox(block: SolidScriptBlock, index: number): SolidScriptWarning | undefined {
  const found = Object.values(block.values)
    .map((text) => SOLID_SCRIPT_USE_CHECK_BOX.exec(text)?.[0])
    .find((match) => match !== undefined);
  if (found === undefined) return undefined;
  const name = `Box.${found.slice(4, 5).toUpperCase()}${found.slice(5).toLowerCase()}`;
  return {
    line: index + 1,
    text: `Used As Modifier this line reads [$${name}], which only a generator has, so it reads 1; put it inside If Used As Generator.`,
  };
}

/**
 * Finds, without running the script, the fields with a common mistake, for the
 * editor. Lines that are off are skipped.
 *
 * @param document Script.
 * @param known Tells whether the script defines a name.
 * @returns One warning per field, in line order.
 */
export function solidScriptMistakeCheck(
  document: SolidScriptDocument,
  known: (name: string) => boolean = () => false,
): SolidScriptWarning[] {
  const warnings: SolidScriptWarning[] = [];
  for (const { block, line: index } of solidScriptDocumentActiveLines(document.blocks)) {
    const command = solidScriptCommandFind(block.command);
    for (const parameter of command?.parameters ?? []) {
      const text = block.values?.[parameter.key] ?? '';
      const note = solidScriptFieldMistakeOf(parameter, text, known);
      if (note !== '') warnings.push({ line: index + 1, text: `${parameter.label}: ${note}` });
    }
  }
  return warnings;
}
