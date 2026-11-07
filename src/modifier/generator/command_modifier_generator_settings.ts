import type * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import type { GeneratorSettings } from './modifier_generator_types.js';
import { ModifierGeneratorVolume, generatorSceneRoot } from './modifier_generator_volume.js';
import { generatorRefreshScene } from './modifier_generator_refresh.js';

/** Undoable normalized authored generator edit. */
export class CommandModifierGeneratorSettings implements UndoCommand {
  /**
   * Captures the edit. @param volume Authored selector. @param before Previous
   * settings. @param after New settings.
   */
  constructor(
    private readonly volume: THREE.Object3D,
    private readonly before: GeneratorSettings,
    private readonly after: GeneratorSettings,
  ) {}
  /** Applies the new state. */
  execute(): void {
    this.apply(this.after);
  }
  /** Restores the previous state. */
  undo(): void {
    this.apply(this.before);
  }
  /** Writes and rebuilds. @param settings Desired state. */
  private apply(settings: GeneratorSettings): void {
    ModifierGeneratorVolume.write(this.volume, settings);
    generatorRefreshScene(generatorSceneRoot(this.volume));
  }
}
