import { EditorComponentMode, getEditorComponentModeLabel } from '@/types/editor_component_mode.js';
import { EditorInteractionMode } from '@/types/editor_interaction_mode.js';
import { EditorToolId } from '@/types/editor_tool_id.js';
import { TransformMode } from '@/types/transform_mode.js';
import {
  TOOL_INSTRUCTION_GENERATOR,
  toolInstructionForEditorTool,
  toolInstructionForTransformMode,
} from '@/tools/chrome/instruction/tool_instruction_catalog.js';

/** What the rail and options bar highlight, as one state. */
export interface ToolChromeModeState {
  /** Primary tool on the rail. */
  tool: EditorToolId;
  /** Transform mode on the options bar. */
  transform: TransformMode;
  /** Object Mode or Edit Mode. */
  interaction: EditorInteractionMode;
  /** Vertex, Edge or Face in Edit Mode. */
  component: EditorComponentMode;
  /** True while an object's widgets are edited. */
  generatorEditing: boolean;
}

/**
 * Names the highlighted mode the way the rail and options bar show it, such as
 * Bounds, Move, Generator, Face Select or Edit Mode · Vertex · Move.
 *
 * @param state Highlighted state.
 * @returns Mode name.
 */
export function toolChromeModeLabel(state: ToolChromeModeState): string {
  if (state.generatorEditing) return TOOL_INSTRUCTION_GENERATOR.title;
  const transform = toolInstructionForTransformMode(state.transform).title;
  if (state.interaction === EditorInteractionMode.EDIT_MODE) {
    const component = `Edit Mode · ${getEditorComponentModeLabel(state.component)}`;
    return state.transform === TransformMode.BOUNDS ? component : `${component} · ${transform}`;
  }
  if (state.tool !== EditorToolId.OBJECT) return toolInstructionForEditorTool(state.tool).title;
  return transform;
}
