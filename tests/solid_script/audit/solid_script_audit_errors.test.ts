import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptMistakeCheck, solidScriptUseCheck } from '@/solid_script/language/solid_script_use_check.js';
import { SOLID_SCRIPT_AUDIT_SAMPLES } from './solid_script_audit_accepts.test.js';
import {
  SOLID_SCRIPT_AUDIT_COMMANDS,
  SOLID_SCRIPT_AUDIT_PRELUDE,
  solidScriptAuditScript,
} from './solid_script_audit_lines.js';
import { solidScriptAuditFuzz } from './solid_script_audit_fuzz.js';

/** Odd things people type into a field. */
const ODD = [
  '',
  'abc',
  '-1',
  '0',
  '1e9',
  '[Missing]',
  '[=1/0]',
  '[=Foo(]',
  '[=Len(3)]',
  '1, 2',
  ' ',
  '[',
  ']',
  '[=]',
  'x(y',
  '[M]',
];

/** Words of the code behind the editor rather than of the person using it. */
const JARGON =
  /TypeError|Cannot read|undefined|\bnull\b|NaN|\[object|is not a function|Maximum call stack|\bexpression\b|\btoken\b|unexpected|\bexpected\b|\bparse\b|Whole Number|List of [A-Z]/;

/** Words that tell what to do instead. */
const HINT =
  /needs|must|\buse\b|write|such as|set it|takes|one of|Did you mean|is missing|is needed|only|between|instead|, not |no more than|at least|without|make one|give (it|one)|place it|check|move|Known here: |Parts: |Functions: |change|define|at most|count from|try|no members|it has \.|\bwrap\b/i;

/**
 * Tells the mistake a script stops with, for the given place.
 *
 * @param lines Script.
 * @returns Mistake, or an empty string.
 */
const mistake = (lines: readonly SolidScriptLine[]): string =>
  solidScriptProgramRun(solidScriptDocumentCreate(lines), { box: [4, 4, 4] }).error?.text ?? '';

/**
 * Tells the warnings the editor shows on a script before it runs, worded as
 * mistakes at their line.
 *
 * @param lines Script.
 * @returns Warnings.
 */
const warned = (lines: readonly SolidScriptLine[]): string[] => {
  const document = solidScriptDocumentCreate(lines);
  return [
    ...solidScriptKindCheck(document),
    ...solidScriptUseCheck(document),
    ...solidScriptMistakeCheck(document),
  ].map((warning) => `Line ${warning.line ?? 0}: ${warning.text.replace(/[^.?]$/, '$&.')}`);
};

/**
 * Tells the run mistake and editor warnings of a script.
 *
 * @param lines Script.
 * @returns Texts.
 */
const told = (lines: readonly SolidScriptLine[]): string[] => [mistake(lines), ...warned(lines)];

/**
 * Lists what is wrong with the wording of a mistake.
 *
 * @param text Mistake.
 * @returns Problems.
 */
function wording(text: string): string[] {
  if (text === '') return [];
  const problems: string[] = [];
  if (!/^Line \d+: /.test(text)) problems.push('names no line');
  if (JARGON.test(text)) problems.push(`jargon: ${JARGON.exec(text)![0]}`);
  if (!HINT.test(text)) problems.push('no hint');
  if (!/[.?]$/.test(text)) problems.push('no full stop');
  return problems.map((problem) => `${problem} in ${JSON.stringify(text)}`);
}

describe('every mistake is told in plain words, at a line, with what to do', { timeout: 60_000 }, () => {
  it.each(SOLID_SCRIPT_AUDIT_COMMANDS)('%s', (_id, command) => {
    const found = new Set<string>();
    for (const parameter of command.parameters) {
      for (const value of ODD)
        for (const problem of told(solidScriptAuditScript(command, { [parameter.key]: value }).lines).flatMap(wording))
          found.add(`${parameter.key}=${JSON.stringify(value)}: ${problem}`);
      if (parameter.writes) continue;
      for (const [kind, value] of SOLID_SCRIPT_AUDIT_SAMPLES) {
        const script = solidScriptAuditScript(command, { [parameter.key]: '[V]' });
        script.lines.splice(SOLID_SCRIPT_AUDIT_PRELUDE.length, 0, {
          command: 'variable',
          values: { name: 'V', value },
        });
        for (const problem of told(script.lines).flatMap(wording)) found.add(`${parameter.key}<${kind}: ${problem}`);
      }
    }
    expect([...found]).toEqual([]);
  });

  it('holds for random scripts', () => {
    const found = new Set<string>();
    for (let seed = 1; seed <= 1500; seed++)
      for (const problem of told(solidScriptAuditFuzz(seed)).flatMap(wording)) found.add(`seed ${seed}: ${problem}`);
    expect([...found]).toEqual([]);
  });
});
