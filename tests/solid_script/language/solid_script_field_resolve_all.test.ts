import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNamesUnknown } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';
import { SolidScriptMachine } from '@/solid_script/language/solid_script_machine.js';
import { solidScriptLineFieldMake } from '@/solid_script/language/solid_script_machine_runs.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { SolidScriptScope } from '@/solid_script/language/solid_script_scope.js';
import { solidScriptSystemValues } from '@/solid_script/language/solid_script_system.js';
import { solidScriptValueText } from '@/solid_script/language/solid_script_value.js';
import { solidScriptFieldAsTyped } from '@/solid_script/language/solid_script_field.js';

const MACHINE = new SolidScriptMachine(
  undefined,
  null,
  undefined,
  solidScriptSystemValues('generator', null, false),
  false,
);
const SCOPE = new SolidScriptScope(null);
SCOPE.variableDefine('v', '7');

const fields = solidScriptCommands.flatMap((command) =>
  command.parameters.map((parameter) => [`${command.id}.${parameter.key}`, parameter] as const),
);

describe('every field resolves [names] and [=formulas] through the shared field path', () => {
  it.each(fields.filter(([, parameter]) => !solidScriptFieldAsTyped(parameter)))('%s resolves', (_name, parameter) => {
    // What the field reads, or the mistake a kind it does not accept gives: either way the value 7, never the text typed.
    const read = (text: string): string => {
      try {
        return solidScriptValueText(MACHINE.fieldRead(solidScriptLineFieldMake(parameter, text), SCOPE));
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    for (const typed of ['[V]', '[=3 + 4]']) {
      expect(read(typed)).toMatch(/\b7\b/);
      expect(read(typed)).not.toContain(typed);
    }
  });

  it.each(fields.filter(([, parameter]) => solidScriptFieldAsTyped(parameter)))(
    '%s names a variable or is plain text, and stays as typed',
    (_n, parameter) => {
      expect(MACHINE.fieldRead(solidScriptLineFieldMake(parameter, '[V]'), SCOPE)).toBe('[V]');
    },
  );
});

describe('a shape Name reads names and formulas, and takes text or a number', () => {
  const henry = (width: SolidScriptLine): SolidScriptLine[] => [
    width,
    { command: 'sphere', values: { r: '1.3', label: '[Width]', into: 'Bla' } },
    { command: 'echo', values: { value: '[Bla.Name]' } },
  ];

  it('names the solid with the value of the variable', () => {
    const run = solidScriptProgramRun(
      solidScriptDocumentCreate(henry({ command: 'variable', values: { name: 'Width', value: '15' } })),
    );
    expect(run.error).toBeNull();
    expect(run.messages).toEqual(['15']);
    const formula = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'cube', values: { label: 'Post [=1 + 1]', into: 'P' } },
        { command: 'echo', values: { value: '[P.Name]' } },
      ]),
    );
    expect(formula.messages).toEqual(['Post 2']);
  });

  it('stops on a Solid in plain words, and the editor marks it', () => {
    const lines = henry({ command: 'cube', values: { into: 'Width' } });
    const run = solidScriptProgramRun(solidScriptDocumentCreate(lines));
    expect(run.error?.message).toMatch(/^line 2: Name needs a Text or Number, not a Solid/);
    expect(solidScriptKindCheck(solidScriptDocumentCreate(lines))).toEqual([
      expect.objectContaining({ line: 2, text: expect.stringMatching(/Name needs a Text or Number, not a Solid/) }),
    ]);
  });
});

describe('fields that used to be read as typed now read names', () => {
  it('picks faces by a Which held in a variable', () => {
    const run = solidScriptProgramRun(
      solidScriptDocumentCreate([
        { command: 'variable', values: { name: 'Side', value: 'Facing Up' } },
        { command: 'cube', values: { into: 'B' } },
        { command: 'select_faces', values: { which: '[Side]', of: '[B]', into: 'F' } },
        { command: 'echo', values: { value: '[F.Count]' } },
      ]),
    );
    expect(run.error).toBeNull();
    expect(run.messages).toEqual(['1']);
  });
});

describe('the editor checks every field that reads names, by the same declaration', () => {
  it('squiggles an unknown name in a Name, but not in an Into or a Note', () => {
    const document = solidScriptDocumentCreate([
      { command: 'cube', values: { label: '[Wdth]', into: '[Nope]' } },
      { command: 'note', values: { text: 'see [Missing]' } },
    ]);
    const unknown = solidScriptDocumentNamesUnknown(document);
    expect([...(unknown.get(0) ?? [])]).toEqual(['wdth']);
    expect(unknown.has(1)).toBe(false);
  });
});
