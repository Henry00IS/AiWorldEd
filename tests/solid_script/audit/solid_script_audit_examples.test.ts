import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate, type SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import {
  solidScriptDocumentDefines,
  solidScriptDocumentNamesAt,
  solidScriptDocumentNamesUnknown,
} from '@/solid_script/document/solid_script_document_names.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptMistakeCheck, solidScriptUseCheck } from '@/solid_script/language/solid_script_use_check.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { solidScriptUseSolidOf } from '../language/solid_script_use_solid.js';

const CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as const)));

/**
 * Tells the problem every field of the script shows when its line is opened.
 *
 * @param document Script.
 * @returns Line: problem per field with one.
 */
function fieldProblems(document: SolidScriptDocument): string[] {
  return document.blocks.flatMap((block, line) => {
    const command = solidScriptCommandFind(block.command);
    if (!command) return [`${line + 1}: no command ${block.command}`];
    const names = solidScriptDocumentNamesAt(document, line);
    return command.parameters.flatMap((parameter) => {
      const value = block.values[parameter.key] ?? parameter.default;
      const problem = solidScriptConfiguratorFieldBuild(parameter, value, () => {}, {
        names,
        extra: command.fills,
      }).problem();
      return problem ? [`${line + 1}: ${problem}`] : [];
    });
  });
}

/**
 * Finds any raw JSON object values stored in script lines or listed text.
 *
 * @param document Script.
 * @returns Offending line labels.
 */
function jsonLikeFields(document: SolidScriptDocument): string[] {
  const fromBlocks = document.blocks.flatMap((block, line) =>
    Object.entries(block.values).flatMap(([key, value]) =>
      /^\s*\{/.test(value) ? [`${line + 1}.${key}: ${value.slice(0, 40)}`] : [],
    ),
  );
  const fromListing = solidScriptDocumentListing(document).flatMap((line, index) =>
    /\{\s*"/.test(line) ? [`listing line ${index + 1}: ${line.slice(0, 40)}`] : [],
  );
  return [...fromBlocks, ...fromListing];
}

describe('every shipped example is clean in the run and in the editor', () => {
  it.each(SOLID_SCRIPT_EXAMPLES.map((example) => [example.id, example] as const))('%s', (_id, example) => {
    const document = solidScriptDocumentCreate(example.lines);
    expect(jsonLikeFields(document)).toEqual([]);
    const use =
      example.uses?.generator === false
        ? { use: { usage: 'Modifier' as const, solids: [solidScriptUseSolidOf(CORNERS)], faces: 6 } }
        : { box: [4, 4, 4] as const };
    const run = solidScriptProgramRun(document, use);
    expect(run.error?.message ?? '').toBe('');
    expect(run.warnings.map((warning) => warning.text)).toEqual([]);
    expect(run.shapes.length).toBeGreaterThan(0);
    expect(solidScriptUseCheck(document)).toEqual([]);
    expect(solidScriptMistakeCheck(document, solidScriptDocumentDefines(document))).toEqual([]);
    expect(solidScriptKindCheck(document).map((warning) => `${warning.line ?? 0}: ${warning.text}`)).toEqual([]);
    expect(
      [...solidScriptDocumentNamesUnknown(document)].map(([line, keys]) => `${line + 1}: ${[...keys].join(', ')}`),
    ).toEqual([]);
    expect(fieldProblems(document)).toEqual([]);
  });
});
