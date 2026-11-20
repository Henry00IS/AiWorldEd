import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import {
  solidScriptExampleRunOptions,
  solidScriptExampleShot,
  solidScriptExampleWorkLines,
  solidScriptExamplesAll,
} from './solid_script_example_shot.js';
import type { SolidScriptExample } from '@/solid_script/examples/solid_script_examples.js';

const GOLDEN_PATH = 'tests/solid_script/examples/solid_script_example_tutorials.json';

/**
 * First official example that explains each of these language ideas. Later
 * examples reuse them without a new Note.
 */
const COVERAGE: Readonly<Record<string, string>> = {
  'Cube, Size, Anchor and Center': 'doorway',
  Name: 'doorway',
  'Mode Subtractive': 'doorway',
  'Move By': 'doorway',
  Of: 'doorway',
  'Define Part': 'columns',
  Repeat: 'columns',
  'Transform spaces': 'columns',
  Formulas: 'columns',
  Output: 'columns',
  Input: 'steppingStones',
  'Set (variables)': 'steppingStones',
  'Lerp and Sin': 'steppingStones',
  'Writing one part of a point': 'steppingStones',
  Into: 'steppingStones',
  'Move To': 'steppingStones',
  'Rotate To': 'steppingStones',
  'Vector, Cos and Sin': 'pillarRing',
};

type TutorialStore = {
  lines: Record<string, number>;
  times: Record<string, number>;
  goldens: Record<string, ReturnType<typeof solidScriptExampleShot>>;
};

/**
 * Median of a task after a few warm runs, in milliseconds.
 *
 * @param task Task.
 * @param warm Warm runs.
 * @param rounds Timed runs.
 * @returns Median.
 */
function medianMs(task: () => void, warm = 4, rounds = 9): number {
  for (let i = 0; i < warm; i++) task();
  const times: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    task();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(rounds / 2)] ?? 0;
}

/**
 * Median run time of an official example, in milliseconds.
 *
 * @param example Example.
 * @returns Median.
 */
function exampleTimeMs(example: SolidScriptExample): number {
  const document = solidScriptDocumentCreate(example.lines);
  const options = solidScriptExampleRunOptions(example);
  return medianMs(() => {
    const result = solidScriptProgramRun(document, options);
    if (result.error) throw result.error;
  });
}

/**
 * Writes current goldens, work-line counts and times when the file is missing
 * or UPDATE_TUTORIAL_GOLDEN=1 is set. Geometry goldens must stay the
 * pre-rewrite snapshots; do not refresh them after a tutorial rewrite.
 *
 * @param examples Official examples.
 */
function writeStoreIfNeeded(examples: readonly SolidScriptExample[]): void {
  if (process.env['UPDATE_TUTORIAL_GOLDEN'] !== '1' && existsSync(GOLDEN_PATH)) return;
  const goldens = Object.fromEntries(examples.map((example) => [example.id, solidScriptExampleShot(example)]));
  const lines = Object.fromEntries(examples.map((example) => [example.id, solidScriptExampleWorkLines(example)]));
  const times = Object.fromEntries(
    examples.map((example) => [example.id, Math.round(exampleTimeMs(example) * 1000) / 1000]),
  );
  writeFileSync(GOLDEN_PATH, `${JSON.stringify({ lines, times, goldens }, null, 2)}\n`);
}

/**
 * Reads the stored goldens, work-line caps and time baselines.
 *
 * @returns Store.
 */
function readStore(): TutorialStore {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as TutorialStore;
}

/**
 * Checks one example against its golden, work-line cap and time baseline.
 *
 * @param example Example.
 * @param stored Store.
 * @returns A one-line timing report.
 */
function checkExample(example: SolidScriptExample, stored: TutorialStore): string {
  expect(stored.goldens[example.id], example.id).toBeDefined();
  expect(solidScriptExampleShot(example), example.id).toEqual(stored.goldens[example.id]);
  const work = solidScriptExampleWorkLines(example);
  expect(work, `${example.id} work lines`).toBeLessThanOrEqual(stored.lines[example.id] ?? work);
  const ms = exampleTimeMs(example);
  const baseline = stored.times[example.id] ?? ms;
  const limit = Math.max(baseline * 2, baseline + 15);
  expect(ms, `${example.id} ${ms.toFixed(3)} ms over ${limit.toFixed(3)}`).toBeLessThanOrEqual(limit);
  return `${example.id}: ${ms.toFixed(3)} ms (baseline ${baseline.toFixed(3)}, lines ${work})`;
}

describe('SolidScript example tutorials', () => {
  it("keeps every example's solids, bounds and UVs", () => {
    const examples = solidScriptExamplesAll();
    writeStoreIfNeeded(examples);
    const stored = readStore();
    const rows = examples.map((example) => checkExample(example, stored));
    process.stderr.write(`${rows.join('\n')}\n`);
  }, 180000);

  it('introduces each covered idea in a real official example', () => {
    const ids = new Set(solidScriptExamplesAll().map((example) => example.id));
    for (const [idea, id] of Object.entries(COVERAGE)) {
      expect(ids.has(id), `${idea} -> ${id}`).toBe(true);
    }
  });
});
