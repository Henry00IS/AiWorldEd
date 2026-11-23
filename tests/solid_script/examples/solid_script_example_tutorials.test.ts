import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import type { SolidScriptExample } from '@/solid_script/examples/solid_script_examples.js';
import { SOLID_SCRIPT_TUTORIAL_BASELINES } from './solid_script_example_tutorial_baselines.js';
import {
  solidScriptExampleRunOptions,
  solidScriptExampleShot,
  solidScriptExampleWorkLines,
  solidScriptExamplesAll,
} from './solid_script_example_shot.js';

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
  Input: 'taperedBox',
  'Select Objects': 'taperedBox',
  'Which Between': 'taperedBox',
  'Select Faces': 'taperedBox',
  'Which Facing Up': 'taperedBox',
  'Scatter Points': 'irregularRock',
  'Into (a list)': 'irregularRock',
  Hull: 'irregularRock',
  'Set (variables)': 'steppingStones',
  'Lerp and Sin': 'steppingStones',
  'Writing one part of a point': 'steppingStones',
  'Transform Move': 'steppingStones',
  'Rotate To': 'steppingStones',
  'Vector, Cos and Sin': 'pillarRing',
  'For Each': 'knobs',
  'Select Of a name': 'knobs',
  $Selected: 'knobs',
  'Place On Face': 'knobs',
  'Which All': 'pebbles',
  'Filter List': 'pebbles',
  Where: 'pebbles',
  'HitsBox and InBox': 'pebbles',
  Random: 'pebbles',
  'Path From Points': 'roundedRail',
  'Sweep Along Path': 'roundedRail',
  'Path Input': 'baseboard',
  'Grid Mesh': 'hillyFloor',
  Displace: 'hillyFloor',
  Noise: 'hillyFloor',
  'Into (a solid)': 'spikyBall',
  'Align To': 'spikyBall',
  'If Used As and Else': 'pedestal',
  $Input: 'pedestal',
  'Input Objects': 'pedestal',
  'Move To': 'pedestal',
  'Extrude Face': 'pushOutFaces',
  $Box: 'pyramid',
  'Polyhedron and Point': 'pyramid',
  If: 'prism',
  'Function, Call and Local': 'hollowBox',
  'Clear Variable, Add Item and Remove Item': 'column',
  Return: 'pipe',
  'Show Inputs When': 'shear',
  Echo: 'shear',
  Matrix: 'shear',
  'Input Group': 'linear',
  Clip: 'mirror',
};

type TutorialStore = {
  lines: Record<string, number>;
  times?: Record<string, number>;
  goldens: Record<string, ReturnType<typeof solidScriptExampleShot>>;
};

/**
 * Median of numbers, in the same units as the list.
 *
 * @param values Numbers.
 * @returns Median, or 0 when the list is empty.
 */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Timed runs of a prepared task, after a warm-up.
 *
 * @param task Task.
 * @param warm Warm runs.
 * @param rounds Timed runs.
 * @returns Each timed run, in milliseconds.
 */
function sampleMs(task: () => void, warm: number, rounds: number): number[] {
  for (let i = 0; i < warm; i++) task();
  const times: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    task();
    times.push(performance.now() - start);
  }
  return times;
}

/**
 * A runner that builds a document once and times only the run.
 *
 * @param lines Script.
 * @returns Task that runs the script.
 */
function exampleRunner(
  lines: readonly SolidScriptLine[],
  options: ReturnType<typeof solidScriptExampleRunOptions> = {},
): () => void {
  const document = solidScriptDocumentCreate(lines);
  return () => {
    const result = solidScriptProgramRun(document, options);
    if (result.error) throw result.error;
  };
}

/**
 * Warmed medians of a baseline script and a new script, timed in one process in
 * alternating batches so load hits both the same way.
 *
 * @param before Baseline lines.
 * @param after New lines.
 * @returns Medians in milliseconds.
 */
function compareMs(
  before: readonly SolidScriptLine[],
  after: readonly SolidScriptLine[],
  options: ReturnType<typeof solidScriptExampleRunOptions> = {},
): { before: number; after: number } {
  const runBefore = exampleRunner(before, options);
  const runAfter = exampleRunner(after, options);
  const warm = 80;
  const batches = 6;
  const perBatch = 40;
  for (let i = 0; i < warm; i++) {
    runBefore();
    runAfter();
  }
  const beforeTimes: number[] = [];
  const afterTimes: number[] = [];
  for (let batch = 0; batch < batches; batch++) {
    beforeTimes.push(...sampleMs(runBefore, 0, perBatch));
    afterTimes.push(...sampleMs(runAfter, 0, perBatch));
  }
  return { before: medianOf(beforeTimes), after: medianOf(afterTimes) };
}

/**
 * Writes current goldens and work-line counts when the file is missing or
 * UPDATE_TUTORIAL_GOLDEN=1 is set. Geometry goldens must stay the pre-rewrite
 * snapshots; do not refresh them after a tutorial rewrite.
 *
 * @param examples Official examples.
 */
function writeStoreIfNeeded(examples: readonly SolidScriptExample[]): void {
  if (process.env['UPDATE_TUTORIAL_GOLDEN'] !== '1' && existsSync(GOLDEN_PATH)) return;
  const goldens = Object.fromEntries(examples.map((example) => [example.id, solidScriptExampleShot(example)]));
  const lines = Object.fromEntries(examples.map((example) => [example.id, solidScriptExampleWorkLines(example)]));
  writeFileSync(GOLDEN_PATH, `${JSON.stringify({ lines, goldens }, null, 2)}\n`);
}

/**
 * Reads the stored goldens and work-line caps.
 *
 * @returns Store.
 */
function readStore(): TutorialStore {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as TutorialStore;
}

/**
 * Checks one example against its golden and work-line cap.
 *
 * @param example Example.
 * @param stored Store.
 */
function checkExample(example: SolidScriptExample, stored: TutorialStore): void {
  expect(stored.goldens[example.id], example.id).toBeDefined();
  expect(solidScriptExampleShot(example), example.id).toEqual(stored.goldens[example.id]);
  const work = solidScriptExampleWorkLines(example);
  expect(work, `${example.id} work lines`).toBeLessThanOrEqual(stored.lines[example.id] ?? work);
}

describe('SolidScript example tutorials', () => {
  it("keeps every example's solids, bounds and UVs", () => {
    const examples = solidScriptExamplesAll();
    writeStoreIfNeeded(examples);
    const stored = readStore();
    for (const example of examples) checkExample(example, stored);
  });

  it('writes the brackets of its Notes plainly, as a Note reads no names', () => {
    for (const example of solidScriptExamplesAll()) {
      const notes = example.lines.filter((line) => line.command === 'note').map((line) => line.values?.['text'] ?? '');
      expect(
        notes.filter((text) => /\$[[\]$,]/.test(text)),
        example.id,
      ).toEqual([]);
    }
    const all = solidScriptExamplesAll().flatMap((example) => example.lines);
    expect(all.some((line) => line.command === 'note' && /\[\w/.test(line.values?.['text'] ?? ''))).toBe(true);
  });

  it('introduces each covered idea in a real official example', () => {
    const ids = new Set(solidScriptExamplesAll().map((example) => example.id));
    for (const [idea, id] of Object.entries(COVERAGE)) {
      expect(ids.has(id), `${idea} -> ${id}`).toBe(true);
    }
  });

  it('does not run a noticeable amount slower than the pre-rewrite script, as a warmed median', () => {
    const examples = new Map(solidScriptExamplesAll().map((example) => [example.id, example]));
    const rows: string[] = [];
    for (const [id, before] of Object.entries(SOLID_SCRIPT_TUTORIAL_BASELINES)) {
      const example = examples.get(id);
      expect(example, id).toBeDefined();
      if (!example) throw new Error(`missing example ${id}`);
      const { before: baseline, after } = compareMs(before, example.lines, solidScriptExampleRunOptions(example));
      // Noticeable means about a millisecond or more; also allow 20% so load
      // hits both scripts the same way. Sub-millisecond gaps on tiny scripts pass.
      const limit = Math.max(baseline * 1.2, baseline + 1);
      rows.push(`${id}: ${after.toFixed(3)} ms (baseline ${baseline.toFixed(3)}, limit ${limit.toFixed(3)})`);
      expect(after, rows[rows.length - 1]).toBeLessThanOrEqual(limit);
    }
    process.stderr.write(`${rows.join('\n')}\n`);
  }, 300000);
});
