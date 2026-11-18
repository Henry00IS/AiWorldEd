import { solidScriptDocumentUses, type SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptBlockNesting } from '@/solid_script/document/solid_script_document_indent.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptWarning } from './solid_script_machine_types.js';
import {
  SOLID_SCRIPT_MISTAKE_NAMES,
  SOLID_SCRIPT_MISTAKE_NUMERIC,
  solidScriptFieldMistakeNote,
} from './solid_script_field_mistakes.js';
import {
  SOLID_SCRIPT_TYPES,
  solidScriptTypeLiteral,
  solidScriptTypeProblem,
  solidScriptTypeValue,
} from './solid_script_types.js';
import { solidScriptFieldSplit } from './solid_script_field.js';
import { solidScriptNameKey } from './solid_script_name_key.js';

/**
 * A Box value written in a field or formula, such as [$Box.Width] or
 * box.size.x.
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
  // Per open block: whether a modifier runs its lines, and what it runs after an Else.
  const open: { runs: boolean; otherwise: boolean }[] = [];
  const runs = (): boolean => open.every((block) => block.runs);
  document.blocks.forEach((block, index) => {
    if (block.off === true) return;
    const nesting = solidScriptBlockNesting(block);
    if (nesting === 'close') return void open.pop();
    if (nesting === 'continue') {
      const top = open[open.length - 1];
      if (top) top.runs = top.otherwise;
      return;
    }
    if (runs()) {
      const found = Object.values(block.values)
        .map((text) => SOLID_SCRIPT_USE_CHECK_BOX.exec(text)?.[0])
        .find((match) => match !== undefined);
      if (found !== undefined) {
        const name = `Box.${found.slice(4, 5).toUpperCase()}${found.slice(5).toLowerCase()}`;
        warnings.push({
          line: index + 1,
          text: `Used As Modifier this line reads [$${name}], which only a generator has, so it reads 1; put it inside If Used As Generator.`,
        });
      }
    }
    if (nesting !== 'open') return;
    if (block.command === 'if_used_as') {
      const use = solidScriptCommandFind(block.command)?.valueText(block.values, 'use') ?? '';
      const modifier = use.toLowerCase() === 'modifier';
      open.push({ runs: modifier, otherwise: !modifier });
    } else open.push({ runs: true, otherwise: true });
  });
  return warnings;
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
  document.blocks.forEach((block, index) => {
    const command = block.off === true ? undefined : solidScriptCommandFind(block.command);
    for (const parameter of command?.parameters ?? []) {
      const text = block.values?.[parameter.key] ?? '';
      if (SOLID_SCRIPT_MISTAKE_NAMES.has(parameter.type) || text.trim() === '') continue;
      const note = solidScriptFieldMistakeNote(text, SOLID_SCRIPT_MISTAKE_NUMERIC.has(parameter.type), known);
      if (note !== '') warnings.push({ line: index + 1, text: `${parameter.label}: ${note}` });
    }
  });
  return warnings;
}

/**
 * Finds, without running the script, the Set lines whose value surely does not
 * fit the Type the variable was declared as, and Types that are no kind. Only
 * certain mismatches count: a value from [Name] or a formula is checked when it
 * runs.
 *
 * @param document Script.
 * @returns One warning per such line, in line order.
 */
export function solidScriptTypeCheck(document: SolidScriptDocument): SolidScriptWarning[] {
  const warnings: SolidScriptWarning[] = [];
  const declared = new Map<string, string>();
  document.blocks.forEach((block, index) => {
    if (block.off === true || block.command !== 'variable') return;
    const name = (block.values['name'] ?? '').trim();
    const type = (block.values['type'] ?? '').trim();
    const warn = (text: string): number => warnings.push({ line: index + 1, text });
    if (type !== '' && !SOLID_SCRIPT_TYPES.includes(type))
      return void warn(`Type must be one of ${SOLID_SCRIPT_TYPES.join(', ')}, not "${type}".`);
    const kept = type || declared.get(solidScriptNameKey(name));
    if (type === 'Any') declared.delete(solidScriptNameKey(name));
    else if (type !== '') declared.set(solidScriptNameKey(name), type);
    const text = block.values['value'] ?? '';
    // Read the way the line runs it, only from what is written without brackets.
    const value = solidScriptTypeValue(
      type,
      text,
      () => solidScriptTypeLiteral(text),
      () => solidScriptFieldSplit(text, ',').map(solidScriptTypeLiteral),
    );
    const unknown = value === undefined || (Array.isArray(value) && value.includes(undefined));
    const problem = kept && !unknown ? solidScriptTypeProblem(name, kept, value) : '';
    if (problem) warn(`${problem}.`);
  });
  return warnings;
}
