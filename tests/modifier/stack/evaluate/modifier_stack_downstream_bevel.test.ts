import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackKinds } from '@/modifier/stack/modifier_stack_catalog.js';
import { MODIFIER_STACK_KIND_BEVEL } from '@/modifier/volume/modifier_volume_record.js';
import { MODIFIER_STACK_KIND_SMOOTH } from '@/modifier/stack/kinds/smooth/modifier_stack_kind_smooth.js';
import { MODIFIER_VOLUME_BEVEL_TEXTURE_KEY } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { MODIFIER_BEVEL_OPTIONS_KEY } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierStackOwnerDecode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { isContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { stackFixtureEntries, type StackFixtureStep } from '../modifier_stack_fixture.js';

const BRUSH_TEXTURE = 'photo.jpg';
const BEVEL_TEXTURE = 'stripes.jpg';

/**
 * Returns a bevel step with its own edge texture and strip shading choice.
 *
 * @param normals Strip shading mode.
 * @returns Fixture step.
 */
function texturedBevel(normals: 'flat' | 'smooth', segments = 3): StackFixtureStep {
  return {
    kind: MODIFIER_STACK_KIND_BEVEL,
    parameters: {
      [MODIFIER_VOLUME_BEVEL_TEXTURE_KEY]: BEVEL_TEXTURE,
      [MODIFIER_BEVEL_OPTIONS_KEY]: { clampOverlap: true, profile: 0.5, normals },
      modifierBevelDistance: 0.1,
      modifierBevelSegments: segments,
    },
  };
}

/**
 * Builds a textured box brush that owns the given stack, or a modifier volume
 * holding it, and compiles the scene.
 *
 * @param steps Modifiers in stack order.
 * @param holder Brush-owned stack or a separate volume.
 * @param volumeScale Uniform size of the volume.
 * @returns Live solid model.
 */
function compiledStack(steps: readonly StackFixtureStep[], holder: 'owner' | 'volume', volumeScale = 8): SolidModel {
  const world = new THREE.Group();
  const model = new SolidModel('Downstream bevel test');
  world.add(model.root);
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  source.setAllFacesTextureId(BRUSH_TEXTURE);
  if (holder === 'owner')
    modifierStackOwnerDecode(source.mesh as THREE.Mesh, { modifiers: stackFixtureEntries(steps) });
  else {
    const volume = ModifierVolume.create({ modifiers: stackFixtureEntries(steps) });
    volume.scale.setScalar(volumeScale);
    world.add(volume);
  }
  world.updateMatrixWorld(true);
  modifierBevelRefreshScene(world);
  return model;
}

/**
 * Tells whether the rendered result shows a texture.
 *
 * @param model Live solid model.
 * @param textureId Texture id.
 * @returns True when a result material maps it.
 */
function shows(model: SolidModel, textureId: string): boolean {
  const material = model.getResultMesh().material;
  const materials = Array.isArray(material) ? material : [material];
  const map = getTextureMapCache().resolve(textureId);
  return materials.some((entry) => isContentViewLitMaterial(entry) && entry.map === map);
}

/**
 * Returns the rendered normal buffer.
 *
 * @param model Live solid model.
 * @returns Normals.
 */
function normalsOf(model: SolidModel): number[] {
  return Array.from(model.getResultMesh().geometry.getAttribute('normal').array);
}

/** Every kind that can sit before a bevel. */
const upstreamKinds = modifierStackKinds.map((kind) => kind.id).filter((id) => id !== MODIFIER_STACK_KIND_BEVEL);

/** Kinds that build new pieces; only volumes may hold them. */
const generatorKinds = new Set(
  modifierStackKinds.filter((kind) => kind.category === 'generate').map((kind) => kind.id),
);

/**
 * Kinds that are round all over at their defaults: no edge turns sharper than
 * the bevel angle, so a following bevel rightly adds nothing.
 */
const roundKinds = new Set(['sphere', 'capsule']);

/**
 * Kinds tried in second place. A generator there replaces what came before, so
 * one generator stands for all of them and keeps the matrix small.
 */
const secondKinds = upstreamKinds.filter(
  (id) => !generatorKinds.has(id) || id === upstreamKinds.find((kind) => generatorKinds.has(kind)),
);

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

  for (const first of upstreamKinds) {
    for (const second of [null, ...secondKinds]) {
      const upstream = second ? [first, second] : [first];
      if (upstream.some((id) => roundKinds.has(id))) continue;
      // Generators are not available on brush stacks, so generator chains run
      // on a volume only.
      const holder = upstream.some((id) => generatorKinds.has(id)) ? 'volume' : 'owner';
      it(`keeps the bevel texture and strip shading after ${upstream.join(' then ')} (${holder})`, () => {
        const textured = compiledStack([...upstream, texturedBevel('smooth')], holder, 2);
        expect(shows(textured, BEVEL_TEXTURE)).toBe(true);
        if (upstream.includes(MODIFIER_STACK_KIND_SMOOTH)) return;
        const flat = compiledStack([...upstream, texturedBevel('flat')], holder, 2);
        expect(normalsOf(textured)).not.toEqual(normalsOf(flat));
      });
    }
  }
});
