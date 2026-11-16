import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeLeavesPositive } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptGeneratorPieces } from '@/solid_script/language/solid_script_generator_pieces.js';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';

/**
 * Median time of a task over warm runs, in milliseconds.
 *
 * @param task Task.
 * @param rounds Timed runs.
 * @returns Median.
 */
function median(task: () => void, rounds = 25): number {
  for (let warm = 0; warm < 30; warm++) task();
  const times: number[] = [];
  for (let round = 0; round < rounds; round++) {
    const start = performance.now();
    task();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(rounds / 2)] ?? 0;
}

describe('SolidScript port speed', () => {
  it('times every port against its generator', () => {
    const rows: string[] = [];
    for (const example of SOLID_SCRIPT_EXAMPLES) {
      if (!example.port) continue;
      const document = solidScriptDocumentCreate(example.lines);
      const inputs = { width: '4', depth: '4', height: '3' };
      const script = median(() => {
        const result = solidScriptProgramRun(document, { inputs });
        for (const leaf of result.shapes.flatMap(solidScriptShapeLeavesPositive))
          if (leaf.kind === 'solid') solidHullBrushFromPoints(leaf.points);
      });
      const run = median(() => solidScriptProgramRun(document, { inputs }));
      const native = median(() =>
        solidScriptGeneratorPieces(example.port ?? '', {}, { size: [4, 4, 3], min: [-2, -2, -1.5] }),
      );
      rows.push(
        `${example.id}: script ${script.toFixed(3)} ms (run ${run.toFixed(3)}), generator ${native.toFixed(3)} ms, ratio ${(script / native).toFixed(2)}`,
      );
    }
    for (const example of SOLID_SCRIPT_EXAMPLES.filter((entry) => entry.group === 'Showcase')) {
      const document = solidScriptDocumentCreate(example.lines);
      const script = median(() => {
        const result = solidScriptProgramRun(document);
        for (const leaf of result.shapes.flatMap(solidScriptShapeLeavesPositive))
          if (leaf.kind === 'solid') solidHullBrushFromPoints(leaf.points);
      });
      const run = median(() => solidScriptProgramRun(document));
      const solids = solidScriptProgramRun(document).steps.length;
      rows.push(`${example.id}: script ${script.toFixed(3)} ms (run ${run.toFixed(3)}), ${solids} solids`);
    }
    process.stderr.write(`${rows.join('\n')}\n`);
    expect(rows.length).toBeGreaterThan(0);
  });
});
