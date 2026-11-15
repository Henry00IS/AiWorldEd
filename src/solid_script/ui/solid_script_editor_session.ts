import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import {
  modifierStackParametersCommit,
  modifierStackParametersRead,
} from '@/modifier/stack/modifier_stack_parameters_commit.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KEY,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_kind_solid_script.js';
import { solidScriptInspectorInputValues } from './solid_script_inspector_inputs.js';
import {
  solidScriptDocumentNormalize,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';

/**
 * Connects a script editor to one SolidScript generator in the level. The
 * script lives only in the generator's parameters, so undo, redo and edits of
 * other users show up by reading it again.
 */
export class SolidScriptEditorSession {
  /**
   * Creates a session.
   *
   * @param node Generator node.
   * @param stepId Modifier id of the script.
   * @param commandStack Undo stack edits are recorded on, or null to apply
   *   directly.
   */
  constructor(
    readonly node: THREE.Object3D,
    readonly stepId: string,
    private readonly commandStack: CommandStack | null,
  ) {}

  /**
   * Returns whether the generator and its script are still in the level.
   *
   * @returns True while editable.
   */
  exists(): boolean {
    return this.node.parent !== null && modifierStackParametersRead(this.node, this.stepId) !== undefined;
  }

  /**
   * Returns the stored script and input values as text, to notice changes made
   * elsewhere, such as an undo or a new value in the inspector.
   *
   * @returns Revision text.
   */
  revision(): string {
    const parameters = modifierStackParametersRead(this.node, this.stepId);
    return JSON.stringify([
      parameters?.[MODIFIER_STACK_SOLID_SCRIPT_KEY] ?? null,
      parameters?.[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY] ?? null,
    ]);
  }

  /**
   * Reads the stored script.
   *
   * @returns Script.
   */
  document(): SolidScriptDocument {
    return solidScriptDocumentNormalize(
      modifierStackParametersRead(this.node, this.stepId)?.[MODIFIER_STACK_SOLID_SCRIPT_KEY],
    );
  }

  /**
   * Reads the values the inspector set for the script's Input lines.
   *
   * @returns Input values as text by name.
   */
  inputs(): Record<string, string> {
    return solidScriptInspectorInputValues(
      modifierStackParametersRead(this.node, this.stepId)?.[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY],
    );
  }

  /**
   * Stores a new script as one undo step and rebuilds the generator.
   *
   * @param document Script.
   * @returns False when the generator is gone or nothing changed.
   */
  commit(document: SolidScriptDocument): boolean {
    const stored = modifierStackParametersRead(this.node, this.stepId)?.[MODIFIER_STACK_SOLID_SCRIPT_KEY];
    if (JSON.stringify(document) === JSON.stringify(stored ?? null)) return false;
    return modifierStackParametersCommit(
      this.node,
      this.stepId,
      { [MODIFIER_STACK_SOLID_SCRIPT_KEY]: document },
      this.commandStack,
    );
  }

  /**
   * Returns the script's name for the window title, or the generator's when the
   * script has none.
   *
   * @returns Name.
   */
  name(): string {
    return this.document().name.trim() || this.node.name.trim() || 'Script';
  }
}
