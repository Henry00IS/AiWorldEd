import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentInputLayout } from '@/solid_script/document/solid_script_document_inputs.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { SOLID_SCRIPT_SHAPE_NAME_KEY, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import { SOLID_SCRIPT_AUDIT_COMMANDS, solidScriptAuditScript } from './solid_script_audit_lines.js';

/**
 * Lists the labels of shapes and everything inside them.
 *
 * @param shapes Shapes.
 * @returns Labels.
 */
const labels = (shapes: readonly SolidScriptShape[]): string[] =>
  shapes.flatMap((shape) => [
    ...('label' in shape && typeof shape.label === 'string' ? [shape.label] : []),
    ...(shape.kind === 'boolean' ? labels(shape.children) : []),
  ]);

const named = SOLID_SCRIPT_AUDIT_COMMANDS.filter(([, command]) =>
  command.parameters.some((parameter) => parameter.key === SOLID_SCRIPT_SHAPE_NAME_KEY),
);

describe('the name given on a line shows up on what it builds', () => {
  it.each(named)('%s', (_id, command) => {
    for (const [written, shown] of [
      ['Audit Piece', 'Audit Piece'],
      ['[=Uppercase("audit")] [I]', 'AUDIT 2'],
    ] as const) {
      const script = solidScriptAuditScript(command, { [SOLID_SCRIPT_SHAPE_NAME_KEY]: written });
      const run = solidScriptProgramRun(solidScriptDocumentCreate(script.lines), { box: [4, 4, 4] });
      if (command.id === 'input') {
        // An Input's caption is read before the run, as typed.
        if (written.includes('[')) continue;
        expect(JSON.stringify(solidScriptDocumentInputLayout(solidScriptDocumentCreate(script.lines)))).toContain(
          written,
        );
        continue;
      }
      expect(run.error?.text ?? '').toBe('');
      expect(labels(run.shapes)).toContain(shown);
    }
  });
});
