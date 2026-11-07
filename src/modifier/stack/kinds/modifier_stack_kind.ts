import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { modifierStackFieldsNormalize } from '@/modifier/stack/modifier_stack_fields.js';

/** Menu grouping of a modifier kind. */
export type ModifierStackCategory = 'generate' | 'duplicate' | 'shape';

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
   * Returns whether authored brushes still flow to later modifiers.
   *
   * @param _parameters Normalized parameters.
   * @returns True unless the kind replaces its input.
   */
  passesAuthoredInput(_parameters: Record<string, unknown>): boolean {
    return true;
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
