import { afterEach, describe, expect, it, vi } from 'vitest';
import { GATE_COLLABORATION_BURST, GateCollaborationEdits } from '@/collaboration/sync/gate_collaboration_edits.js';

/** Client-side token bucket: honest clients stay under the relay's limits. */
describe('gate_collaboration_edits', () => {
  afterEach(() => vi.useRealTimers());

  it('sends a burst at once, queues the rest in order and drains with time', () => {
    vi.useFakeTimers();
    let now = 0;
    const sent: number[] = [];
    const gate = new GateCollaborationEdits(
      (message) => sent.push((message as { n: number }).n),
      () => now,
    );
    for (let n = 0; n < GATE_COLLABORATION_BURST + 5; n++) gate.send({ n }, 1);
    expect(sent).toHaveLength(GATE_COLLABORATION_BURST);
    expect(gate.busy()).toBe(true);
    now += 1000;
    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(GATE_COLLABORATION_BURST + 5);
    expect(sent).toEqual([...sent].sort((a, b) => a - b));
    expect(gate.busy()).toBe(false);
  });

  it('lets live previews (cost 0) through and drops the queue on clear', () => {
    let now = 0;
    const sent: object[] = [];
    const gate = new GateCollaborationEdits(
      (message) => sent.push(message),
      () => now,
    );
    for (let n = 0; n < 500; n++) gate.send({ n }, 0);
    expect(sent).toHaveLength(500);
    for (let n = 0; n < GATE_COLLABORATION_BURST + 3; n++) gate.send({ n }, 1);
    gate.clear();
    now += 10_000;
    expect(gate.busy()).toBe(false);
  });
});
