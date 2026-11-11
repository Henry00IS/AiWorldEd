import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierStackObjectChoices } from '@/modifier/stack/ui/modifier_stack_object_choices.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';
import { MODIFIER_STACK_ARRAY_CAP_FIELDS } from '@/modifier/stack/kinds/array/modifier_stack_array_caps.js';
import { stackFixture } from '../modifier_stack_fixture.js';

describe('modifier stack object picker', () => {
  it('lists authored groups and brushes, indented, but no derived pieces', () => {
    const fixture = stackFixture([{ kind: 'linear', parameters: { count: 3 } }]);
    const group = new THREE.Group();
    group.name = 'Pillar';
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    fixture.model.root.add(group);
    const inner = fixture.model.addBoxBrush(1, SolidOperation.Additive);
    if (inner.mesh) group.add(inner.mesh);
    fixture.compile();
    const choices = modifierStackObjectChoices(fixture.volume);
    expect(choices.map((choice) => choice.value)).toEqual(
      expect.arrayContaining([fixture.source.mesh?.uuid, group.uuid, inner.mesh?.uuid]),
    );
    expect(choices.find((choice) => choice.value === inner.mesh?.uuid)?.label.startsWith('\u00a0')).toBe(true);
    expect(choices).toHaveLength(3);
  });

  it('commits the picked id and keeps a missing id visible', () => {
    const committed: unknown[] = [];
    const rows = new ModifierStackFieldRows(
      MODIFIER_STACK_ARRAY_CAP_FIELDS,
      (key, value) => committed.push([key, value]),
      () => [{ value: 'abc', label: 'Cap' }],
    );
    rows.update({ startCap: 'gone', endCap: '' });
    const selects = rows.getElement().querySelectorAll('select');
    const start = selects[0];
    if (!start) throw new Error('Expected a start cap picker');
    expect([...start.options].map((option) => option.textContent)).toContain('Missing Object');
    start.value = 'abc';
    start.dispatchEvent(new Event('change'));
    expect(committed).toEqual([['startCap', 'abc']]);
  });
});
