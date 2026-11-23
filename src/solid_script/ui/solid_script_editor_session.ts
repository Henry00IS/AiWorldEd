import type { Object3D } from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import {
  modifierStackEntryRead,
  modifierStackParametersCommand,
  modifierStackParametersRead,
} from '@/modifier/stack/modifier_stack_parameters_commit.js';
import { SolidScriptEditorHistory } from './solid_script_editor_history.js';
import { modifierStackSolidScriptRunStart } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_received.js';
import type { SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import type { SolidScriptBoxCorners, SolidScriptBoxPose } from '@/solid_script/language/solid_script_box.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { solidScriptInspectorInputValues } from './solid_script_inspector_inputs.js';
import {
  solidScriptDocumentEditModeAfter,
  solidScriptDocumentNormalize,
  type SolidScriptDocument,
  type SolidScriptUse,
} from '@/solid_script/document/solid_script_document.js';

/**
 * Connects a script editor to one SolidScript generator in the level. The
 * script lives only in the generator's parameters, so edits of other users show
 * up by reading it again. Script edits keep their own undo history, out of the
 * level's.
 */
export class SolidScriptEditorSession {
  /**
   * Creates a session.
   *
   * @param node Generator node.
   * @param stepId Modifier id of the script.
   * @param commandStack Level undo stack; script edits run on it untracked so
   *   they are shared and count as unsaved, or null to apply directly.
   * @param refresh Redraws the generator's inspector after a commit, or null.
   */
  constructor(
    readonly node: Object3D,
    readonly stepId: string,
    private readonly commandStack: CommandStack | null,
    private readonly refresh: (() => void) | null = null,
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
   * Returns what a run of the script in the editor starts from: the inspector
   * values and $Box from the generator or modifier volume; for a modifier, also
   * the brushes it received at its last evaluation, so the editor shows what
   * the modifier builds.
   *
   * @returns Input values, box values and, for a modifier, what it receives.
   */
  runStart(): {
    inputs: Record<string, string>;
    box: [number, number, number];
    pose: SolidScriptBoxPose;
    corners: SolidScriptBoxCorners;
    use?: SolidScriptUseFacts;
  } {
    return { inputs: this.inputs(), ...modifierStackSolidScriptRunStart(this.node, this.stepId, this.use()) };
  }

  /**
   * Stores a new script as one step of the script's own history and rebuilds
   * the generator.
   *
   * @param document Script.
   * @returns False when the generator is gone or nothing changed.
   */
  commit(document: SolidScriptDocument): boolean {
    const before = this.document();
    if (!this.store(solidScriptDocumentEditModeAfter(before, document))) return false;
    SolidScriptEditorHistory.of(this.node, this.stepId, this.commandStack).record(before, this.document());
    return true;
  }

  /**
   * Takes back the last script edit of this user.
   *
   * @returns False when there was nothing to undo.
   */
  undo(): boolean {
    const document = SolidScriptEditorHistory.of(this.node, this.stepId, this.commandStack).undo(this.document());
    if (document) this.store(document);
    return document !== null;
  }

  /**
   * Makes the last undone script edit again.
   *
   * @returns False when there was nothing to redo.
   */
  redo(): boolean {
    const document = SolidScriptEditorHistory.of(this.node, this.stepId, this.commandStack).redo(this.document());
    if (document) this.store(document);
    return document !== null;
  }

  /**
   * Writes a script into the generator outside the level's undo history.
   *
   * @param document Script.
   * @returns False when the generator is gone, nothing changed or editing was
   *   refused.
   */
  private store(document: SolidScriptDocument): boolean {
    const stored = modifierStackParametersRead(this.node, this.stepId)?.[MODIFIER_STACK_SOLID_SCRIPT_KEY];
    if (JSON.stringify(document) === JSON.stringify(stored ?? null)) return false;
    const command = modifierStackParametersCommand(this.node, this.stepId, {
      [MODIFIER_STACK_SOLID_SCRIPT_KEY]: document,
    });
    if (!command) return false;
    if (this.commandStack) {
      if (!this.commandStack.executeUntracked(command)) return false;
    } else command.execute();
    // The inspector shows the script's Input lines and what it builds.
    this.refresh?.();
    return true;
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

  /**
   * Returns how this step uses its script.
   *
   * @returns Modifier for a SolidScript modifier step, else generator.
   */
  use(): SolidScriptUse {
    return modifierStackEntryRead(this.node, this.stepId)?.kind === MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND
      ? 'modifier'
      : 'generator';
  }
}
