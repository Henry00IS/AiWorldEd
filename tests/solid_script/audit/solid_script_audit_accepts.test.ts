import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';
import { solidScriptKindAccepted } from '@/solid_script/language/solid_script_kinds.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import {
  SOLID_SCRIPT_AUDIT_COMMANDS,
  SOLID_SCRIPT_AUDIT_PRELUDE,
  solidScriptAuditScript,
} from './solid_script_audit_lines.js';

/** A value of every kind, as a Set line writes it from the prelude's names. */
export const SOLID_SCRIPT_AUDIT_SAMPLES: readonly (readonly [string, string])[] = [
  ['Number', '2'],
  ['Text', 'abc'],
  ['Yes/No', 'Yes'],
  ['Vector', '[1, 2, 3]'],
  ['Solid', '[B]'],
  ['Face', '[F.First]'],
  ['Edge', '[E.First]'],
  ['Vertex', '[P.First]'],
  ['Face List', '[F]'],
  ['Number List', '4, 5, 6, 7'],
  ['Text List', 'a, b'],
];

/** What a crash, rather than a plain mistake, looks like in a message. */
const CRASH = /TypeError|Cannot read|undefined|is not a function|\[object|NaN|Maximum call stack/;

const fields = SOLID_SCRIPT_AUDIT_COMMANDS.flatMap(([id, command]) =>
  command.parameters
    .filter((parameter) => !parameter.writes)
    .map((parameter) => [`${id}.${parameter.key}`, command, parameter] as const),
);

describe('every field takes exactly the kinds it declares, at runtime and in the editor', () => {
  it.each(fields)('%s', (_name, command, parameter) => {
    for (const [kind, value] of SOLID_SCRIPT_AUDIT_SAMPLES) {
      const script = solidScriptAuditScript(command, { [parameter.key]: '[V]' });
      script.lines.splice(SOLID_SCRIPT_AUDIT_PRELUDE.length, 0, { command: 'variable', values: { name: 'V', value } });
      const line = script.at + 2;
      const document = solidScriptDocumentCreate(script.lines);
      const message = solidScriptProgramRun(document).error?.message ?? '';
      const flagged = solidScriptKindCheck(document).some((warning) => warning.line === line);
      const mismatch = new RegExp(`^line ${line}: ${parameter.label} needs .*, not an? ${kind}(:|$)`);
      expect(message, kind).not.toMatch(CRASH);
      if (solidScriptKindAccepted(parameter.accepts, kind)) {
        expect(message, kind).not.toMatch(mismatch);
        expect(flagged, `${kind} is squiggled though the field takes it`).toBe(false);
      } else {
        expect(message, kind).toMatch(mismatch);
        expect(flagged, `${kind} is not squiggled though it stops the line`).toBe(true);
      }
    }
  });
});
