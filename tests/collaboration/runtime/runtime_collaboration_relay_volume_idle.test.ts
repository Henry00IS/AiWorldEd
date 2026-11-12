import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type HarnessCollaborationEditor,
  harnessCollaborationRelayUp,
  harnessCollaborationUntil,
} from './harness_collaboration_editor.js';
import {
  HARNESS_RELAY_REQUIRED,
  harnessRelayClose,
  harnessRelayRoomBuilt,
  harnessRelayJoin,
} from './harness_collaboration_relay.js';
import { PanelProperties } from '@/ui/properties/panel_properties.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { PanelPropertiesModifierStackSection } from '@/modifier/stack/ui/panel_properties_modifier_stack_section.js';

const editsSent = new WeakMap<HarnessCollaborationEditor, () => number>();
let relayUp = false;
beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});
afterEach(harnessRelayClose);

/** Inspector control surface used by both ordinary brushes and volumes. */
interface IdlePanel {
  element: HTMLElement;
  refresh: () => void;
}

/**
 * Builds an inspector attached to a client's selection.
 *
 * @param client Editor client.
 * @param kind Fixture kind.
 * @returns Inspector control surface.
 */
function inspector(client: HarnessCollaborationEditor, kind: string): IdlePanel {
  if (kind === 'brush') {
    const panel = new PanelProperties(document.createElement('div'), client.selection);
    panel.setCommandStack(client.commandStack);
    panel.bindObject(client.object('Selected'));
    return { element: panel.getContainer(), refresh: () => panel.refreshBoundObject() };
  }
  const panel = new PanelPropertiesModifierStackSection(
    () => document.createElement('div'),
    () => document.createElement('div'),
  );
  panel.setCommandStack(client.commandStack);
  panel.updateFromObjects([client.object('Selected')]);
  return { element: panel.getElement(), refresh: () => panel.refresh() };
}

/**
 * Commits a numeric inspector field as a user change.
 *
 * @param panel Selected node's inspector.
 * @param kind Fixture kind.
 */
function editNumber(panel: IdlePanel, kind: string): void {
  const label = kind === 'bevel' ? 'Bevel distance' : kind === 'stairs' ? 'Steps' : 'Count';
  const selector = kind === 'brush' ? 'input' : `input[aria-label="${label}"]`;
  const input = panel.element.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`missing ${label}`);
  input.value = String(kind === 'bevel' ? 0.17 : 5);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Adds the selected editable node to a solid model.
 *
 * @param client Owner client.
 * @param kind Fixture kind.
 */
function sceneBuild(client: HarnessCollaborationEditor, kind: string): void {
  const model = client.solidAdd('Solid');
  if (kind === 'brush') {
    const brush = model.getBrushes()[0];
    if (!brush?.mesh) throw new Error('missing brush');
    brush.name = 'Selected';
    brush.mesh.name = 'Selected';
    return;
  }
  const volume = kind === 'stairs' ? modifierGeneratorNodeCreate('stairs') : modifierVolumeTemplateCreate(kind);
  volume.name = 'Selected';
  volume.scale.setScalar(8);
  if (kind === 'stairs') model.root.add(volume);
  else client.world.add(volume);
}

/**
 * Folds the receiving inspector without changing shared scene data.
 *
 * @param volume Receiver's selected node.
 */
function remoteFold(volume: THREE.Object3D): void {
  if (!ModifierVolume.isVolume(volume)) return;
  const folded = ModifierVolume.read(volume);
  ModifierVolume.write(volume, {
    ...folded,
    modifiers: folded.modifiers.map((step) => ({ ...step, expanded: false })),
  });
}

/**
 * Counts actual outbound edit frames without changing their contents or order.
 *
 * @param client Connected editor client.
 */
function editsObserve(client: HarnessCollaborationEditor): void {
  const socket = client.socket;
  if (!socket) throw new Error('missing socket');
  let sent = 0;
  socket.send = new Proxy(socket.send, {
    apply(target, receiver, args: unknown[]) {
      const data = args[0];
      if (typeof data === 'string' && JSON.parse(data).t === 'edit') sent++;
      return Reflect.apply(target, receiver, args);
    },
  });
  editsSent.set(client, () => sent);
}

/**
 * Opens two clients selecting the same scene node with different card layouts.
 *
 * @param kind Fixture kind.
 * @returns Clients and inspectors.
 */
async function pairBuild(kind: string) {
  const { owner, room } = await harnessRelayRoomBuilt('volume idle regression', (client) => sceneBuild(client, kind));
  const peer = await harnessRelayJoin(room, 'Selected peer');
  remoteFold(peer.object('Selected'));
  owner.selectTry('Selected');
  peer.selectTry('Selected');
  [owner, peer].forEach(editsObserve);
  return { clients: [owner, peer], panels: [inspector(owner, kind), inspector(peer, kind)] };
}

type IdlePair = Awaited<ReturnType<typeof pairBuild>>;

/**
 * Reads the edited inspector property.
 *
 * @param client Editor client.
 * @param kind Fixture kind.
 * @returns Property value.
 */
function amount(client: HarnessCollaborationEditor, kind: string): unknown {
  const object = client.object('Selected');
  if (kind === 'brush') return object.position.x;
  if (kind === 'bevel') return ModifierVolumeBevel.readSettings(object).distance;
  return ModifierVolume.read(object).modifiers[0]?.parameters['count'];
}

/**
 * Captures undo pushes and scene edit revisions for both clients.
 *
 * @param pair Clients and inspectors.
 * @returns Counters that must stay unchanged while idle.
 */
function counters(pair: IdlePair) {
  return pair.clients.map((client) => ({
    undo: client.commandStack.getUndoCount(),
    revision: client.runtime.session?.sync.replica.revision,
    editFrames: editsSent.get(client)?.(),
  }));
}

/**
 * Checks every poll and inspector refresh for one full minute after an edit.
 *
 * @param pair Clients and inspectors.
 * @param kind Fixture kind.
 */
async function idleAssert(pair: IdlePair, kind: string): Promise<void> {
  const before = counters(pair);
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    pair.panels.forEach((panel) => panel.refresh());
    pair.clients.forEach((client) => client.commit());
    expect(counters(pair)).toEqual(before);
    pair.clients.forEach((client) => expect(amount(client, kind)).toBe(kind === 'bevel' ? 0.17 : 5));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.info('60-second idle counters', kind, JSON.stringify({ before, after: counters(pair) }));
}

describe('selected modifier inspector stays idle over relay', { timeout: 80000 }, () => {
  it.for(['bevel', 'linear', 'stairs', 'brush'])(
    'keeps %s properties and history stable for 60 seconds',
    async (kind, { skip }) => {
      if (!relayUp) skip();
      const pair = await pairBuild(kind);
      const [owner, peer] = pair.clients;
      const panel = pair.panels[0];
      if (!owner || !peer || !panel) throw new Error('missing client');
      const history = peer.commandStack.getUndoCount();
      editNumber(panel, kind);
      owner.commit();
      await harnessCollaborationUntil(
        () => amount(peer, kind) === (kind === 'bevel' ? 0.17 : 5),
        5000,
        'inspector property synced',
      );
      expect(peer.commandStack.getUndoCount()).toBe(history);
      await idleAssert(pair, kind);
    },
  );
});
