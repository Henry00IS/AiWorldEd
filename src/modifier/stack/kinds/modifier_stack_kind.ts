import type * as THREE from 'three';
import type {
  ModifierStackField,
  ModifierStackPreset,
  ModifierStackUnit,
} from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { modifierStackFieldsNormalize } from '@/modifier/stack/modifier_stack_fields.js';

/** Menu grouping of a modifier kind. */
export type ModifierStackCategory = 'generate' | 'duplicate' | 'shape';

/**
 * How a kind's output follows its volume when the volume only moves or turns:
 * 'rigid' carries geometry and textures along any move or turn; 'translate'
 * carries geometry along a move only, with textures staying world aligned.
 */
export type ModifierStackPoseFollow = 'rigid' | 'translate';

/** Base class of every modifier that can sit in a volume's stack. */
export abstract class ModifierStackKind {
  /** Persisted kind id. */
  abstract readonly id: string;
  /** Default display name. */
  abstract readonly label: string;
  /** Add-menu grouping. */
  abstract readonly category: ModifierStackCategory;
  /** One-line description shown as hover help. */
  abstract readonly description: string;
  /** Inspector fields; kinds with custom inspectors may return none. */
  abstract readonly fields: readonly ModifierStackField[];
  /** Parameter presets the inspector offers; none by default. */
  readonly presets: readonly ModifierStackPreset[] = [];

  /**
   * Returns complete, valid parameters for this kind.
   *
   * @param input Stored or partial parameters.
   * @returns Normalized parameters.
   */
  normalizeParameters(input: Record<string, unknown>): Record<string, unknown> {
    return modifierStackFieldsNormalize(this.fields, input);
  }

  /**
   * Returns the parameters a newly added modifier starts with. Field defaults
   * stay what older saves imply, so a kind can give new modifiers different
   * starting values here without changing how old files load.
   *
   * @returns Partial parameters, normalized afterwards.
   */
  createParameters(): Record<string, unknown> {
    return {};
  }

  /**
   * Returns the curve a curve field shows while it stores no curve, such as a
   * profile rebuilt from an older save.
   *
   * @param _key Field key.
   * @param _parameters Normalized parameters.
   * @param _volume Owning volume.
   * @returns Encoded curve, or empty for the field's own default.
   */
  curveFallback(_key: string, _parameters: Record<string, unknown>, _volume: THREE.Object3D): string {
    return '';
  }

  /**
   * Returns whether authored brushes still flow to later modifiers.
   *
   * @param _parameters Normalized parameters.
   * @returns True unless the kind replaces its input.
   */
  passesAuthoredInput(_parameters: Record<string, unknown>): boolean {
    return true;
  }

  /**
   * Builds the helper visualizations this modifier draws inside its volume,
   * such as a mirror plane. They are shown only while the volume is edited in
   * the inspector and this modifier's card is unfolded; they are never saved or
   * picked.
   *
   * @param _volume Owning volume.
   * @param _parameters Normalized parameters.
   * @returns Helper objects in the volume's local space, or none.
   */
  helpers(_volume: THREE.Object3D, _parameters: Record<string, unknown>): THREE.Object3D[] {
    return [];
  }

  /**
   * Returns how the output follows a pure move or turn of the volume, so a
   * moved volume can carry its last output instead of evaluating again. The
   * default re-evaluates on every pose change.
   *
   * @param _parameters Normalized parameters.
   * @returns Follow mode, or null when the output depends on the pose.
   */
  volumePoseFollow(_parameters: Record<string, unknown>): ModifierStackPoseFollow | null {
    return null;
  }

  /**
   * Returns a short header summary such as a copy count.
   *
   * @param _parameters Normalized parameters.
   * @returns Summary text, or empty.
   */
  summary(_parameters: Record<string, unknown>): string {
    return '';
  }

  /**
   * Transforms the working set.
   *
   * @param units Output of the previous modifier.
   * @param context Evaluation context.
   * @returns Units handed to the next modifier.
   */
  abstract apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[];
}
