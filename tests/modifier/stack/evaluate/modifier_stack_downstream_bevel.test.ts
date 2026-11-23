import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { MODIFIER_VOLUME_BEVEL_TEXTURE_KEY } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierStackOwnerDecode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { stackFixtureEntries } from '../modifier_stack_fixture.js';
import {
  BEVEL_TEXTURE,
  BRUSH_TEXTURE,
  compiledStack,
  normalsOf,
  shows,
  texturedBevel,
} from './modifier_stack_downstream_bevel_fixture.js';

describe('bevel settings after earlier modifiers', { timeout: 60000 }, () => {
  for (const holder of ['owner', 'volume'] as const) {
    it(`gives the bevel faces their own texture after Shear (${holder})`, () => {
      expect(shows(compiledStack([texturedBevel('flat')], holder), BEVEL_TEXTURE)).toBe(true);
      expect(shows(compiledStack(['shear', texturedBevel('flat')], holder), BEVEL_TEXTURE)).toBe(true);
    });

    it(`smooths the bevel strips after Shear (${holder})`, () => {
      const flat = normalsOf(compiledStack(['shear', texturedBevel('flat')], holder));
      const smooth = normalsOf(compiledStack(['shear', texturedBevel('smooth')], holder));
      expect(smooth).toHaveLength(flat.length);
      expect(smooth).not.toEqual(flat);
    });
  }

  for (const holder of ['owner', 'volume'] as const) {
    it(`gives every smoothed bevel corner a unit normal after Shear (${holder})`, () => {
      // A corner patch face can share its exact normal with a strip face; it
      // must not hide that strip face from its own average and leave a zero
      // normal, which renders as a dark triangle.
      for (const segments of [2, 3, 4, 5]) {
        const normals = normalsOf(compiledStack(['shear', texturedBevel('smooth', segments)], holder, 2));
        for (let offset = 0; offset < normals.length; offset += 3) {
          const length = Math.hypot(normals[offset] ?? 0, normals[offset + 1] ?? 0, normals[offset + 2] ?? 0);
          expect(length, `${segments} segments, vertex ${offset / 3}`).toBeCloseTo(1, 4);
        }
      }
    });
  }

  it('keeps the bevel texture while Shear is turned off and on again, and follows a new bevel texture', () => {
    const world = new THREE.Group();
    const model = new SolidModel('Shear toggle test');
    world.add(model.root);
    const source = model.addBoxBrush(1, SolidOperation.Additive);
    source.setAllFacesTextureId(BRUSH_TEXTURE);
    const mesh = source.mesh as THREE.Mesh;
    modifierStackOwnerDecode(mesh, { modifiers: stackFixtureEntries(['shear', texturedBevel('flat')]) });
    world.updateMatrixWorld(true);
    modifierBevelRefreshScene(world);
    expect(shows(model, BEVEL_TEXTURE)).toBe(true);
    const sheared = ModifierVolume.read(mesh);
    const toggle = (enabled: boolean) => {
      const before = ModifierVolume.read(mesh);
      const modifiers = before.modifiers.map((step, index) => (index === 0 ? { ...step, enabled } : step));
      new CommandModifierStackSet(mesh, before, { ...before, modifiers }).execute();
    };
    toggle(false);
    expect(shows(model, BEVEL_TEXTURE)).toBe(true);
    toggle(true);
    expect(shows(model, BEVEL_TEXTURE)).toBe(true);
    const retextured = {
      ...sheared,
      modifiers: sheared.modifiers.map((step, index) =>
        index === 1
          ? { ...step, parameters: { ...step.parameters, [MODIFIER_VOLUME_BEVEL_TEXTURE_KEY]: 'cap.jpg' } }
          : step,
      ),
    };
    new CommandModifierStackSet(mesh, ModifierVolume.read(mesh), retextured).execute();
    expect(shows(model, 'cap.jpg')).toBe(true);
    expect(shows(model, BEVEL_TEXTURE)).toBe(false);
  });
});
