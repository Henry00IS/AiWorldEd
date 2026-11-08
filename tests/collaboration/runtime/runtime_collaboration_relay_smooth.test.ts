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
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { modifierStackParameterSet } from '@/modifier/stack/modifier_stack_operations.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

let relayUp = false;
beforeAll(async () => {
  relayUp = await harnessCollaborationRelayUp();
  if (!relayUp && HARNESS_RELAY_REQUIRED) throw new Error('collaboration relay is not reachable');
});
afterEach(harnessRelayClose);

/**
 * Adds a bevelled box with a separate smoothing volume.
 *
 * @param client Owner editor.
 */
function sceneBuild(client: HarnessCollaborationEditor): void {
  const model = new SolidModel('Solid');
  model.addBoxBrush(1, SolidOperation.Additive);
  const bevel = modifierVolumeTemplateCreate('bevel');
  const smooth = modifierVolumeTemplateCreate('smooth');
  smooth.name = 'Smoothing';
  bevel.scale.setScalar(8);
  smooth.scale.setScalar(8);
  ModifierVolumeBevel.writeDistance(bevel, 0.2);
  ModifierVolumeBevel.writeSegments(bevel, 4);
  client.world.add(model.root, bevel, smooth);
  modifierBevelRefreshScene(client.world);
}

/**
 * Returns the normal buffer that the viewport renders.
 *
 * @param client Editor client.
 * @returns Vertex normals.
 */
function normals(client: HarnessCollaborationEditor): number[] {
  return Array.from(client.solid('Solid').getResultMesh().geometry.getAttribute('normal').array);
}

/**
 * Changes the smoothing angle through one undoable command.
 *
 * @param client Editor client.
 * @param angle New maximum angle.
 */
function angleSet(client: HarnessCollaborationEditor, angle: number): void {
  const volume = client.object('Smoothing');
  const before = ModifierVolume.read(volume);
  const after = modifierStackParameterSet(before, before.modifiers[0]?.id ?? '', 'maxAngle', angle);
  client.commandStack.push(new CommandModifierStackSet(volume, before, after));
  client.commit();
}

describe('smoothing normals over relay', { timeout: 20000 }, () => {
  it('renders the same smoothed and flattened normals after a snapshot and a property edit', async ({ skip }) => {
    if (!relayUp) skip();
    const { owner, room } = await harnessRelayRoomBuilt('smoothing regression', sceneBuild);
    const peer = await harnessRelayJoin(room, 'Smooth peer');
    const smooth = normals(owner);
    expect(smooth.length).toBeGreaterThan(0);
    expect(normals(peer)).toEqual(smooth);
    angleSet(owner, 0);
    await harnessCollaborationUntil(
      () => ModifierVolume.read(peer.object('Smoothing')).modifiers[0]?.parameters['maxAngle'] === 0,
      5000,
      'angle synced',
    );
    expect(normals(owner)).not.toEqual(smooth);
    expect(normals(peer)).toEqual(normals(owner));
  });
});
