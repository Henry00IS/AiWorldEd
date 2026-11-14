import type * as THREE from 'three';
import { DecalProjectorSettingsStore } from '@/decal/settings/decal_projector_settings.js';

/**
 * Returns how many decals stack below each projector: lower layers first, and
 * within a layer earlier scene order first. A decal's stacking rank multiplies
 * its layer lift, so overlapping decals sit at distinct heights both in the
 * editor and in exported meshes, without relying on draw order or depth bias.
 *
 * @param projectors Projectors of one model in scene order.
 * @returns Stacking rank per projector, in the same order.
 */
export function decalStackRanks(projectors: readonly THREE.Object3D[]): number[] {
  const layers = projectors.map((projector) => DecalProjectorSettingsStore.read(projector).layer);
  const sorted = projectors.map((_, index) => index).sort((a, b) => (layers[a] ?? 0) - (layers[b] ?? 0) || a - b);
  const ranks: number[] = [];
  sorted.forEach((index, rank) => (ranks[index] = rank));
  return ranks;
}
