import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentLinesToggle } from '@/solid_script/document/solid_script_document_edit.js';
import { solidScriptDocumentInputLayout } from '@/solid_script/document/solid_script_document_inputs.js';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';
import {
  solidScriptDocumentNames,
  solidScriptDocumentNamesUnknown,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptDocumentFlowEnd } from '@/solid_script/document/solid_script_document_flow.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptExplorerEntries } from '@/solid_script/ui/solid_script_editor_explorer.js';
import { SOLID_SCRIPT_AUDIT_COMMANDS, solidScriptAuditScript } from './solid_script_audit_lines.js';
import { solidScriptAuditFuzz, solidScriptAuditRandom } from './solid_script_audit_fuzz.js';

/** Removes the "line N:" a message starts with, as lines move when others go. */
const unlined = (text: string): string => text.replace(/\bline \d+\b/gi, 'line');

/**
 * Tells everything the editor and a run make of a script, without line numbers.
 *
 * @param document Script.
 * @returns What each consumer sees.
 */
function seen(document: SolidScriptDocument): Record<string, unknown> {
  const run = solidScriptProgramRun(document);
  const flow = [...solidScriptDocumentFlowEnd(document)].map(
    ([key, variable]) => `${key}:${[...variable.kinds].sort().join('|')}`,
  );
  return {
    messages: run.messages,
    shapes: run.shapes.length,
    warnings: run.warnings.map((warning) => unlined(warning.text)),
    error: unlined(run.error?.message ?? ''),
    names: solidScriptDocumentNames(document).map(
      (entry) => `${entry.category}:${entry.name}:${(entry.kinds ?? []).join('|')}`,
    ),
    checks: solidScriptKindCheck(document).map((warning) => warning.text),
    unknown: [...solidScriptDocumentNamesUnknown(document).values()].flatMap((keys) => [...keys]),
    flow: flow.sort(),
    explorer: solidScriptExplorerEntries(document, [], []).map((entry) => `${entry.name}:${entry.type}`),
    inputs: JSON.stringify(solidScriptDocumentInputLayout(document), (key, value: unknown) =>
      key === 'line' ? undefined : value,
    ),
  };
}

/**
 * Turns lines off and checks the script is seen exactly as if they were gone.
 *
 * @param document Script.
 * @param lines Lines to turn off.
 */
function expectOffIsGone(document: SolidScriptDocument, lines: readonly number[]): void {
  const off = solidScriptDocumentLinesToggle(document, lines).document;
  const gone = solidScriptDocumentCreate(
    off.blocks.filter((block) => block.off !== true).map(({ command, values }) => ({ command, values })),
  );
  expect(seen(off)).toEqual(seen(gone));
}

describe('a line that is off is ignored by every part of the editor and the run', () => {
  it.each(SOLID_SCRIPT_AUDIT_COMMANDS)('%s', (_id, command) => {
    const { lines, at } = solidScriptAuditScript(command);
    expectOffIsGone(solidScriptDocumentCreate(lines), [at]);
  });

  it('holds for random lines of random scripts', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const lines = solidScriptAuditFuzz(seed);
      const random = solidScriptAuditRandom(seed * 7);
      const picked = [Math.floor(random() * lines.length), Math.floor(random() * lines.length)];
      expectOffIsGone(solidScriptDocumentCreate(lines), picked);
    }
  });
});
