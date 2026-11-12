import type * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { modifierBevelRefreshAfterVolumeChange } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import type { ModifierStackSettings } from './modifier_stack_types.js';
import { ModifierVolume, modifierVolumeSceneRoot } from './modifier_volume.js';

/**
 * Undoable edit of a modifier volume's stack: adding, removing, reordering,
 * muting or retuning modifiers, and volume-wide capture settings.
 */
export class CommandModifierStackSet implements UndoCommand {
  private readonly volume: THREE.Object3D;
  private readonly before: ModifierStackSettings;
  private readonly after: ModifierStackSettings;

  /**
   * Creates the command.
   *
   * @param volume Modifier volume.
   * @param before Stack before the edit.
   * @param after Stack after the edit.
   */
  constructor(volume: THREE.Object3D, before: ModifierStackSettings, after: ModifierStackSettings) {
    this.volume = volume;
    this.before = structuredClone(before);
    this.after = structuredClone(after);
  }

  /** Writes the edited stack and re-evaluates the scene. */
  execute(): void {
    this.apply(this.after);
  }

  /** Restores the previous stack and re-evaluates the scene. */
  undo(): void {
    this.apply(this.before);
  }

  /**
   * Writes one side of the edit.
   *
   * @param settings Stack to store.
   */
  private apply(settings: ModifierStackSettings): void {
    ModifierVolume.write(this.volume, settings);
    if (this.volume.parent) modifierBevelRefreshAfterVolumeChange(modifierVolumeSceneRoot(this.volume));
  }
}
