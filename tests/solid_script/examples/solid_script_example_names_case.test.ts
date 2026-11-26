import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentEvent } from '@/solid_script/document/solid_script_document_event.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

/** A $Persistent or $Local member written with a small first letter. */
const SOLID_SCRIPT_LOWER_MEMBER = /\$(persistent|local)\.[a-z]\w*/gi;

describe('example scripts', () => {
  it('write $Persistent and $Local members in PascalCase', () => {
    const lower = SOLID_SCRIPT_EXAMPLES.flatMap((example) =>
      [...JSON.stringify(example.lines).matchAll(SOLID_SCRIPT_LOWER_MEMBER)]
        .map((match) => match[0])
        .filter((name) => !/^\$(Persistent|Local)\.[A-Z]/.test(name))
        .map((name) => `${example.id}: ${name}`),
    );
    expect(lower).toEqual([]);
  });

  it('show the Widget Showcase page in the variable viewer as $Persistent.Page after a press', () => {
    const showcase = SOLID_SCRIPT_EXAMPLES.find((example) => example.id === 'widgetShowcase')!;
    const script = solidScriptDocumentCreate([...showcase.lines]);
    const pressed = solidScriptDocumentEvent(script, { kind: 'button', name: 'PickPlace' }, {}, null, {});
    const run = solidScriptProgramRun(script, { inputs: pressed.next, persistent: pressed.persistent });
    const names = run.variables.map((variable) => variable.name).filter((name) => /^\$persistent\./i.test(name));
    expect(names).toEqual(['$Persistent.Page']);
  });
});
