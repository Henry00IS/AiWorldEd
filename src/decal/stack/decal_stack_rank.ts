import * as THREE from 'three';
import { DecalProjectorSettingsStore } from '@/decal/settings/decal_projector_settings.js';

/** Depth two decal boxes must overlap by before they stack, in world units. */
const DECAL_STACK_OVERLAP_MINIMUM = 1e-4;

/** A decal box in world space: centre, unit axes and half sizes along them. */
interface DecalStackBox {
  centre: THREE.Vector3;
  axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  halves: [number, number, number];
}

/**
 * Returns how high each decal stacks. Only decals whose boxes really overlap
 * stack; boxes that merely touch or sit side by side do not. Taken in order,
 * each decal gets the lowest level no earlier overlapping decal holds, so a
 * decal alone stays at level 0, any two overlapping decals differ, and a row of
 * decals that each overlap only their neighbours alternates instead of
 * climbing. Order is the Layer override first (lower first) and hierarchy order
 * second, so later decals draw on top of what they overlap.
 *
 * @param projectors Projectors of one model in hierarchy order.
 * @returns Stacking rank per projector, in the same order.
 */
export function decalStackRanks(projectors: readonly THREE.Object3D[]): number[] {
  const layers = projectors.map((projector) => DecalProjectorSettingsStore.read(projector).layer);
  const order = projectors.map((_, index) => index).sort((a, b) => layers[a]! - layers[b]! || a - b);
  const boxes = projectors.map(decalStackBoxOf);
  const ranks = new Array<number>(projectors.length).fill(0);
  for (let position = 0; position < order.length; position++) {
    const index = order[position]!;
    const taken = new Set<number>();
    for (let below = 0; below < position; below++) {
      const other = order[below]!;
      if (decalStackBoxesOverlap(boxes[index]!, boxes[other]!)) taken.add(ranks[other]!);
    }
    let level = 0;
    while (taken.has(level)) level++;
    ranks[index] = level;
  }
  return ranks;
}

/**
 * Remembers the last stacking ranks of a model's decals and recomputes them
 * only when a decal moved, its Layer changed, or the hierarchy order changed.
 */
export class DecalStackSolver {
  private signature: number[] = [];
  private projectors: readonly THREE.Object3D[] = [];
  private ranks: number[] = [];

  /**
   * Returns the stacking rank of every projector.
   *
   * @param projectors Projectors of one model in hierarchy order.
   * @returns Stacking rank per projector, in the same order.
   */
  solve(projectors: readonly THREE.Object3D[]): readonly number[] {
    const signature = decalStackSignature(projectors);
    if (this.unchanged(projectors, signature)) return this.ranks;
    this.signature = signature;
    this.projectors = [...projectors];
    this.ranks = decalStackRanks(projectors);
    return this.ranks;
  }

  /**
   * Returns whether the projectors and their poses and layers are as last time.
   *
   * @param projectors Current projectors.
   * @param signature Their current signature.
   * @returns True when nothing that affects stacking changed.
   */
  private unchanged(projectors: readonly THREE.Object3D[], signature: readonly number[]): boolean {
    if (projectors.length !== this.projectors.length || signature.length !== this.signature.length) return false;
    for (let index = 0; index < projectors.length; index++)
      if (projectors[index] !== this.projectors[index]) return false;
    for (let index = 0; index < signature.length; index++) if (signature[index] !== this.signature[index]) return false;
    return true;
  }
}

/**
 * Lists every number stacking depends on: each projector's world matrix and
 * Layer.
 *
 * @param projectors Projectors in hierarchy order.
 * @returns Flat number list.
 */
function decalStackSignature(projectors: readonly THREE.Object3D[]): number[] {
  const signature: number[] = [];
  for (const projector of projectors) {
    signature.push(...projector.matrixWorld.elements, DecalProjectorSettingsStore.read(projector).layer);
  }
  return signature;
}

/**
 * Returns the world box of a projector, whose local box spans -0.5 to 0.5.
 *
 * @param projector Decal projector.
 * @returns World box.
 */
function decalStackBoxOf(projector: THREE.Object3D): DecalStackBox {
  const centre = new THREE.Vector3();
  const axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  projector.matrixWorld.extractBasis(axes[0], axes[1], axes[2]);
  centre.setFromMatrixPosition(projector.matrixWorld);
  const halves = axes.map((axis) => {
    const length = axis.length();
    if (length > 0) axis.divideScalar(length);
    return length / 2;
  }) as [number, number, number];
  return { centre, axes, halves };
}

/**
 * Returns whether two world boxes overlap by more than a sliver, testing every
 * separating axis two boxes can have.
 *
 * @param first First box.
 * @param second Second box.
 * @returns True unless some axis separates them or leaves them only touching.
 */
function decalStackBoxesOverlap(first: DecalStackBox, second: DecalStackBox): boolean {
  const offset = new THREE.Vector3().subVectors(second.centre, first.centre);
  const candidates: THREE.Vector3[] = [...first.axes, ...second.axes];
  for (const a of first.axes) {
    for (const b of second.axes) {
      const cross = new THREE.Vector3().crossVectors(a, b);
      if (cross.lengthSq() > 1e-10) candidates.push(cross.normalize());
    }
  }
  const reach = (box: DecalStackBox, axis: THREE.Vector3) =>
    box.halves[0] * Math.abs(box.axes[0].dot(axis)) +
    box.halves[1] * Math.abs(box.axes[1].dot(axis)) +
    box.halves[2] * Math.abs(box.axes[2].dot(axis));
  for (const axis of candidates) {
    if (Math.abs(offset.dot(axis)) > reach(first, axis) + reach(second, axis) - DECAL_STACK_OVERLAP_MINIMUM)
      return false;
  }
  return true;
}
