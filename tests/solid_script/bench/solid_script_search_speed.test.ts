import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentNames } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptFormulaCatalog } from '@/solid_script/commands/solid_script_formula_commands.js';
import {
  SOLID_SCRIPT_EDITOR_PALETTE_SCRIPT,
  SolidScriptEditorPalette,
} from '@/solid_script/ui/solid_script_editor_palette.js';
import {
  solidScriptSuggestionContext,
  solidScriptSuggestions,
  type SolidScriptSuggestionScope,
} from '@/solid_script/ui/solid_script_suggestions.js';

const TYPED = [
  ...['f', 'fo', 'for', 'fore', 'forea', 'foreac', 'foreach'],
  ...['s', 'se', 'set'],
  ...['r', 'ro', 'rou', 'roun', 'round'],
  ...['m', 'me', 'mes', 'mesh', 'mesh ', 'mesh f', 'mesh fr', 'mesh from'],
  ...['b', 'bl', 'blh', 'fe', 'fch', 'zzzz', 'a'],
];

/**
 * Averages the time of a repeated action in milliseconds.
 *
 * @param repeats How many times to run it.
 * @param action Action to time.
 * @returns Milliseconds per run.
 */
function averageMilliseconds(repeats: number, action: () => void): number {
  action();
  const start = performance.now();
  for (let count = 0; count < repeats; count++) action();
  return (performance.now() - start) / repeats;
}

/**
 * Reports a timing to the file named by the SEARCH_SPEED_REPORT variable.
 *
 * @param label What was timed.
 * @param milliseconds Milliseconds per keystroke.
 */
function report(label: string, milliseconds: number): void {
  const file = process.env['SEARCH_SPEED_REPORT'];
  if (file) appendFileSync(file, `${label}: ${milliseconds.toFixed(3)} ms\n`);
}

describe('SolidScript search speed', () => {
  it('filters the script palette within a few milliseconds per keystroke', () => {
    const palette = new SolidScriptEditorPalette(
      () => undefined,
      () => undefined,
    );
    const milliseconds = averageMilliseconds(10, () => {
      for (const text of TYPED) {
        palette.search.value = text;
        palette.search.dispatchEvent(new Event('input'));
      }
    });
    report('script palette keystroke', milliseconds / TYPED.length);
    expect(milliseconds / TYPED.length).toBeLessThan(40);
  });

  it('filters the formula palette within a few milliseconds per keystroke', () => {
    const options = { ...SOLID_SCRIPT_EDITOR_PALETTE_SCRIPT, catalog: solidScriptFormulaCatalog() };
    const palette = new SolidScriptEditorPalette(
      () => undefined,
      () => undefined,
      undefined,
      options,
    );
    const milliseconds = averageMilliseconds(10, () => {
      for (const text of TYPED) {
        palette.search.value = text;
        palette.search.dispatchEvent(new Event('input'));
      }
    });
    report('formula palette keystroke', milliseconds / TYPED.length);
    expect(milliseconds / TYPED.length).toBeLessThan(40);
  });

  it('lists suggestions for the whole function catalog within a few milliseconds per keystroke', () => {
    const script = solidScriptDocumentCreate([{ command: 'variable', values: { name: 'Width', value: '2' } }]);
    const scope: SolidScriptSuggestionScope = { names: solidScriptDocumentNames(script), extra: [], words: [] };
    const milliseconds = averageMilliseconds(20, () => {
      for (const text of TYPED) {
        solidScriptSuggestions(
          solidScriptSuggestionContext(`[${text.replace(' ', '')}`, text.length + 1, false),
          scope,
        );
      }
    });
    report('suggestions keystroke', milliseconds / TYPED.length);
    expect(milliseconds / TYPED.length).toBeLessThan(40);
  });
});
