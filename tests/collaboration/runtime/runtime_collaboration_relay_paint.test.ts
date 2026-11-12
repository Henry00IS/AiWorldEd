import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type HarnessCollaborationEditor,
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';
import { CommandPaintStrokes } from '@/paint/commands/command_paint_strokes.js';
import { testFloorStroke } from '../../paint/paint_test_strokes.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Returns the stroke ids on the additive brush of a client's solid.
 *
 * @param client Client.
 * @returns Sorted stroke ids.
 */
function strokeIds(client: HarnessCollaborationEditor): string[] {
  const brush = client.solid('Solid').getBrushes()[0];
  return (brush?.paint.ordered() ?? []).map((stroke) => stroke.id).sort();
}

/**
 * Integration tests against the real relay: paint strokes travel as records,
 * undo removes them everywhere, and late joiners receive them.
 */
describe('collaboration relay texture paint', { timeout: 20000 }, () => {
  it('sends strokes, undoes them in the room and brings late joiners the records', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('paint', (client) => {
      client.solidAdd('Solid');
    });
    const alice = await harnessRelayJoin(room, 'Alice');
    const model = alice.solid('Solid');
    const brushId = model.getBrushes()[0]?.id;
    if (brushId === undefined) throw new Error('solid without brushes');
    const paint = (id: string, x: number): void => {
      const stroke = testFloorStroke(id, model.getBrushes()[0]?.paint.nextOrder() ?? 1, [[x, 1, 0]], { radius: 0.3 });
      alice.commandStack.push(new CommandPaintStrokes([{ model, brushId, stroke }]));
      alice.commit();
    };
    paint('stroke-a', -0.5);
    paint('stroke-b', 0.5);
    await harnessCollaborationUntil(() => strokeIds(owner).length === 2, 3000, 'strokes synced');
    expect(strokeIds(owner)).toEqual(['stroke-a', 'stroke-b']);
    expect(Array.from(owner.solid('Solid').getBrushes()[0]?.paint.get('stroke-b')?.dabs ?? [])).toEqual(
      Array.from(model.getBrushes()[0]?.paint.get('stroke-b')?.dabs ?? [0]),
    );
    expect(alice.commandStack.undo()).toBe(true);
    alice.commit();
    await harnessCollaborationUntil(() => strokeIds(owner).length === 1, 3000, 'undo synced');
    expect(strokeIds(owner)).toEqual(['stroke-a']);
    const late = await harnessRelayJoin(room, 'Late');
    expect(strokeIds(late)).toEqual(['stroke-a']);
    await harnessRelayConverged([owner, alice, late]);
  });
});
