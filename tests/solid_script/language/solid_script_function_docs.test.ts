import { describe, expect, it } from 'vitest';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
  solidScriptFunctionInputsLeast,
} from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptFormulaCatalog } from '@/solid_script/commands/solid_script_formula_commands.js';
import { SOLID_SCRIPT_FORMULA_COMMAND } from '@/solid_script/commands/solid_script_formula_groups.js';
import { solidScriptFormulaProblem } from '@/solid_script/language/solid_script_formula_bare.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/**
 * Every doc text of the built-in functions and the formula blocks: summaries,
 * input notes, descriptions, manuals, field hints and stops.
 *
 * @returns Texts.
 */
function docTexts(): string[] {
  const texts: string[] = [];
  for (const [key, doc] of Object.entries(SOLID_SCRIPT_FUNCTION_DOCS))
    texts.push(doc.summary, ...solidScriptFunctionArguments(key).map((input) => input.about));
  for (const command of solidScriptFormulaCatalog({ each: 'Face' }).commands) {
    texts.push(command.description, command.details, ...command.stops);
    texts.push(...command.parameters.map((parameter) => parameter.hint));
  }
  return [...new Set(texts)];
}

/**
 * How each built-in function is called, with the names of its inputs, which is
 * no formula to run.
 */
const SOLID_SCRIPT_FUNCTION_USAGES: ReadonlySet<string> = new Set(
  Object.values(SOLID_SCRIPT_FUNCTION_DOCS).map((doc) => doc.usage),
);

/**
 * The calls written in a text with what it says they give, such as Sum([1, 2,
 * 3]) and 6.
 *
 * @param text Doc text.
 * @returns Each call and the result after its "is", or null.
 */
function docCalls(text: string): { call: string; result: string | null }[] {
  const found: { call: string; result: string | null }[] = [];
  let at = 0;
  for (const match of text.matchAll(/\b[A-Z][A-Za-z0-9]*\(/g)) {
    if (match.index < at) continue;
    let depth = 0;
    at = match.index;
    while (at < text.length && (text[at] !== ')' || --depth > 0)) depth += text[at++] === '(' ? 1 : 0;
    const call = text.slice(match.index, ++at);
    if (call.includes('...') || SOLID_SCRIPT_FUNCTION_USAGES.has(call)) continue;
    const result = /^ is (.*?)(?:;|\.(?:\s|$)|$)/.exec(text.slice(at))?.[1] ?? null;
    found.push({ call, result });
  }
  return found;
}

/**
 * Runs one formula in an Echo line.
 *
 * @param formula Formula as typed inside [= ].
 * @returns Echoed text, or null when it stops the script.
 */
function echo(formula: string): string | null {
  const lines: SolidScriptLine[] = [
    { command: 'echo', values: { value: `[=${formula}]` } },
    { command: 'cube', values: {} },
  ];
  const run = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  return run.error ? null : run.messages[0]!;
}

describe('SolidScript function docs', () => {
  it('counts the inputs a function cannot do without', () => {
    expect(solidScriptFunctionInputsLeast('clamp')).toBe(3);
    expect(solidScriptFunctionInputsLeast('abs')).toBe(1);
    expect(solidScriptFunctionInputsLeast('pad_left')).toBe(2);
    expect(solidScriptFunctionInputsLeast('noise')).toBe(1);
    expect(solidScriptFunctionInputsLeast('max')).toBe(1);
    expect(solidScriptFunctionInputsLeast('pick')).toBe(2);
  });

  it('asks for at least one input, but none of List, and never more than a function has', () => {
    for (const key of Object.keys(SOLID_SCRIPT_FUNCTION_DOCS)) {
      const least = solidScriptFunctionInputsLeast(key);
      const inputs = solidScriptFunctionArguments(key);
      if (inputs.length === 0) continue;
      expect(least, key).toBeGreaterThanOrEqual(key === 'list' ? 0 : 1);
      if (!inputs.some((input) => input.name === '...')) expect(least, key).toBeLessThanOrEqual(inputs.length);
    }
  });
});

describe('SolidScript function doc text', () => {
  it('writes no $ escapes and no such as( in any doc, hint or summary, but where the Text block explains them', () => {
    const explains = solidScriptFormulaCatalog().find(SOLID_SCRIPT_FORMULA_COMMAND.text)!.parameters[0]!.hint;
    expect(explains).toMatch(/\$\$ is a dollar sign/);
    for (const text of docTexts().filter((entry) => entry !== explains)) {
      expect(text, text).not.toMatch(/\$[[\],$" ]/);
      expect(text, text).not.toContain('such as(');
    }
  });

  it.each(docTexts().flatMap(docCalls))('reads $call as typed, and it gives what the doc says', ({ call, result }) => {
    expect(solidScriptFormulaProblem(call), call).toBe('');
    if (result === null) return;
    const got = echo(call);
    const want = got === result ? result : (echo(result) ?? result);
    if (Number.isNaN(Number(want))) expect(got, call).toBe(want);
    else expect(Number(got), call).toBeCloseTo(Number(want), 9);
  });
});
