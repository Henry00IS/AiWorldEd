import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidModelCodec } from '@/solid/io/solid_model_codec.js';
import { markAsSolidCsgGroup, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackKinds } from '@/modifier/stack/modifier_stack_catalog.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { modifierStackClipboardPaste } from '@/modifier/stack/clipboard/modifier_stack_clipboard.js';
import { MODIFIER_STACK_USERDATA_KEY } from '@/modifier/volume/modifier_volume_record.js';
import {
  modifierStackOwnerCopy,
  modifierStackOwnerDecode,
  modifierStackOwnerEncode,
} from '@/modifier/stack/owner/modifier_stack_owner.js';
import { nodeOwnerStackApply } from '@/collaboration/scene/node_collaboration_volume.js';
import { clipboardSceneCopy } from '@/clipboard/scene/clipboard_scene_data.js';
import { PanelPropertiesModifierStackSection } from '@/modifier/stack/ui/panel_properties_modifier_stack_section.js';
import { CommandStack } from '@/commands/command_stack.js';
import type { ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';
import { stackFixtureEntries } from '../modifier_stack_fixture.js';

/** Every generator kind, such as Stairs, Arch and Column. */
const generators = modifierStackKinds.filter((kind) => kind.category === 'generate');

/**
 * Builds a solid whose CSG group holds one brush.
 *
 * @returns Model, brush mesh and group.
 */
function solid() {
  const world = new THREE.Group();
  const model = new SolidModel('Owner generators');
  world.add(model.root);
  const group = new THREE.Group();
  markAsSolidCsgGroup(group, SolidOperation.Additive);
  model.root.add(group);
  const brush = model.addBoxBrush(1, SolidOperation.Additive);
  const mesh = brush.mesh as THREE.Mesh;
  group.add(mesh);
  model.syncBrushOrderFromScene();
  world.updateMatrixWorld(true);
  return { world, model, mesh, group, brush };
}

/**
 * Returns a stack that mixes a generator with ordinary modifiers.
 *
 * @param generator Generator kind id.
 * @returns Stack settings.
 */
function mixedStack(generator: string): ModifierStackSettings {
  return ModifierVolume.read(
    Object.assign(new THREE.Object3D(), {
      userData: { [MODIFIER_STACK_USERDATA_KEY]: { modifiers: stackFixtureEntries([generator, 'mirror', 'bevel']) } },
    }),
  );
}

/**
 * Lists the kinds of an owner's stack.
 *
 * @param object Brush or CSG group.
 * @returns Kind ids in order.
 */
function kinds(object: THREE.Object3D): string[] {
  return modifierStackOwnerEncode(object)?.modifiers.map((step) => step.kind) ?? [];
}

describe('generators stay off brush and group stacks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('has generator kinds to keep out', () => {
    expect(generators.map((kind) => kind.id)).toEqual(expect.arrayContaining(['stairs', 'arch', 'column']));
  });

  for (const generator of generators) {
    it(`drops ${generator.label} with a warning when a file, paste or remote op stores it on a brush or group`, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { mesh, group } = solid();
      for (const owner of [mesh, group]) {
        modifierStackOwnerDecode(owner, mixedStack(generator.id));
        expect(kinds(owner)).toEqual(['mirror', 'bevel']);
      }
      expect(warn).toHaveBeenCalled();
      modifierStackOwnerDecode(mesh, { modifiers: stackFixtureEntries([generator.id]) });
      expect(kinds(mesh)).toEqual([]);
      expect(mesh.userData[MODIFIER_STACK_USERDATA_KEY]).toBeUndefined();
    });
  }

  it('keeps generators out of the Add Modifier menu of a brush and a group', () => {
    const { mesh, group } = solid();
    const section = new PanelPropertiesModifierStackSection(
      () => document.createElement('section'),
      (title) => Object.assign(document.createElement('header'), { textContent: title }),
    );
    section.setCommandStack(new CommandStack(8));
    document.body.appendChild(section.getElement());
    for (const owner of [mesh, group]) {
      section.updateFromObjects([owner]);
      section
        .getElement()
        .querySelector<HTMLButtonElement>('button[aria-label="Add a modifier to the end of the stack"]')
        ?.click();
      const menu = [...document.querySelectorAll('[role="menu"]')]
        .map((element) => element.textContent ?? '')
        .join(' ');
      expect(menu).toContain('Bevel');
      expect(menu).toContain('SolidScript Modifier');
      const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((item) =>
        (item.textContent ?? '').trim(),
      );
      for (const generator of generators) expect(items).not.toContain(generator.label);
      document.querySelectorAll('[role="menu"]').forEach((element) => element.remove());
    }
  });

  it('refuses generators written through an undoable stack edit, and undo restores the old stack', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { mesh, group } = solid();
    for (const owner of [mesh, group]) {
      const before = ModifierVolume.read(owner);
      const command = new CommandModifierStackSet(owner, before, mixedStack('stairs'));
      command.execute();
      expect(kinds(owner)).toEqual(['mirror', 'bevel']);
      command.undo();
      expect(kinds(owner)).toEqual([]);
    }
  });

  it('leaves generators out when modifiers are pasted onto a brush stack', () => {
    const { mesh } = solid();
    const { stack } = modifierStackClipboardPaste(ModifierVolume.read(mesh), {
      modifiers: mixedStack('column').modifiers,
    });
    expect(stack.modifiers.map((step) => step.kind)).toEqual(['mirror', 'bevel']);
  });

  it('drops generators from a loaded file, a duplicate and a pasted brush', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { model, mesh, group, brush } = solid();
    mesh.userData[MODIFIER_STACK_USERDATA_KEY] = mixedStack('arch');
    group.userData[MODIFIER_STACK_USERDATA_KEY] = mixedStack('stairs');
    const decoded = SolidModelCodec.decode(SolidModelCodec.encode(model), 'Loaded');
    const loadedGroup = decoded.root.children.find((child) => isSolidCsgGroup(child));
    expect(kinds(loadedGroup!)).toEqual(['mirror', 'bevel']);
    expect(kinds(decoded.getBrushes()[0]?.mesh as THREE.Mesh)).toEqual(['mirror', 'bevel']);
    const copy = new THREE.Mesh();
    copy.userData['isSolidBrush'] = true;
    modifierStackOwnerCopy(mesh, copy);
    expect(kinds(copy)).toEqual(['mirror', 'bevel']);
    const clone = model.cloneBrushUnder(brush, model.root, new THREE.Vector3(2, 0, 0));
    expect(kinds(clone.mesh as THREE.Mesh)).toEqual(['mirror', 'bevel']);
    const { data } = clipboardSceneCopy([mesh]);
    const pasted = new THREE.Mesh();
    pasted.userData['isSolidBrush'] = true;
    modifierStackOwnerDecode(pasted, data.brushes[0]?.modifierStack);
    expect(kinds(pasted)).toEqual(['mirror', 'bevel']);
  });

  it('drops generators from a remote op and settles instead of re-applying', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { mesh } = solid();
    expect(nodeOwnerStackApply(mesh, mixedStack('stairs'))).toBe(true);
    expect(kinds(mesh)).toEqual(['mirror', 'bevel']);
    expect(warn).toHaveBeenCalled();
    expect(nodeOwnerStackApply(mesh, mixedStack('stairs'))).toBe(false);
  });
});
