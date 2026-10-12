import { EditorToolId } from '@/types/editor_tool_id.js';
import { TransformMode } from '@/types/transform_mode.js';
import type { ToolInstruction } from './tool_instruction.js';

/**
 * Returns the rail instruction for a primary editor tool.
 *
 * @param toolId Tool id.
 * @returns Instruction for tooltips.
 */
export function toolInstructionForEditorTool(toolId: EditorToolId): ToolInstruction {
  if (toolId === EditorToolId.FACE) {
    return {
      title: 'Face Select',
      shortcut: 'Shift+Tab',
      description:
        'Select individual faces on content meshes and solid results. Use Shift or Ctrl to extend the selection. Open the UV Editor or Extrude from the tool options bar.',
    };
  }
  if (toolId === EditorToolId.CLIP_PLANE) {
    return {
      title: 'Clip Plane',
      description:
        'Place a cutting plane through the selected mesh. Flip keeps the other side, Clip discards one half, Split keeps both. Requires a selected mesh. Esc cancels.',
    };
  }
  if (toolId === EditorToolId.GRID) {
    return {
      title: 'Grid',
      description:
        'Independent grid and camera orientations. Align the snap grid with a face or edge (X/Y/Z). Camera align and reset leave the grid alone.',
    };
  }
  return {
    title: 'Object Select',
    shortcut: 'O',
    description:
      'Select whole objects in the viewport. Use transform modes on the options bar, or G / R / S for grab, rotate, and scale. Tab toggles Object Mode and Edit Mode. In Edit Mode, K adds a vertex, Ctrl+R loop-cuts, M merges, and Delete dissolves the selection.',
  };
}

/**
 * Returns the instruction for a transform mode control.
 *
 * @param mode Transform mode.
 * @returns Instruction for tooltips.
 */
export function toolInstructionForTransformMode(mode: TransformMode): ToolInstruction {
  if (mode === TransformMode.TRANSLATE) {
    return {
      title: 'Move',
      shortcut: 'W',
      description: 'Show the translate gizmo. Drag axes or use G for free grab move.',
    };
  }
  if (mode === TransformMode.ROTATE) {
    return {
      title: 'Rotate',
      shortcut: 'E',
      description: 'Show the rotate gizmo. Drag rings or use R for free rotate.',
    };
  }
  if (mode === TransformMode.SCALE) {
    return {
      title: 'Scale',
      shortcut: 'R',
      description: 'Show the scale gizmo. Drag handles or use S for free scale.',
    };
  }
  return {
    title: 'Bounds',
    shortcut: 'T',
    description: 'Show oriented bounds handles for one-sided resize and face drag.',
  };
}

/** Instruction for opening the UV editor from face mode. */
export const TOOL_INSTRUCTION_UV_EDITOR: ToolInstruction = {
  title: 'UV Editor',
  description: 'Open the UV panel to scale, offset, and rotate textures on selected faces.',
};

/** Instruction for face extrude. */
export const TOOL_INSTRUCTION_EXTRUDE: ToolInstruction = {
  title: 'Extrude',
  shortcut: 'Shift+E',
  description: 'Extrude the selected face regions into a new solid prism along their normals.',
};

/** Instruction for clip flip. */
export const TOOL_INSTRUCTION_CLIP_FLIP: ToolInstruction = {
  title: 'Flip Plane',
  shortcut: 'F',
  description: 'Flip which side of the clip plane is kept.',
};

/** Instruction for clip commit. */
export const TOOL_INSTRUCTION_CLIP_COMMIT: ToolInstruction = {
  title: 'Clip',
  shortcut: 'Enter',
  description: 'Keep one side of the plane and discard the other. The plane must be ready.',
};

/** Instruction for clip split. */
export const TOOL_INSTRUCTION_CLIP_SPLIT: ToolInstruction = {
  title: 'Split',
  shortcut: 'X',
  description: 'Cut the mesh into two pieces, keeping both sides of the plane.',
};

/** Instruction for Edit Mode vertex component select. */
export const TOOL_INSTRUCTION_COMPONENT_VERTEX: ToolInstruction = {
  title: 'Vertex Select',
  shortcut: '1',
  description: 'Select vertices on the edit domain. Available only in Edit Mode.',
};

/** Instruction for Edit Mode edge component select. */
export const TOOL_INSTRUCTION_COMPONENT_EDGE: ToolInstruction = {
  title: 'Edge Select',
  shortcut: '2',
  description: 'Select edges on the edit domain. Available only in Edit Mode.',
};

/** Instruction for Edit Mode face component select. */
export const TOOL_INSTRUCTION_COMPONENT_FACE: ToolInstruction = {
  title: 'Face Select',
  shortcut: '3',
  description: 'Select faces on the edit domain. Available only in Edit Mode.',
};

/** Instruction for resetting global grid orientation only. */
export const TOOL_INSTRUCTION_GRID_RESET: ToolInstruction = {
  title: 'Reset Grid',
  description: 'Restore the default world Y-up floor grid. Does not change camera orientation.',
};

/** Instruction for aligning the global grid to a face. */
export const TOOL_INSTRUCTION_GRID_ALIGN_TO_FACE: ToolInstruction = {
  title: 'Align Grid to Face',
  description: 'Click a mesh face to make it the new floor. Only the snap/visual grid reorients. Esc cancels the pick.',
};

/** Instruction for aligning grid X to an edge. */
export const TOOL_INSTRUCTION_GRID_ALIGN_X: ToolInstruction = {
  title: 'Align Grid X',
  description:
    'Click a mesh edge to make it the working X axis. Y is preserved; Z is rebuilt. Hover shows a preview triad. Esc cancels.',
};

/** Instruction for aligning grid Y to an edge. */
export const TOOL_INSTRUCTION_GRID_ALIGN_Y: ToolInstruction = {
  title: 'Align Grid Y',
  description:
    'Click a mesh edge to make it the working Y (up) axis. Z is preserved; X is rebuilt. Hover shows a preview triad. Esc cancels.',
};

/** Instruction for aligning grid Z to an edge. */
export const TOOL_INSTRUCTION_GRID_ALIGN_Z: ToolInstruction = {
  title: 'Align Grid Z',
  description:
    'Click a mesh edge to make it the working Z axis (tunnel direction). Y is preserved; X is rebuilt. Hover shows a preview triad. Esc cancels.',
};

/** Instruction for zeroing the grid lattice origin to a vertex. */
export const TOOL_INSTRUCTION_GRID_ORIGIN_VERTEX: ToolInstruction = {
  title: 'Zero Origin to Vertex',
  description:
    'Click a mesh vertex to set the snap/visual grid origin (0,0,0) there. Axes stay the same; only the lattice phase moves. Esc cancels.',
};

/** Instruction for resetting camera orientation only. */
export const TOOL_INSTRUCTION_CAMERA_RESET: ToolInstruction = {
  title: 'Reset Camera',
  description: 'Restore default camera working orientation (Y-up fly frame). Does not change the grid.',
};

/** Instruction for aligning the camera to a face. */
export const TOOL_INSTRUCTION_CAMERA_ALIGN_TO_FACE: ToolInstruction = {
  title: 'Align Camera to Face',
  description:
    'Click a mesh face so camera up matches that normal. Grid orientation is unchanged. Esc cancels the pick.',
};
