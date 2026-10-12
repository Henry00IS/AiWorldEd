import type * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { ModifierVolumeBevel } from './modifier_volume_bevel.js';

/** One volume distance change stored for undo. */
interface ModifierBevelDistanceChange {
  volume: THREE.Object3D;
  before: number;
  after: number;
}

/** Undoable chamfer-distance edit for one or more bevel volumes. */
export class CommandModifierBevelDistanceSet implements UndoCommand {
  private readonly changes: ModifierBevelDistanceChange[];

  /**
   * Creates the command.
   *
   * @param changes Per-volume before/after distances.
   */
  constructor(changes: ModifierBevelDistanceChange[]) {
    this.changes = changes;
  }

  /** Applies the new distances and rebuilds overlapping brushes. */
  execute(): void {
    this.apply((change) => change.after);
  }

  /** Restores the previous distances and rebuilds overlapping brushes. */
  undo(): void {
    this.apply((change) => change.before);
  }

  /**
   * Writes one side of the edit and refreshes the scene.
   *
   * @param select Distance selector.
   */
  private apply(select: (change: ModifierBevelDistanceChange) => number): void {
    for (const change of this.changes) ModifierVolumeBevel.writeDistance(change.volume, select(change));
    const root = this.changes[0]?.volume.parent;
    if (root) modifierBevelRefreshScene(sceneRootFrom(root));
  }
}

/**
 * Walks to the scene root from a parented object.
 *
 * @param object Start object.
 * @returns Root.
 */
function sceneRootFrom(object: THREE.Object3D): THREE.Object3D {
  let current = object;
  while (current.parent) current = current.parent;
  return current;
}
