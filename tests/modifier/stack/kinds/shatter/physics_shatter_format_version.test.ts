import { describe, expect, it } from 'vitest';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { MODIFIER_STACK_KIND_PHYSICS_SHATTER } from '@/modifier/stack/kinds/shatter/modifier_stack_kind_physics_shatter.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { physicsShatterInputHash } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_hash.js';
import { PHYSICS_SHATTER_FRACTURE_VERSION } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_fracture_version.js';
import { physicsShatterTransformIdentity } from '@/modifier/stack/kinds/shatter/physics_shatter_transform.js';
import {
  PHYSICS_SHATTER_BAKE_STALE,
  physicsShatterBakeStateRead,
} from '@/modifier/stack/kinds/shatter/physics_shatter_bake_state.js';
import {
  PHYSICS_SHATTER_FORMAT_FUTURE,
  PHYSICS_SHATTER_FORMAT_VERSION,
  PHYSICS_SHATTER_FORMAT_VERSION_KEY,
  physicsShatterBakeParameters,
  physicsShatterFormatVersionOf,
} from '@/modifier/stack/kinds/shatter/physics_shatter_format_version.js';
import { stackFixture } from '../../modifier_stack_fixture.js';
import {
  physicsShatterTestInputs,
  physicsShatterTestSettings,
  physicsShatterTestWall,
} from './fracture/physics_shatter_fixtures.js';

/**
 * Returns the installed Physics Shatter kind.
 *
 * @returns Kind.
 */
function shatterKind() {
  const kind = modifierStackKindFind(MODIFIER_STACK_KIND_PHYSICS_SHATTER);
  if (!kind) throw new Error('Physics Shatter is not installed');
  return kind;
}

describe('physics shatter format version', () => {
  it('starts new modifiers and bakes at the current version', () => {
    const kind = shatterKind();
    const created = kind.normalizeParameters(kind.createParameters());
    expect(created[PHYSICS_SHATTER_FORMAT_VERSION_KEY]).toBe(PHYSICS_SHATTER_FORMAT_VERSION);
    const baked = kind.normalizeParameters({ ...created, ...physicsShatterBakeParameters('AAAA', '0123456789abcdef') });
    expect(baked).toMatchObject({
      formatVersion: PHYSICS_SHATTER_FORMAT_VERSION,
      bake: 'AAAA',
      bakeHash: '0123456789abcdef',
    });
  });

  it('reads missing or malformed versions as version 1 and keeps their bake', () => {
    for (const stored of [undefined, '2', 1.5, -3, 0, null]) {
      expect(physicsShatterFormatVersionOf({ formatVersion: stored })).toBe(1);
    }
    const legacy = shatterKind().normalizeParameters({ bake: 'AAAA', bakeHash: '0123456789abcdef' });
    expect(legacy).toMatchObject({ formatVersion: 1, bake: 'AAAA', bakeHash: '0123456789abcdef' });
  });

  it('keeps an unknown future version and shows the pieces unbroken with a warning', () => {
    const future = PHYSICS_SHATTER_FORMAT_VERSION + 1;
    expect(shatterKind().normalizeParameters({ formatVersion: future })[PHYSICS_SHATTER_FORMAT_VERSION_KEY]).toBe(
      future,
    );
    const parameters = { formatVersion: future, crackSize: 0.4, bake: 'AAAA', bakeHash: '0123456789abcdef' };
    const fixture = stackFixture([{ kind: MODIFIER_STACK_KIND_PHYSICS_SHATTER, parameters }]);
    expect(() => fixture.compile()).not.toThrow();
    const status = modifierStackStatusRead(fixture.volume);
    expect(status?.steps[0]?.error).toContain(PHYSICS_SHATTER_FORMAT_FUTURE);
    expect(status?.steps[0]?.error).not.toContain(PHYSICS_SHATTER_BAKE_STALE);
    expect(status?.derived ?? 0).toBeGreaterThan(1);
    const step = (fixture.volume.userData['modifierStack'] as { modifiers: { id: string }[] } | undefined)
      ?.modifiers[0];
    expect(physicsShatterLastRunOf(fixture.volume.uuid, step?.id ?? '')?.status).toBe('unsupported');
  });

  it('hashes the fracture version so a bake from an older algorithm turns stale', () => {
    const inputs = physicsShatterTestInputs(physicsShatterTestWall(2, 2, 0.2));
    const settings = physicsShatterTestSettings();
    const current = physicsShatterInputHash(inputs, settings);
    expect(physicsShatterInputHash(inputs, settings, PHYSICS_SHATTER_FRACTURE_VERSION)).toBe(current);
    const older = physicsShatterInputHash(inputs, settings, PHYSICS_SHATTER_FRACTURE_VERSION - 1);
    expect(older).not.toBe(current);
    const decode = (_bake: string, count: number) => Array.from({ length: count }, physicsShatterTransformIdentity);
    const stored = (hash: string) => ({ bake: 'AAAA', bakeHash: hash });
    expect(physicsShatterBakeStateRead(stored(older), { bakeKey: current, inputHash: current }, 3, decode).status).toBe(
      'stale',
    );
    expect(
      physicsShatterBakeStateRead(stored(current), { bakeKey: current, inputHash: current }, 3, decode).status,
    ).toBe('baked');
  });
});
