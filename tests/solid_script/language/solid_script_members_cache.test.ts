import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidScriptElements } from '@/solid_script/language/solid_script_elements.js';
import { solidScriptMemberRead } from '@/solid_script/language/solid_script_members.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';

/** A box brush of a size with its lowest corner at a spot. */
function box(at: number, size = 1): SolidScriptShapeSolid {
  const points: THREE.Vector3[] = [];
  for (const x of [0, size])
    for (const y of [0, size]) for (const z of [0, size]) points.push(new THREE.Vector3(at + x, y, z));
  return { kind: 'solid', label: 'Box', points };
}

describe('SolidScript member cache', () => {
  it('reads the bounds of a list in one pass and keeps them until a brush in it changes', () => {
    const swaps = new Map<SolidScriptShapeSolid, SolidScriptShapeSolid>();
    const elements = new SolidScriptElements({
      leafLatest: (leaf) => swaps.get(leaf as SolidScriptShapeSolid) ?? leaf,
    });
    const first = box(0);
    const list = [elements.brush(first), elements.brush(box(3))];
    expect(solidScriptMemberRead(list, 'center', elements)).toEqual([2, 0.5, 0.5]);
    expect(solidScriptMemberRead(list, 'min', elements)).toEqual([0, 0, 0]);
    expect(solidScriptMemberRead([...list], 'max', elements)).toEqual([4, 1, 1]);
    expect(solidScriptMemberRead(list, 'size', elements)).toEqual([4, 1, 1]);
    expect(elements.boundsPasses).toBe(1);
    swaps.set(first, box(-2));
    expect(solidScriptMemberRead(list, 'min', elements)).toEqual([-2, 0, 0]);
    expect(elements.boundsPasses).toBe(2);
    expect(solidScriptMemberRead(list[1]!, 'center', elements)).toEqual([3.5, 0.5, 0.5]);
    expect(solidScriptMemberRead(list[1]!, 'extents', elements)).toEqual([0.5, 0.5, 0.5]);
    expect(elements.boundsPasses).toBe(3);
  });
});
