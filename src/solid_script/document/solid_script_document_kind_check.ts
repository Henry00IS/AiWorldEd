import type { SolidScriptDocument } from './solid_script_document.js';
import { solidScriptDocumentActiveLines } from './solid_script_document_active.js';
import { solidScriptDocumentFlowAt } from './solid_script_document_flow.js';
import { solidScriptFlowFormulaProblems } from './solid_script_document_flow_formula.js';
import {
  solidScriptFlowMember,
  solidScriptFlowValueKinds,
  SOLID_SCRIPT_FLOW_UNKNOWN,
  type SolidScriptFlowHead,
} from './solid_script_document_flow_kinds.js';
import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptParameterApplies } from '@/solid_script/commands/solid_script_command_parameters.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptFieldSplit } from '@/solid_script/language/solid_script_field.js';
import { solidScriptKindAccepted, solidScriptKindMismatch } from '@/solid_script/language/solid_script_kinds.js';
import type { SolidScriptWarning } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptMemberNames } from '@/solid_script/language/solid_script_members.js';

/**
 * Finds, without running the script, the values no run can use, from what each
 * command and built-in function declares it accepts: a field given a value
 * whose every possible kind it does not accept, a member no possible kind has,
 * and a formula function given a value it cannot use. Where any way through the
 * script may give a usable value, nothing is said.
 *
 * @param document Script.
 * @returns Warnings, with 1-based lines.
 */
export function solidScriptKindCheck(document: SolidScriptDocument): SolidScriptWarning[] {
  const warnings: SolidScriptWarning[] = [];
  for (const { block, line } of solidScriptDocumentActiveLines(document.blocks)) {
    const command = solidScriptCommandFind(block.command);
    if (!command) continue;
    const state = solidScriptDocumentFlowAt(document, line);
    const head: SolidScriptFlowHead = (key) => [...(state.get(key)?.kinds ?? [])];
    for (const parameter of command.parameters) {
      const text = block.values[parameter.key] ?? '';
      if (text.trim() === '' || parameter.writes) continue;
      if (!solidScriptParameterApplies(parameter, block.values, command.parameters)) continue;
      for (const problem of solidScriptKindProblems(parameter, text, head))
        warnings.push({ line: line + 1, text: problem });
    }
  }
  return warnings;
}

/**
 * Lists what no run can use in one field.
 *
 * @param parameter Field.
 * @param text Field text.
 * @param head Kinds the script's names may hold at the line.
 * @returns Messages.
 */
function solidScriptKindProblems(
  parameter: SolidScriptCommandParameter,
  text: string,
  head: SolidScriptFlowHead,
): string[] {
  const problems = [...solidScriptKindMembers(text, head)];
  for (const formula of text.match(/\[=(?:[^[\]]|\[[^[\]]*\])*\]/g) ?? [])
    problems.push(...solidScriptFlowFormulaProblems(formula.slice(1, -1), head));
  if (parameter.accepts === 'Any' || problems.length > 0) return problems;
  if (solidScriptFieldSplit(text.trim(), ',').length > 1 && parameter.type !== 'value') return problems;
  const kinds = solidScriptFlowValueKinds(text, head);
  if (kinds.length === 0 || kinds.includes(SOLID_SCRIPT_FLOW_UNKNOWN)) return problems;
  if (kinds.some((kind) => solidScriptKindAccepted(parameter.accepts, kind))) return problems;
  return [solidScriptKindMismatch(parameter.label, parameter.accepts, kinds.join(' or '))];
}

/**
 * Finds [Name.Member] references whose member no kind the name may hold has,
 * such as [Henry.Faces] where Henry is surely text.
 *
 * @param text Field text.
 * @param head Kinds the script's names may hold at the line.
 * @returns Messages.
 */
function solidScriptKindMembers(text: string, head: SolidScriptFlowHead): string[] {
  return [...text.matchAll(/(?<!\$)\[([A-Za-z_][\w.() ]*)\]/g)].flatMap(([, path]) => {
    const missing = solidScriptKindMemberMissing(path ?? '', head);
    return missing === undefined ? [] : [missing];
  });
}

/**
 * Tells the members values of some kinds have, as a run tells them.
 *
 * @param kinds Kinds.
 * @returns Words, such as "it has .Count, .First".
 */
function solidScriptKindMembersTold(kinds: readonly string[]): string {
  const names = [...new Set(kinds.flatMap((kind) => solidScriptMemberNames(kind === 'List' ? 'Any List' : kind)))];
  return names.length === 0 ? 'it has no members' : `it has ${names.map((name) => `.${name}`).join(', ')}`;
}

/**
 * Follows a name through its members and tells the first member no kind the
 * value may hold has.
 *
 * @param path Name without brackets, such as Henry.Faces.
 * @param head Kinds the script's names may hold at the line.
 * @returns Message, or nothing when every member may be there.
 */
function solidScriptKindMemberMissing(path: string, head: SolidScriptFlowHead): string | undefined {
  const parts = path.split('.');
  if (parts.length > 1 && /^(local|persistent)$/i.test(parts[0] ?? '')) parts.splice(0, 2, `${parts[0]}.${parts[1]}`);
  if (/\(.*\)$/.test(parts[0] ?? '')) return undefined;
  let kinds = [...head((parts[0] ?? '').toLowerCase())];
  for (const [index, part] of parts.slice(1).entries()) {
    if (kinds.length === 0 || kinds.includes(SOLID_SCRIPT_FLOW_UNKNOWN)) return undefined;
    const next = solidScriptFlowMember(kinds, part);
    const member = part.replace(/\s*\(.*\)$/, '');
    if (next.length === 0)
      return `[${parts.slice(0, index + 1).join('.')}] holds ${kinds.join(' or ')}, which has no .${member}; ${solidScriptKindMembersTold(kinds)}`;
    kinds = next;
  }
  return undefined;
}
