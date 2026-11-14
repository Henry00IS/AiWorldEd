import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecalStackSolver, decalStackRanks } from '@/decal/stack/decal_stack_rank.js';
import { decalTestParametersSet, decalTestProjector } from '../decal_test_fixture.js';

/**
 * Places unit decal boxes at x positions in one world.
 *
 * @param xs Box centre x positions, in hierarchy order.
 * @returns Projectors.
 */
function decalsAt(...xs: number[]): THREE.Mesh[] {
  const world = new THREE.Group();
  const projectors = xs.map((x) => {
    const projector = decalTestProjector();
    projector.position.set(x, 0, 0);
    world.add(projector);
    return projector;
  });
  world.updateMatrixWorld(true);
  return projectors;
}

describe('decal stacking', () => {
  it('gives decals that overlap nothing no extra lift', () => {
    expect(decalStackRanks(decalsAt(0, 3, 6))).toEqual([0, 0, 0]);
  });

  it('stacks overlapping decals in hierarchy order, later on top, but not ones that only touch', () => {
    expect(decalStackRanks(decalsAt(0, 0.5))).toEqual([0, 1]);
    expect(decalStackRanks(decalsAt(0, 1))).toEqual([0, 0]);
    expect(decalStackRanks(decalsAt(0, 1.01))).toEqual([0, 0]);
  });

  it('never climbs along a row of decals that touch or overlap only their neighbours', () => {
    const touching = Array.from({ length: 20 }, (_, index) => index);
    expect(decalStackRanks(decalsAt(...touching))).toEqual(touching.map(() => 0));
    const overlapping = Array.from({ length: 20 }, (_, index) => index * 0.8);
    expect(Math.max(...decalStackRanks(decalsAt(...overlapping)))).toBe(1);
    expect(decalStackRanks(decalsAt(0, 1.6, 0.8))).toEqual([0, 0, 1]);
    expect(decalStackRanks(decalsAt(0, 0.1, 0.2))).toEqual([0, 1, 2]);
  });

  it('sees overlap between turned boxes exactly', () => {
    const [a, b] = decalsAt(0, 1.2);
    expect(decalStackRanks([a!, b!])).toEqual([0, 0]);
    a!.rotation.y = Math.PI / 4;
    a!.updateMatrixWorld(true);
    expect(decalStackRanks([a!, b!])).toEqual([0, 1]);
  });

  it('lets the Layer override sort before hierarchy order', () => {
    const [first, second] = decalsAt(0, 0.5);
    decalTestParametersSet(first!, { layer: 1 });
    expect(decalStackRanks([first!, second!])).toEqual([1, 0]);
  });

  it('recomputes only when a decal moves, changes layer or the order changes', () => {
    const [a, b] = decalsAt(0, 3);
    const solver = new DecalStackSolver();
    const before = solver.solve([a!, b!]);
    expect(before).toEqual([0, 0]);
    expect(solver.solve([a!, b!])).toBe(before);
    b!.position.x = 0.5;
    b!.updateMatrixWorld(true);
    expect(solver.solve([a!, b!])).toEqual([0, 1]);
    expect(solver.solve([b!, a!])).toEqual([0, 1]);
    decalTestParametersSet(a!, { layer: -1 });
    expect(solver.solve([b!, a!])).toEqual([1, 0]);
  });
});
