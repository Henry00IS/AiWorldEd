import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type HarnessCollaborationEditor,
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayJoin,
  harnessRelayRoomBuilt,
} from './harness_collaboration_relay.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import { SolidScriptEditorSession } from '@/solid_script/ui/solid_script_editor_session.js';
import {
  solidScriptBlockCreate,
  solidScriptDocumentCreate,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentLineSet,
  solidScriptDocumentLinesToggle,
} from '@/solid_script/document/solid_script_document_edit.js';

let relayUp = false;
beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});
afterEach(harnessRelayClose);

/**
 * Adds a SolidScript generator named Script with four lines.
 *
 * @param client Room owner.
 */
function sceneBuild(client: HarnessCollaborationEditor): void {
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  node.name = 'Script';
  client.world.add(node);
  const stepId = ModifierVolume.read(node).modifiers[0]?.id ?? '';
  const script = solidScriptDocumentCreate([
    { command: 'cube', values: { size: '1, 1, 1' } },
    { command: 'sphere', values: { r: '0.5' } },
    { command: 'cylinder' },
    { command: 'cone' },
  ]);
  modifierStackParametersCommit(node, stepId, { script }, null);
}

/**
 * Opens the script of a client like the editor does.
 *
 * @param client Client.
 * @returns Session on the client's undo stack.
 */
function session(client: HarnessCollaborationEditor): SolidScriptEditorSession {
  const node = client.object('Script');
  return new SolidScriptEditorSession(node, ModifierVolume.read(node).modifiers[0]?.id ?? '', client.commandStack);
}

/**
 * Stores an edited script on a client and sends it.
 *
 * @param client Client.
 * @param edit Builds the new script.
 */
function edit(client: HarnessCollaborationEditor, edit: (document: SolidScriptDocument) => SolidScriptDocument): void {
  const open = session(client);
  open.commit(edit(open.document()));
  client.commit();
}

/**
 * Lists the lines of a client's script.
 *
 * @param client Client.
 * @returns Command, values and off state per line.
 */
function lines(client: HarnessCollaborationEditor): string {
  return JSON.stringify(
    session(client)
      .document()
      .blocks.map((block) => [block.command, block.values, block.off === true]),
  );
}

describe('SolidScript lines over relay', { timeout: 60000 }, () => {
  it('merges concurrent edits of different lines, keeps the last writer for one line, and undoes only own lines', async ({
    skip,
  }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('script lines', sceneBuild);
    const peer = await harnessRelayJoin(room, 'Script peer');
    await harnessCollaborationUntil(() => lines(peer) === lines(owner), 5000, 'joined');
    const ids = session(owner)
      .document()
      .blocks.map((block) => block.id);
    expect(
      session(peer)
        .document()
        .blocks.map((block) => block.id),
    ).toEqual(ids);

    // Both change a different line at the same time; nobody waits.
    edit(owner, (document) =>
      solidScriptDocumentLineSet(document, 0, { ...document.blocks[0]!, values: { size: '2, 2, 2' } }),
    );
    edit(peer, (document) => solidScriptDocumentLinesToggle(document, [2]).document);
    edit(peer, (document) => {
      const blocks = [...document.blocks];
      blocks.splice(4, 0, solidScriptBlockCreate('torus'));
      return { ...document, blocks };
    });
    await harnessCollaborationUntil(() => lines(peer) === lines(owner), 5000, 'merged');
    const merged = JSON.parse(lines(owner)) as [string, Record<string, string>, boolean][];
    expect(merged.map((line) => line[0])).toEqual(['cube', 'sphere', 'cylinder', 'cone', 'torus']);
    expect(merged[0]![1]['size']).toBe('2, 2, 2');
    expect(merged[2]![2]).toBe(true);

    // The same line from both: the later write wins everywhere.
    edit(owner, (document) =>
      solidScriptDocumentLineSet(document, 1, { ...document.blocks[1]!, values: { r: '0.7' } }),
    );
    edit(peer, (document) => solidScriptDocumentLineSet(document, 1, { ...document.blocks[1]!, values: { r: '0.9' } }));
    await harnessCollaborationUntil(() => lines(peer) === lines(owner), 5000, 'same line');
    expect(['0.7', '0.9']).toContain((JSON.parse(lines(owner)) as [string, Record<string, string>][])[1]![1]['r']);

    // Undo on the owner reverts the owner's last line only.
    const before = JSON.parse(lines(peer)) as [string, Record<string, string>, boolean][];
    owner.commandStack.undo();
    owner.commit();
    await harnessCollaborationUntil(
      () => lines(peer) === lines(owner) && lines(owner) !== JSON.stringify(before),
      5000,
      'undone',
    );
    owner.commandStack.undo();
    owner.commit();
    await harnessCollaborationUntil(
      () => lines(peer) === lines(owner) && JSON.parse(lines(owner))[0][1]['size'] === '1, 1, 1',
      5000,
      'undone twice',
    );
    const undone = JSON.parse(lines(owner)) as [string, Record<string, string>, boolean][];
    expect(undone.map((line) => line[0])).toEqual(['cube', 'sphere', 'cylinder', 'cone', 'torus']);
    expect(undone[2]![2]).toBe(true);
  });
});
