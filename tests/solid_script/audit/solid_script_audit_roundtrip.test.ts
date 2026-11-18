import { describe, expect, it } from 'vitest';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentLineSet } from '@/solid_script/document/solid_script_document_edit.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { solidScriptFileDecode, solidScriptFileEncode } from '@/solid_script/file/solid_script_file.js';
import {
  solidScriptEditorClipboardParse,
  solidScriptEditorClipboardText,
} from '@/solid_script/ui/solid_script_editor_clipboard.js';
import { SolidScriptEditorHistory } from '@/solid_script/ui/solid_script_editor_history.js';
import { SOLID_SCRIPT_AUDIT_COMMANDS } from './solid_script_audit_lines.js';

/**
 * Field text with everything that could get lost on the way: brackets, escapes,
 * quotes, commas, lines and other scripts.
 */
const TRICKY = ' [A] $[x$] $$ "q" \'s\' a$, b, [=Len("é, 🙂")] \\ \n next ';

/**
 * What a script holds that must survive: its lines with their values and off
 * flags.
 */
const held = (document: SolidScriptDocument): unknown =>
  document.blocks.map(({ command, values, off }) => ({ command, values, off: off === true }));

describe('every field value of every command survives copy, paste, save, load, undo and redo', () => {
  it.each(SOLID_SCRIPT_AUDIT_COMMANDS)('%s', async (_id, command) => {
    const values = Object.fromEntries(
      command.parameters.map((parameter, index) => [parameter.key, `${index}${TRICKY}`]),
    );
    const document = solidScriptDocumentCreate([
      { command: command.id, values },
      { command: command.id, values: {}, off: true },
    ]);
    const lines = document.blocks.map(({ command: id, values: typed, off }) => ({
      command: id,
      values: typed,
      ...(off ? { off } : {}),
    }));
    expect(solidScriptEditorClipboardParse(solidScriptEditorClipboardText(lines))).toEqual(lines);
    expect(held(await solidScriptFileDecode(await solidScriptFileEncode(document)))).toEqual(held(document));
    expect(held(solidScriptDocumentNormalize(JSON.parse(JSON.stringify(document))))).toEqual(held(document));
    const history = new SolidScriptEditorHistory();
    const edited = solidScriptDocumentLineSet(document, 0, {
      ...document.blocks[0]!,
      values: { ...values, extra: 'changed' },
    });
    history.record(document, edited);
    const undone = history.undo(edited)!;
    expect(held(undone)).toEqual(held(document));
    expect(held(history.redo(undone)!)).toEqual(held(edited));
    for (const shown of solidScriptDocumentListing(document)) expect(shown).not.toMatch(/undefined|\[object|NaN/);
  });
});
