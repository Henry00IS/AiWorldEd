import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import { markAsSolidCsgGroup, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { createIndependentSolidModelDuplicate } from '@/solid/model/solid_model_duplicate.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackOwnerDecode, modifierStackOwnerIs } from '@/modifier/stack/owner/modifier_stack_owner.js';
import { CodecCollaborationNodes } from '@/collaboration/scene/node_collaboration_codec.js';
import { nodeFingerprint } from '@/collaboration/scene/node_collaboration_fingerprint.js';
import { nodeOwnerStackApply } from '@/collaboration/scene/node_collaboration_volume.js';
import type {
  NodeCollaborationBrushData,
  NodeCollaborationSolidGroupData,
} from '@/collaboration/scene/node_collaboration_types.js';
import { clipboardSceneCopy } from '@/clipboard/scene/clipboard_scene_data.js';
import { stackFixtureEntries } from '../modifier_stack_fixture.js';

/**
 * Builds a solid whose CSG group and one brush own stacks.
 *
 * @returns Model, group and brush mesh.
 */
function ownedSolid() {
  const model = new SolidModel('Owner save');
  const group = new THREE.Group();
  group.name = 'Owned Group';
  markAsSolidCsgGroup(group, SolidOperation.Additive);
  model.root.add(group);
  const brush = model.addBoxBrush(1, SolidOperation.Additive);
  const mesh = brush.mesh as THREE.Mesh;
  group.add(mesh);
  model.syncBrushOrderFromScene();
  modifierStackOwnerDecode(mesh, { modifiers: stackFixtureEntries(['bevel']) });
  modifierStackOwnerDecode(group, { modifiers: stackFixtureEntries(['mirror']) });
  return { model, group, mesh, brush };
}

/**
 * Finds the first CSG group under a root.
 *
 * @param root Solid root.
 * @returns Group.
 */
function firstGroup(root: THREE.Object3D): THREE.Object3D {
  const found = root.children.find((child) => isSolidCsgGroup(child));
  if (!found) throw new Error('No CSG group');
  return found;
}

describe('modifier stacks owned by brushes and groups persist', () => {
  it('round-trips both stacks through the solid model codec', () => {
    const { model } = ownedSolid();
    const decoded = SolidModelCodec.decode(SolidModelCodec.encode(model), 'Copy');
    const group = firstGroup(decoded.root);
    const mesh = decoded.getBrushes()[0]?.mesh as THREE.Mesh;
    expect(ModifierVolume.read(group).modifiers.map((step) => step.kind)).toEqual(['mirror']);
    expect(ModifierVolume.read(mesh).modifiers.map((step) => step.kind)).toEqual(['bevel']);
    expect(ModifierVolume.isVolume(mesh)).toBe(false);
  });

  it('writes a hierarchy even for a flat brush that owns a stack', () => {
    const model = new SolidModel('Flat');
    const mesh = model.addBoxBrush(1).mesh as THREE.Mesh;
    modifierStackOwnerDecode(mesh, { modifiers: stackFixtureEntries(['mirror']) });
    const payload = SolidModelCodec.encode(model);
    expect(payload.hierarchy?.[0]).toMatchObject({ kind: 'brush', modifierStack: { modifiers: [{ kind: 'mirror' }] } });
    const decoded = SolidModelCodec.decode(payload, 'Flat copy');
    expect(modifierStackOwnerIs(decoded.getBrushes()[0]?.mesh as THREE.Mesh)).toBe(true);
  });

  it('keeps stacks on an independent duplicate of the solid', () => {
    const { model } = ownedSolid();
    const copy = createIndependentSolidModelDuplicate(model);
    expect(modifierStackOwnerIs(firstGroup(copy.root))).toBe(true);
    expect(modifierStackOwnerIs(copy.getBrushes()[0]?.mesh as THREE.Mesh)).toBe(true);
  });

  it('duplicates a brush with its stack', () => {
    const { model, brush } = ownedSolid();
    const clone = model.cloneBrushUnder(brush, model.root, new THREE.Vector3(2, 0, 0));
    expect(ModifierVolume.read(clone.mesh as THREE.Mesh).modifiers.map((step) => step.kind)).toEqual(['bevel']);
  });

  it('copies a brush stack to the clipboard', () => {
    const { mesh } = ownedSolid();
    const { data } = clipboardSceneCopy([mesh]);
    expect(data.brushes[0]?.modifierStack?.modifiers.map((step) => step.kind)).toEqual(['bevel']);
  });

  it('sends stacks on the wire, changes fingerprints, and applies received stacks', () => {
    const { model, group, mesh } = ownedSolid();
    const codec = new CodecCollaborationNodes();
    const brushRef = { id: 'b', kind: 'brush' as const, object: mesh, model, localId: 'b' };
    const groupRef = { id: 'g', kind: 'solidGroup' as const, object: group, model, localId: 'g' };
    const brushData = codec.encode(brushRef, '', 'a')?.data as NodeCollaborationBrushData;
    const groupData = codec.encode(groupRef, '', 'a')?.data as NodeCollaborationSolidGroupData;
    expect(brushData.modifierStack?.modifiers[0]?.kind).toBe('bevel');
    expect(groupData.modifierStack?.modifiers[0]?.kind).toBe('mirror');
    const before = nodeFingerprint(brushRef, '');
    modifierStackOwnerDecode(mesh, undefined);
    expect(nodeFingerprint(brushRef, '')).not.toBe(before);
    expect(nodeOwnerStackApply(mesh, brushData.modifierStack)).toBe(true);
    expect(nodeFingerprint(brushRef, '')).toBe(before);
    expect(nodeOwnerStackApply(mesh, brushData.modifierStack)).toBe(false);
  });
});
