import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import {
  modifierStackParametersCommit,
  modifierStackParametersRead,
} from '@/modifier/stack/modifier_stack_parameters_commit.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KEY } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_kind_solid_script.js';
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
   * Returns the stored script as text, to notice changes made elsewhere.
   *
   * @returns Revision text.
   */
  revision(): string {
    return JSON.stringify(
      modifierStackParametersRead(this.node, this.stepId)?.[MODIFIER_STACK_SOLID_SCRIPT_KEY] ?? null,
    );
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
   * Stores a new script as one undo step and rebuilds the generator.
   *
   * @param document Script.
   * @returns False when the generator is gone or nothing changed.
   */
  commit(document: SolidScriptDocument): boolean {
    if (JSON.stringify(document) === this.revision()) return false;
    return modifierStackParametersCommit(
      this.node,
      this.stepId,
      { [MODIFIER_STACK_SOLID_SCRIPT_KEY]: document },
      this.commandStack,
    );
  }

  /**
   * Returns the generator's name for the window title.
   *
   * @returns Name.
   */
  name(): string {
    return this.node.name.trim() || 'Generator';
  }
}
