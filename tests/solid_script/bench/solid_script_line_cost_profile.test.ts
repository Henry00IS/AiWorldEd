import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/**
 * The heavy scene Henry reported: a cube, a cylinder and a sphere on every
 * face, then a second Select Faces All.
 *
 * @param tail Lines after the second Select Faces.
 * @returns Script lines.
 */
function heavyScene(tail: readonly SolidScriptLine[]): SolidScriptLine[] {
  return [
    { command: 'cube', values: { size: '1, 1, 1' } },
    { command: 'select_objects' },
    { command: 'select_faces', values: { which: 'All' } },
    { command: 'select_objects' },
    { command: 'place_on_face', values: { lift: '0' } },
    { command: 'cylinder', values: { h: '1', r1: '0.1', r2: '0.1', sides: '16' } },
    { command: 'sphere', values: { r: '0.2', sides: '16', rings: '8' } },
    { command: 'end' },
    { command: 'select_objects' },
    { command: 'select_faces', values: { which: 'All' } },
    ...tail,
  ];
}

/**
 * Several spheres, then Select Faces All, then optional lines after it.
 *
 * @param count How many spheres.
 * @param tail Lines after Select Faces.
 * @returns Script lines.
 */
function spheresThenSelect(count: number, tail: readonly SolidScriptLine[] = []): SolidScriptLine[] {
  return [
    ...Array.from({ length: count }, () => ({
      command: 'sphere',
      values: { r: '0.2', sides: '16', rings: '8' },
    })),
    { command: 'select_objects' },
    { command: 'select_faces', values: { which: 'All' } },
    ...tail,
  ];
}

/**
 * Several spheres, then Select Faces All, then a cheap Scatter Points line.
 *
 * @param count How many spheres.
 * @returns Script lines.
 */
function spheresThenScatter(count: number): SolidScriptLine[] {
  return spheresThenSelect(count, [
    { command: 'select_objects' },
    { command: 'scatter_points', values: { on: 'On Faces', count: '10', seed: '0', into: 'Points' } },
  ]);
}

/**
 * Median time of a task over warm runs, in milliseconds.
 *
 * @param task Task.
 * @param rounds Timed runs.
 * @returns Median.
 */
function median(task: () => void, rounds = 7): number {
  for (let warm = 0; warm < 2; warm++) task();
  const times: number[] = [];
  for (let round = 0; round < rounds; round++) {
    const start = performance.now();
    task();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(rounds / 2)] ?? 0;
}

/**
 * Runs a script once with per-line timing.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function profiled(lines: readonly SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate([...lines]), { profile: true });
}

/**
 * Time of one line in a profiled run, in milliseconds.
 *
 * @param result Profiled run.
 * @param line 1-based line.
 * @returns Time, or 0 when the line did not run.
 */
function lineMs(result: ReturnType<typeof profiled>, line: number): number {
  return result.profile.get(line)?.ms ?? 0;
}

/**
 * Writes a profile as "line command count ms".
 *
 * @param lines Lines.
 * @param result Profiled run.
 * @returns Text.
 */
function profileText(lines: readonly SolidScriptLine[], result: ReturnType<typeof profiled>): string {
  return [...result.profile.entries()]
    .sort(([left], [right]) => left - right)
    .map(([line, entry]) => {
      const command = lines[line - 1]?.command ?? '?';
      return `line ${line} ${command} count ${entry.count} ${entry.ms.toFixed(3)} ms`;
    })
    .join('\n');
}

/** A cheap last line used on the heavy scene. */
const SCATTER: SolidScriptLine = {
  command: 'scatter_points',
  values: { on: 'On Faces', count: '10', seed: '0', into: 'Points' },
};

/** Project UVs Mode Box, the other last line Henry compared. */
const PROJECT: SolidScriptLine = { command: 'project_uvs', values: { mode: 'Box', size: '1' } };

describe('SolidScript line cost on a heavy scene', () => {
  it('keeps a cheap last line cheap after many faces, and Project UVs too', () => {
    const base = heavyScene([]);
    const withProject = heavyScene([PROJECT]);
    const withScatter = heavyScene([SCATTER]);
    const baseRun = profiled(base);
    const projectRun = profiled(withProject);
    const scatterRun = profiled(withScatter);
    expect(baseRun.error).toBeNull();
    expect(projectRun.error).toBeNull();
    expect(scatterRun.error).toBeNull();
    const baseMs = median(() => solidScriptProgramRun(solidScriptDocumentCreate(base)));
    const projectMs = median(() => solidScriptProgramRun(solidScriptDocumentCreate(withProject)));
    const scatterMs = median(() => solidScriptProgramRun(solidScriptDocumentCreate(withScatter)));
    const report = [
      `base ${baseMs.toFixed(3)} ms, shapes ${baseRun.shapes.length}, steps ${baseRun.steps.length}`,
      profileText(base, baseRun),
      `with Project UVs ${projectMs.toFixed(3)} ms (extra ${(projectMs - baseMs).toFixed(3)} ms, line ${lineMs(projectRun, 8).toFixed(3)} ms)`,
      profileText(withProject, projectRun),
      `with Scatter Points ${scatterMs.toFixed(3)} ms (extra ${(scatterMs - baseMs).toFixed(3)} ms, line ${lineMs(scatterRun, 8).toFixed(3)} ms)`,
      profileText(withScatter, scatterRun),
    ].join('\n');
    writeFileSync('/tmp/geo-perf-after-lines.log', `${report}\n`);
    expect(scatterMs - baseMs, 'Scatter Points extra').toBeLessThan(50);
    expect(projectMs - baseMs, 'Project UVs extra').toBeLessThan(80);
    expect(lineMs(scatterRun, 8), 'Scatter Points line').toBeLessThan(50);
    expect(lineMs(projectRun, 8), 'Project UVs line').toBeLessThan(80);
  }, 120000);

  it('grows the cost of a cheap last line linearly with the number of solids', () => {
    const small = spheresThenScatter(2);
    const large = spheresThenScatter(8);
    const smallRun = profiled(small);
    const largeRun = profiled(large);
    expect(smallRun.error).toBeNull();
    expect(largeRun.error).toBeNull();
    const lastOf = (lines: SolidScriptLine[]) => {
      const result = profiled(lines);
      if (result.error) throw new Error(result.error.message);
      return lineMs(result, lines.length);
    };
    const smallMs = median(() => lastOf(small));
    const largeMs = median(() => lastOf(large));
    const ratio = largeMs / Math.max(smallMs, 0.2);
    writeFileSync(
      '/tmp/geo-perf-after-scaling.log',
      `scatter last line: 2 spheres ${smallMs.toFixed(3)} ms, 8 spheres ${largeMs.toFixed(3)} ms, ratio ${ratio.toFixed(2)} (4× geometry)\n`,
    );
    expect(ratio, `last-line ratio ${ratio.toFixed(2)} should stay near 4, not 16`).toBeLessThan(10);
  }, 120000);

  it('grows the cost of Select Faces All linearly with the number of solids', () => {
    const small = spheresThenSelect(2);
    const large = spheresThenSelect(8);
    const smallRun = profiled(small);
    const largeRun = profiled(large);
    expect(smallRun.error).toBeNull();
    expect(largeRun.error).toBeNull();
    const selectOf = (lines: SolidScriptLine[]) => {
      const result = profiled(lines);
      if (result.error) throw new Error(result.error.message);
      return lineMs(result, lines.length);
    };
    const smallMs = median(() => selectOf(small));
    const largeMs = median(() => selectOf(large));
    const ratio = largeMs / Math.max(smallMs, 0.2);
    writeFileSync(
      '/tmp/geo-perf-after-face-lookup.log',
      `Select Faces All: 2 spheres ${smallMs.toFixed(3)} ms, 8 spheres ${largeMs.toFixed(3)} ms, ratio ${ratio.toFixed(2)} (4× geometry)\n`,
    );
    expect(ratio, `Select Faces ratio ${ratio.toFixed(2)} should stay near 4, not 16`).toBeLessThan(10);
  }, 120000);
});
