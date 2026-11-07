import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { SelectionClickThrough } from '@/selection/object/selection_click_through.js';
import {
  modifierStackDerivedOriginOf,
  modifierStackPickNoteTake,
  modifierStackPickTargets,
} from '@/modifier/stack/pick/modifier_stack_pick.js';
import { PanelPropertiesModifierStackSection } from '@/modifier/stack/ui/panel_properties_modifier_stack_section.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { stackFixture } from '../modifier_stack_fixture.js';

/**
 * Builds a hit on the first result triangle made by a modifier.
 *
 * @param fixture Stack fixture after refresh.
 * @returns Intersection on a derived triangle.
 */
function derivedHit(fixture: ReturnType<typeof stackFixture>): THREE.Intersection {
  const mesh = fixture.model.getResultMesh();
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as { brushId: string; derivedId?: string }[];
  const faceIndex = sources.findIndex((source) => (source.derivedId ?? source.brushId).includes('#'));
  expect(faceIndex).toBeGreaterThanOrEqual(0);
  return { object: mesh, faceIndex, distance: 1, point: mesh.position.clone() } as THREE.Intersection;
}

describe('picking modifier output', () => {
  it('reads the volume, modifier and source from derived ids', () => {
    expect(modifierStackDerivedOriginOf('brush-1')).toBeNull();
    expect(modifierStackDerivedOriginOf('brush-1#vol:step-a:2')).toEqual({
      volumeUuid: 'vol',
      stepId: 'step-a',
      sourceId: 'brush-1',
    });
    expect(modifierStackDerivedOriginOf('vol#gen:3')).toEqual({ volumeUuid: 'vol', stepId: 'gen', sourceId: null });
    expect(modifierStackDerivedOriginOf('vol#gen:3#vol:mirror:1')).toEqual({
      volumeUuid: 'vol',
      stepId: 'mirror',
      sourceId: null,
    });
  });

  it('puts the owning volume first and the source brush next in the click-through stack', () => {
    const fixture = stackFixture([{ kind: 'linear', parameters: { mode: 'fixed', offsetX: 3, count: 2 } }], 2);
    fixture.refresh();
    const stack = SelectionClickThrough.uniqueMeshesFromHits([derivedHit(fixture)], (mesh) => mesh);
    expect(stack).toEqual([fixture.volume, fixture.source.mesh]);
  });

  it('selects only the volume for generated pieces and outlines the modifier that made them', () => {
    const fixture = stackFixture([{ kind: 'stairs', parameters: { sizing: 'count', count: 3 } }], 2);
    fixture.refresh();
    expect(modifierStackPickTargets(derivedHit(fixture))).toEqual([fixture.volume]);
    const section = new PanelPropertiesModifierStackSection(
      () => document.createElement('section'),
      (title) => Object.assign(document.createElement('header'), { textContent: title }),
    );
    section.updateFromObjects([fixture.volume]);
    const stepName = ModifierVolume.read(fixture.volume).modifiers[0]?.name ?? '';
    expect(section.getElement().textContent).toContain(`picked piece: ${stepName}`);
    expect(section.getElement().querySelectorAll('[data-picked="true"]')).toHaveLength(1);
    expect(modifierStackPickNoteTake(fixture.volume)).toBeUndefined();
  });
});
