import { appendFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type HarnessCollaborationEditor, harnessCollaborationRelayUp } from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';

/** Whether the lease latency benchmark runs (`AIWORLDED_COLLAB_LATENCY=1`). */
const LATENCY_ENABLED = process.env['AIWORLDED_COLLAB_LATENCY'] === '1';

/** File the results are appended to. */
const LATENCY_OUTPUT = process.env['AIWORLDED_COLLAB_LATENCY_FILE'] ?? 'collaboration-latency.txt';

/** Leases measured per object. */
const LATENCY_ROUNDS = 20;

/** Pause between leases, below the relay's lease rate. */
const LATENCY_GAP_MS = 150;

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Builds a loose Crate, Cube inside Group A and Deep three groups down.
 *
 * @param owner Owner client.
 */
function sceneBuild(owner: HarnessCollaborationEditor): void {
  owner.boxAdd('Crate');
  owner.boxAdd('Cube', owner.groupAdd('Group A'));
  const outer = owner.groupAdd('Outer');
  const middle = owner.groupAdd('Middle');
  const inner = owner.groupAdd('Inner');
  outer.add(middle);
  middle.add(inner);
  owner.boxAdd('Deep', inner);
}

/**
 * Measures how long an edit lease on an object takes to be granted, in
 * milliseconds; rounds are spaced under the relay's lease rate (10/s).
 *
 * @param member Editing member.
 * @param name Object name.
 * @returns Sorted samples.
 */
async function latencySamples(member: HarnessCollaborationEditor, name: string): Promise<number[]> {
  const samples: number[] = [];
  for (let round = 0; round < LATENCY_ROUNDS; round++) {
    const start = performance.now();
    await member.editStart(name);
    samples.push(performance.now() - start);
    expect(member.holds(member.object(name))).toBe(true);
    await member.editEnd();
    await new Promise((resolve) => setTimeout(resolve, LATENCY_GAP_MS));
  }
  return samples.sort((left, right) => left - right);
}

/**
 * Formats the median and 90th percentile of samples.
 *
 * @param samples Sorted samples.
 * @returns Summary text.
 */
function latencySummary(samples: readonly number[]): string {
  const pick = (ratio: number): string => (samples[Math.floor(ratio * (samples.length - 1))] ?? 0).toFixed(1);
  return `median ${pick(0.5)} ms, p90 ${pick(0.9)} ms, min ${pick(0)} ms, max ${pick(1)} ms`;
}

/** Benchmark of honest lease grants, root level and nested. */
describe('collaboration lease grant latency', { timeout: 60000 }, () => {
  it('reports how long honest edit leases take to be granted', async ({ skip }) => {
    if (!relayUp || !LATENCY_ENABLED) skip();
    const { room } = await harnessRelayRoomBuilt('Latency', sceneBuild);
    const member = await harnessRelayJoin(room, 'Member');
    for (const name of ['Crate', 'Cube', 'Deep', 'Crate', 'Cube', 'Deep']) {
      const samples = await latencySamples(member, name);
      appendFileSync(LATENCY_OUTPUT, `[latency] ${name}: ${latencySummary(samples)}\n`);
    }
  });
});
