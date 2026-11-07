import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { stackFixture } from '../../modifier_stack_fixture.js';
import { arrayTestCentre } from './modifier_stack_array_test_helpers.js';

/**
 * Builds a three-copy linear array of the unit cube plus a cap brush.
 *
 * @param caps Cap parameters, given the cap mesh uuid.
 * @returns Fixture and cap brush.
 */
function capFixture(caps: (capId: string) => Record<string, unknown>) {
  const fixture = stackFixture([{ kind: 'linear', parameters: { mode: 'fixed', count: 3, offsetX: 2 } }], 40);
  const cap = fixture.model.addBoxBrush(1, SolidOperation.Additive);
  cap.mesh?.position.set(0, 3, 0);
  cap.mesh?.scale.set(0.5, 0.5, 0.5);
  const stack = fixture.volume.userData;
  const step = (stack['modifierStack'] as { modifiers: { parameters: Record<string, unknown> }[] }).modifiers[0];
  if (step) Object.assign(step.parameters, caps(cap.mesh?.uuid ?? ''));
  return { ...fixture, cap };
}

/**
 * Returns the centres of the compiled copies of one brush.
 *
 * @param instances Compile list.
 * @param id Source brush id.
 * @returns Centres of its copies.
 */
function copiesOf(instances: readonly { id: string }[], id: string): THREE.Vector3[] {
  return instances
    .filter((instance) => instance.id.startsWith(`${id}#`))
    .map((instance) => arrayTestCentre(instance as Parameters<typeof arrayTestCentre>[0]));
}

describe('array caps', () => {
  it('places the start cap one step before the first piece and the end cap one step after the last', () => {
    const fixture = capFixture((id) => ({ startCap: id, endCap: id }));
    const instances = fixture.compile().instances;
    const caps = copiesOf(instances, fixture.cap.id);
    expect(caps.map((centre) => centre.x).sort((a, b) => a - b)).toEqual([expect.closeTo(-2, 6), expect.closeTo(6, 6)]);
    for (const centre of caps) expect(centre.y).toBeCloseTo(0, 6);
    expect(copiesOf(instances, fixture.source.id)).toHaveLength(2);
  });

  it('never arrays the cap itself even inside the volume', () => {
    const fixture = capFixture((id) => ({ endCap: id }));
    const instances = fixture.compile().instances;
    expect(copiesOf(instances, fixture.cap.id)).toHaveLength(1);
    expect(modifierStackStatusRead(fixture.volume)?.captured).toBe(1);
  });

  it('skips a deleted cap and says so', () => {
    const fixture = capFixture((id) => ({ startCap: id }));
    expect(copiesOf(fixture.compile().instances, fixture.cap.id)).toHaveLength(1);
    fixture.model.removeBrush(fixture.cap.id, false, false);
    const instances = fixture.compile().instances;
    expect(instances.filter((instance) => instance.id.startsWith(`${fixture.cap.id}#`))).toHaveLength(0);
    expect(modifierStackStatusRead(fixture.volume)?.steps[0]?.error).toContain('Start cap not found');
  });

  it('re-evaluates when the cap changes shape', () => {
    const fixture = capFixture((id) => ({ endCap: id }));
    const before = fixture.compile().instances.find((instance) => instance.id.startsWith(`${fixture.cap.id}#`));
    fixture.cap.mesh?.scale.set(1, 2, 1);
    const after = fixture.compile().instances.find((instance) => instance.id.startsWith(`${fixture.cap.id}#`));
    expect(after).not.toBe(before);
    const height = (instance: typeof after) =>
      new THREE.Box3().setFromPoints(instance?.brush.vertices ?? []).getSize(new THREE.Vector3()).y;
    expect(height(after)).toBeCloseTo(2, 6);
  });

  it('never captures a cap group, so its pieces are only placed as the cap', () => {
    const fixture = capFixture(() => ({}));
    const group = new THREE.Group();
    fixture.model.root.add(group);
    if (fixture.source.mesh) group.add(fixture.source.mesh);
    const step = (fixture.volume.userData['modifierStack'] as { modifiers: { parameters: Record<string, unknown> }[] })
      .modifiers[0];
    if (step) step.parameters['endCap'] = group.uuid;
    const instances = fixture.compile().instances;
    expect(copiesOf(instances, fixture.source.id)).toHaveLength(1);
    expect(copiesOf(instances, fixture.cap.id)).toHaveLength(2);
    expect(modifierStackStatusRead(fixture.volume)?.captured).toBe(1);
  });

  it('defaults caps to none for saved arrays and offers no caps on mirrors', () => {
    const parameters = modifierStackKindFind('linear')?.normalizeParameters({ count: 3 }) ?? {};
    expect([parameters['startCap'], parameters['endCap']]).toEqual(['', '']);
    expect(modifierStackKindFind('mirror')?.fields.some((field) => field.key === 'startCap')).toBe(false);
    expect(modifierStackKindFind('radial')?.normalizeParameters({ startCap: 'bad id!' })['startCap']).toBe('');
  });
});
