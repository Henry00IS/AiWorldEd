import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentActiveLines } from '@/solid_script/document/solid_script_document_active.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptWarning } from './solid_script_machine_types.js';
import { solidScriptFieldMistakeOf } from './solid_script_field_mistakes.js';
import {
  solidScriptDocumentNamesAt,
  solidScriptFieldKnown,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptNameKey } from './solid_script_name_key.js';

/**
 * A Box member written in a field or formula, such as [$Box.Position] or
 * Box.Size.X.
 */
const SOLID_SCRIPT_BOX_MEMBER = /\bBox\.(Width|Depth|Height|Size|Extents|Min|Max|Position|Rotation|Scale)\b/gi;

/**
 * Finds, without running the script, the lines a modifier would run that used
 * to be warned about for reading a Box value. Box values come from the
 * generator or the modifier volume, so a modifier may read them and this check
 * reports none.
 *
 * @param _document Script.
 * @returns No warnings.
 */
export function solidScriptUseCheck(_document: SolidScriptDocument): SolidScriptWarning[] {
  return [];
}

/**
 * Tells whether any active line of a script reads a Box member, such as
 * Position or Rotation, including a part such as Box.Position.X.
 *
 * @param document Script.
 * @param member Official member name, such as Position.
 * @returns True when a running line reads it.
 */
export function solidScriptDocumentReadsBoxMember(document: SolidScriptDocument, member: string): boolean {
  const wanted = member.toLowerCase();
  for (const { block } of solidScriptDocumentActiveLines(document.blocks)) {
    for (const text of Object.values(block.values ?? {})) {
      for (const found of text.matchAll(SOLID_SCRIPT_BOX_MEMBER)) if (found[1]?.toLowerCase() === wanted) return true;
    }
  }
  return false;
}

/**
 * Finds, without running the script, the fields with a common mistake, for the
 * editor, with the variables each line sees. Lines that are off are skipped.
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
    const sees = solidScriptMistakeSees(document, index);
    for (const parameter of command?.parameters ?? []) {
      const text = block.values?.[parameter.key] ?? '';
      const note = solidScriptFieldMistakeOf(parameter, text, known, sees);
      if (note !== '') warnings.push({ line: index + 1, text: `${parameter.label}: ${note}` });
    }
  }
  return warnings;
}

/**
 * Tells whether a line surely sees a variable of a name: one a line above it
 * writes, or the Item of a loop it is in, worked out only when first asked. A
 * name only a line below writes is left out, since it may not be set yet.
 *
 * @param document Script.
 * @param line 0-based line.
 * @returns Test by name, in any case.
 */
function solidScriptMistakeSees(document: SolidScriptDocument, line: number): (name: string) => boolean {
  let names: ReadonlySet<string> | null = null;
  return (name) => {
    names ??= solidScriptFieldKnown(
      solidScriptDocumentNamesAt(document, line).filter((entry) => entry.line < line),
      [],
    ).names;
    return names.has(solidScriptNameKey(name));
  };
}
