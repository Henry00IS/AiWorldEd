import type * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import type { ModifierStackSettings } from './modifier_stack_types.js';
import { ModifierVolume, modifierVolumeSceneRoot } from './modifier_volume.js';
import {
  modifierStackOwnerCandidate,
  modifierStackOwnerDecode,
  modifierStackOwnerEncode,
} from './owner/modifier_stack_owner.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
  MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
} from './kinds/generator/solid_script/modifier_stack_solid_script_keys.js';

/**
 * Undoable edit of a modifier volume's stack, or the stack a brush or CSG group
 * owns: adding, removing, reordering, muting or retuning modifiers, and
 * volume-wide capture settings.
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
  private apply(target: ModifierStackSettings): void {
    const settings = this.scriptsKept(target);
    if (modifierStackOwnerCandidate(this.volume)) modifierStackOwnerDecode(this.volume, settings);
    else ModifierVolume.write(this.volume, settings);
    if (this.volume.parent) modifierBevelRefreshScene(modifierVolumeSceneRoot(this.volume));
  }

  /**
   * Keeps the live script of every SolidScript generator or modifier step whose
   * script this command did not change itself: scripts have their own undo
   * history in the script editor, so scene undo and redo leave them alone.
   *
   * @param target Settings to apply.
   * @returns Settings with the live scripts kept.
   */
  private scriptsKept(target: ModifierStackSettings): ModifierStackSettings {
    const live = ModifierVolume.isVolume(this.volume)
      ? ModifierVolume.read(this.volume)
      : modifierStackOwnerEncode(this.volume);
    if (!live) return target;
    const script = (settings: ModifierStackSettings, id: string): unknown =>
      settings.modifiers.find((entry) => entry.id === id)?.parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY];
    const modifiers = target.modifiers.map((entry) => {
      if (entry.kind !== MODIFIER_STACK_SOLID_SCRIPT_KIND && entry.kind !== MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND)
        return entry;
      if (JSON.stringify(script(this.before, entry.id)) !== JSON.stringify(script(this.after, entry.id))) return entry;
      const kept = script(live, entry.id);
      if (kept === undefined) return entry;
      return {
        ...entry,
        parameters: { ...entry.parameters, [MODIFIER_STACK_SOLID_SCRIPT_KEY]: structuredClone(kept) },
      };
    });
    return { ...target, modifiers };
  }
}
