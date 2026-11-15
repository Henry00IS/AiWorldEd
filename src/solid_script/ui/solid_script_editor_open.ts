import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import { SolidScriptEditor } from './solid_script_editor.js';

/** The open script editor; one at a time. */
let solidScriptEditorCurrent: SolidScriptEditor | null = null;

/**
 * Opens the script editor of a SolidScript generator, bringing it forward when
 * it is open already and replacing the editor of another generator.
 *
 * @param target Generator, modifier and undo stack.
 */
export function solidScriptEditorOpen(target: ModifierStackActionTarget): void {
  if (solidScriptEditorCurrent?.matches(target.volume, target.stepId)) return solidScriptEditorCurrent.show();
  solidScriptEditorCurrent?.close();
  const editor = new SolidScriptEditor(document.body, target, () => {
    if (solidScriptEditorCurrent === editor) solidScriptEditorCurrent = null;
  });
  solidScriptEditorCurrent = editor;
  editor.open();
}

/**
 * Returns the open script editor.
 *
 * @returns Editor, or null.
 */
export function solidScriptEditorCurrentGet(): SolidScriptEditor | null {
  return solidScriptEditorCurrent;
}
