import { describe, expect, it } from 'vitest';
import { ZipReader } from '@/io/zip/zip_reader.js';
import {
  SOLID_SCRIPT_FILE_ENTRY,
  solidScriptFileDecode,
  solidScriptFileEncode,
} from '@/solid_script/file/solid_script_file.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentResourcesWith,
  solidScriptResourceNameFree,
  solidScriptResourceText,
  solidScriptResourcesNormalize,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';
import { solidScriptFormulaTextBlock } from '@/solid_script/language/solid_script_formula_field.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** Words that cover the edges a text resource must keep. */
const EDGES = {
  Empty: '',
  Spaces: '   \t  \n  ',
  Lines: 'first line\nsecond line\n',
  Variable: 'use [$Local.X] as typed',
  Escapes: 'brackets $[ and $] and $$ and $"',
  Quotes: 'He said "hello" and \'there\' and [1, 2]',
  Unicode: 'café 日本語 🎉',
  Ends: '  leading and trailing  \n',
} as const;

/**
 * Makes a script that holds text resources and echoes values.
 *
 * @param resources Resources.
 * @param values Echo values.
 * @returns Script.
 */
function script(resources: readonly SolidScriptResource[], ...values: string[]): SolidScriptDocument {
  return solidScriptDocumentResourcesWith(
    solidScriptDocumentCreate([
      ...values.map((value) => ({ command: 'echo', values: { value } })),
      { command: 'cube' },
    ]),
    resources,
  );
}

/**
 * Runs a script and returns its Echo messages, or the error.
 *
 * @param document Script.
 * @returns Messages, or the error.
 */
function run(document: SolidScriptDocument): string[] | string {
  const result = solidScriptProgramRun(document);
  return result.error ? result.error.message : result.messages;
}

/**
 * Reads a zip entry as text.
 *
 * @param file Zip file.
 * @param name Entry name.
 * @returns Text.
 */
async function entryText(file: Blob, name: string): Promise<string> {
  const zip = await ZipReader.open(file);
  const entry = zip.entry(name);
  if (!entry) throw new Error(`Expected ${name}`);
  return (await zip.read(entry)).text();
}

describe('Text resources', () => {
  it('reads empty, whitespace, multi-line, unicode and ending spaces as typed', () => {
    const resources = Object.entries(EDGES).map(([name, text]) => solidScriptResourceText(name, text));
    const messages = run(script(resources, ...resources.map((resource) => `[$Resources.${resource.name}]`)));
    expect(messages).toEqual(Object.values(EDGES));
  });

  it('keeps [$Local.X] and $[ escapes as words, even when a variable of that name exists', () => {
    const resources = [
      solidScriptResourceText('Note', EDGES.Variable),
      solidScriptResourceText('Escapes', EDGES.Escapes),
    ];
    const document = solidScriptDocumentResourcesWith(
      solidScriptDocumentCreate([
        { command: 'variable', values: { name: 'X', value: '99' } },
        { command: 'echo', values: { value: '[$Resources.Note]' } },
        { command: 'echo', values: { value: '[$Resources.Escapes]' } },
        { command: 'echo', values: { value: '[X]' } },
        { command: 'cube' },
      ]),
      resources,
    );
    expect(run(document)).toEqual(['use [$Local.X] as typed', 'brackets $[ and $] and $$ and $"', '99']);
  });

  it('gives the same words a Text block would, including brackets and dollar signs', () => {
    const words = '  hello [$Local.X] and $[keep] and "quotes"  ';
    const resource = run(script([solidScriptResourceText('Note', words)], '[$Resources.Note]'));
    const block = run(script([], `[=${solidScriptFormulaTextBlock(words)}]`));
    expect(resource).toEqual(block);
    expect(resource).toEqual([words]);
  });

  it('offers Length and Words of the stored text, counting spaces and ignoring empty words', () => {
    const note = solidScriptResourceText('Note', '  alpha  beta\n');
    expect(run(script([note], '[$Resources.Note.Length]', '[$Resources.Note.Words]'))).toEqual(['14', '[alpha, beta]']);
    expect(run(script([solidScriptResourceText('Empty', '')], '[$Resources.Empty.Length]'))).toEqual(['0']);
  });

  it('saves and loads each text as resources/Name.txt, byte for byte', async () => {
    const resources = Object.entries(EDGES).map(([name, text]) => solidScriptResourceText(name, text));
    const document = script(resources, '[$Resources.Variable]');
    const file = await solidScriptFileEncode(document);
    const listed = JSON.parse(await entryText(file, SOLID_SCRIPT_FILE_ENTRY)) as {
      resources: { path: string; type: string; name: string; kind: string }[];
    };
    expect(listed.resources).toEqual(
      resources.map((resource) => ({
        path: `resources/${resource.name}.txt`,
        type: 'text/plain',
        name: resource.name,
        kind: 'Text',
      })),
    );
    for (const resource of resources)
      expect(await entryText(file, `resources/${resource.name}.txt`)).toBe(resource.text);
    const loaded = await solidScriptFileDecode(file);
    expect(loaded.resources).toEqual(resources);
    expect(run(loaded)).toEqual(['use [$Local.X] as typed']);
  });

  it('does not parse a text file as JSON, even when the words look like JSON or a resource', async () => {
    const text = '{ "kind": "Curve", "name": "Fake" }\n[$Resources.Other]';
    const document = script([solidScriptResourceText('Note', text)], '[$Resources.Note]');
    const loaded = await solidScriptFileDecode(await solidScriptFileEncode(document));
    expect(loaded.resources).toEqual([solidScriptResourceText('Note', text)]);
    expect(run(loaded)).toEqual([text]);
  });

  it('drops a text with a broken name and keeps an empty one', () => {
    expect(
      solidScriptResourcesNormalize([
        { name: '1bad', kind: 'Text', text: 'x' },
        { name: 'Ok', kind: 'Text' },
        solidScriptResourceText('Kept', ''),
        { name: 'Also', kind: 'Text', text: '  hi  ' },
      ]),
    ).toEqual([solidScriptResourceText('Kept', ''), solidScriptResourceText('Also', '  hi  ')]);
  });

  it('leaves a script without resources unchanged, and names a new text freely', () => {
    expect('resources' in solidScriptDocumentNormalize({ blocks: [] })).toBe(false);
    expect(solidScriptResourceNameFree([solidScriptResourceText('Text', '')], 'Text')).toBe('Text2');
  });

  it('works on a copy, so editing a run does not change the stored words', () => {
    const document = script([solidScriptResourceText('Note', 'hello')]);
    expect(run(document)).toEqual([]);
    expect(document.resources).toEqual([solidScriptResourceText('Note', 'hello')]);
  });
});
