import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
  type HarnessCollaborationEditor,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayConverged,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Creates a room holding a solid model and a box, joined by Alice (the AI user)
 * and Bob.
 *
 * @param name Room name.
 * @returns Owner, Alice and Bob.
 */
async function roomOfThree(name: string): Promise<HarnessCollaborationEditor[]> {
  const { owner, room } = await harnessRelayRoomBuilt(name, (client) => {
    client.solidAdd('Solid');
    client.boxAdd('Crate');
  });
  const alice = await harnessRelayJoin(room, 'Alice');
  const bob = await harnessRelayJoin(room, 'Bob');
  return [owner, alice, bob];
}

/**
 * Reads the first brush id of a client's solid model.
 *
 * @param client Client.
 * @param index Brush index.
 * @returns Brush id.
 */
function brushId(client: HarnessCollaborationEditor, index = 0): string {
  const brush = client.solid('Solid').getBrushes()[index];
  if (brush === undefined) throw new Error('missing brush');
  return brush.id;
}

/**
 * Reads the name of a brush on a client.
 *
 * @param client Client.
 * @param id Brush id.
 * @returns Brush mesh name.
 */
function brushName(client: HarnessCollaborationEditor, id: string): string {
  return client.solid('Solid').findBrush(id)?.mesh?.name ?? '';
}

/**
 * Reads the replica id of the solid model root on a client.
 *
 * @param client Client.
 * @returns Node id.
 */
function solidRoot(client: HarnessCollaborationEditor): string {
  return client.solid('Solid').root.uuid;
}

/** Relay tests for AI (MCP) tools inside a collaboration room. */
describe('runtime collaboration MCP tools over the relay', () => {
  it('syncs an MCP rename and releases the locks it took', async () => {
    if (!relayUp) return;
    const [owner, alice, bob] = await roomOfThree('mcp sync');
    const id = brushId(alice!);
    const result = await alice!.tool('rename_brush', { brushId: id, name: 'Pillar' });
    expect(result.ok).toBe(true);
    await harnessCollaborationUntil(() => brushName(owner!, id) === 'Pillar', 5000, 'owner sees rename');
    await harnessRelayConverged([owner!, alice!, bob!]);
    await harnessCollaborationUntil(() => bob!.selectTry('Solid'), 5000, 'AI locks released');
  });

  it('syncs an MCP created brush to every client', async () => {
    if (!relayUp) return;
    const [owner, alice] = await roomOfThree('mcp create');
    const model = alice!.solid('Solid');
    const result = await alice!.tool('add_box_brush', { modelId: model.root.uuid, name: 'Added', size: 1 });
    expect(result.ok).toBe(true);
    await harnessCollaborationUntil(() => owner!.solid('Solid').getBrushCount() === 3, 5000, 'owner sees brush');
    await harnessRelayConverged([owner!, alice!]);
  });

  it('refuses an MCP edit inside an object another user holds and reports who', async () => {
    if (!relayUp) return;
    const [owner, alice, bob] = await roomOfThree('mcp locked');
    await bob!.select('Solid');
    const before = owner!.fingerprint();
    const id = brushId(alice!);
    const result = await alice!.tool('set_brush_transform', { brushId: id, position: { x: 5, y: 0, z: 0 } });
    expect(result).toMatchObject({ ok: false, error: 'locked', holder: 'Bob' });
    expect(result.message).toContain('Bob');
    expect(result.message).toContain('nothing was changed');
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(owner!.fingerprint()).toBe(before);
    expect(alice!.fingerprint()).toBe(before);
  });

  it('applies none of a multi object MCP edit when one object is held', async () => {
    if (!relayUp) return;
    const [owner, alice, bob] = await roomOfThree('mcp atomic');
    await bob!.select('Solid');
    const before = owner!.fingerprint();
    const crate = alice!.object('Crate');
    const result = await alice!.tool('delete_brushes', { brushIds: [brushId(alice!), brushId(alice!, 1)] });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('locked');
    expect(alice!.object('Crate')).toBe(crate);
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(alice!.fingerprint()).toBe(before);
  });

  it('undoes an MCP edit through MCP and refuses the undo once the object is held', async () => {
    if (!relayUp) return;
    const [owner, alice, bob] = await roomOfThree('mcp undo');
    const id = brushId(alice!);
    const original = brushName(alice!, id);
    expect((await alice!.tool('rename_brush', { brushId: id, name: 'First' })).ok).toBe(true);
    expect((await alice!.tool('rename_brush', { brushId: id, name: 'Second' })).ok).toBe(true);
    expect((await alice!.tool('undo')).ok).toBe(true);
    await harnessCollaborationUntil(() => brushName(owner!, id) === 'First', 5000, 'owner sees undo');
    await bob!.select('Solid');
    await harnessCollaborationUntil(() => alice!.holderOf('Solid') === bob!.holderOf('Solid'), 5000, 'lease seen');
    const refused = await alice!.tool('undo');
    expect(refused).toMatchObject({ ok: false, error: 'locked', holder: 'Bob' });
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(brushName(owner!, id)).toBe('First');
    expect(original).not.toBe('First');
  });

  it('lets the AI select objects another member is editing (selection never locks)', async () => {
    if (!relayUp) return;
    const [, alice, bob] = await roomOfThree('mcp select');
    await bob!.select('Solid');
    await harnessCollaborationUntil(
      () => alice!.runtime.session!.sync.replica.locks.heldByOther(solidRoot(alice!)),
      5000,
      'lease seen',
    );
    expect((await alice!.tool('select', { brushIds: [brushId(alice!)] })).ok).toBe(true);
    const locks = alice!.runtime.session!.sync.replica.locks;
    expect(locks.holder(brushId(alice!))).not.toBe(locks.selfGet());
  });

  it('runs read tools while another user holds the object', async () => {
    if (!relayUp) return;
    const [, alice, bob] = await roomOfThree('mcp read');
    await bob!.select('Solid');
    const result = await alice!.tool('list_solid_models');
    expect(result.ok).toBe(true);
  });
});
