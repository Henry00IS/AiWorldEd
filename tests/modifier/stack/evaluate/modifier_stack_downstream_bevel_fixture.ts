import * as THREE from 'three';
import { expect, it } from 'vitest';
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
import { isContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import { stackFixtureEntries, type StackFixtureStep } from '../modifier_stack_fixture.js';

export const BRUSH_TEXTURE = 'photo.jpg';
export const BEVEL_TEXTURE = 'stripes.jpg';

/**
 * Returns a bevel step with its own edge texture and strip shading choice.
 *
 * @param normals Strip shading mode.
 * @returns Fixture step.
 */
export function texturedBevel(normals: 'flat' | 'smooth', segments = 3): StackFixtureStep {
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
export function compiledStack(
  steps: readonly StackFixtureStep[],
  holder: 'owner' | 'volume',
  volumeScale = 8,
): SolidModel {
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
export function shows(model: SolidModel, textureId: string): boolean {
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
export function normalsOf(model: SolidModel): number[] {
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
const roundKinds = new Set(['sphere', 'capsule', 'icosphere']);

/**
 * Kinds tried in second place. A generator there replaces what came before, so
 * one generator stands for all of them and keeps the matrix small.
 */
const secondKinds = upstreamKinds.filter(
  (id) => !generatorKinds.has(id) || id === upstreamKinds.find((kind) => generatorKinds.has(kind)),
);

/**
 * Upstream kinds of one category, in catalog order.
 *
 * @param category Catalog category.
 * @returns Kind ids.
 */
export function upstreamKindsOf(category: string): string[] {
  const ids = new Set(modifierStackKinds.filter((kind) => kind.category === category).map((kind) => kind.id));
  return upstreamKinds.filter((id) => ids.has(id));
}

/**
 * One of three even slices of the generator kinds, so each file stays short.
 *
 * @param part Slice from 0 to 2.
 * @returns Kind ids.
 */
export function generatorKindsPart(part: number): string[] {
  const generators = upstreamKindsOf('generate');
  const size = Math.ceil(generators.length / 3);
  return generators.slice(part * size, (part + 1) * size);
}

/**
 * Adds the bevel texture and strip shading test for every chain that starts
 * with one of the given kinds. Generators are not available on brush stacks, so
 * generator chains run on a volume only.
 *
 * @param firsts Kinds tried in first place.
 */
export function downstreamBevelChains(firsts: readonly string[]): void {
  for (const first of firsts) {
    for (const second of [null, ...secondKinds]) {
      const upstream = second ? [first, second] : [first];
      if (upstream.some((id) => roundKinds.has(id))) continue;
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
}
