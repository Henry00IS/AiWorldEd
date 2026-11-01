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
import { buildAxisAlignedWorldSolidVmf } from '../../io/vmf/vmf_test_solids.js';
import { ObjImporter } from '@/io/obj/obj_importer.js';
import { placeImportedObjMeshes } from '@/layout/setup/layout_scene_io_actions.js';
import { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';

const OBJ_TWO_TRIANGLES = [
  'o First',
  'v 0 0 0',
  'v 1 0 0',
  'v 0 1 0',
  'f 1 2 3',
  'o Second',
  'v 0 0 1',
  'v 1 0 1',
  'v 0 1 1',
  'f 4 5 6',
].join('\n');

let relayUp = false;

beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});

afterEach(harnessRelayClose);

/**
 * Creates a room with one box and joins Alice and Bob.
 *
 * @param name Room name.
 * @returns Owner, Alice and Bob.
 */
async function roomOfThree(name: string): Promise<HarnessCollaborationEditor[]> {
  const { owner, room } = await harnessRelayRoomBuilt(name, (client) => void client.boxAdd('Crate'));
  return [owner, await harnessRelayJoin(room, 'Alice'), await harnessRelayJoin(room, 'Bob')];
}

/**
 * Imports a one-brush VMF on a client through the editor's import path.
 *
 * @param client Client.
 * @returns Imported model root name.
 */
async function vmfImport(client: HarnessCollaborationEditor): Promise<string> {
  const text = buildAxisAlignedWorldSolidVmf({ x: 0, y: 0, z: 0 }, { x: 64, y: 64, z: 64 });
  const result = await new HandlerSceneIo().importVmfFromText(text, 'room_01.vmf', null);
  if (result === null) throw new Error('vmf import failed');
  client.solids().placeImportedModel(result.model);
  client.commit();
  return result.model.root.name;
}

/** Two-client coverage of the scene importers in a room. */
describe('collaboration imports over the relay', { timeout: 30000 }, () => {
  it('syncs a VMF import, keeps it until the importer selects again, refuses its undo while held and undoes it once free', async ({
    skip,
  }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = (await roomOfThree('import vmf')) as HarnessCollaborationEditor[];
    const name = await vmfImport(alice!);
    await harnessCollaborationUntil(
      () => owner!.find(name) !== undefined && bob!.find(name) !== undefined,
      5000,
      'vmf seen',
    );
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(await bob!.editTry(name)).toBe(false);
    expect(bob!.statuses.at(-1)).toContain('Alice');
    await alice!.select('Crate');
    await alice!.deselect();
    await harnessCollaborationUntil(() => bob!.selectTry(name), 3000, 'imported model free');
    await bob!.select(name);
    await harnessCollaborationUntil(() => alice!.holderOf(name) === bob!.holderOf(name), 3000, 'lock seen');
    expect(alice!.commandStack.undo()).toBe(false);
    expect(alice!.statuses.at(-1)).toContain('Bob');
    expect(owner!.find(name)).toBeDefined();
    await bob!.deselect();
    await harnessCollaborationUntil(() => alice!.holderOf(name) === null, 3000, 'release seen');
    alice!.commandStack.undo();
    await harnessCollaborationUntil(
      () => owner!.find(name) === undefined && bob!.find(name) === undefined,
      5000,
      'vmf undone',
    );
    await harnessRelayConverged([owner!, alice!, bob!]);
  });

  it('releases an import when the importer clicks empty space with nothing selected', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = (await roomOfThree('import release')) as HarnessCollaborationEditor[];
    const name = await vmfImport(alice!);
    await harnessCollaborationUntil(() => bob!.find(name) !== undefined, 5000, 'vmf seen');
    await harnessRelayConverged([owner!, alice!, bob!]);
    expect(await bob!.editTry(name)).toBe(false);
    await alice!.deselect();
    await harnessCollaborationUntil(() => bob!.selectTry(name), 3000, 'imported model free');
  });

  it('syncs an OBJ import as one group and undoes it', async ({ skip }) => {
    if (!relayUp) skip();
    const [owner, alice, bob] = (await roomOfThree('import obj')) as HarnessCollaborationEditor[];
    const result = new ObjImporter().importFromText(OBJ_TWO_TRIANGLES, 'props.obj');
    placeImportedObjMeshes(result.meshes, result.sourceFileName, alice!.world, alice!.commandStack);
    alice!.commit();
    const [first, second] = result.meshes.map((mesh) => mesh.name) as [string, string];
    const group = (): string | undefined => owner!.find(first)?.parent?.name;
    await harnessCollaborationUntil(() => group() !== undefined && group() !== owner!.world.name, 5000, 'obj seen');
    expect(bob!.find(second)?.parent?.name).toBe(group());
    await harnessRelayConverged([owner!, alice!, bob!]);
    alice!.commandStack.undo();
    await harnessCollaborationUntil(() => owner!.find(first) === undefined, 5000, 'obj undone');
    await harnessRelayConverged([owner!, alice!, bob!]);
  });
});
