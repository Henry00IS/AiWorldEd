import { describe, it, expect } from 'vitest';
import { formatToolInstructionTooltip } from '@/tools/chrome/instruction/tool_instruction.js';
import {
  toolInstructionForEditorTool,
  toolInstructionForTransformMode,
} from '@/tools/chrome/instruction/tool_instruction_catalog.js';
import { EditorToolId } from '@/types/editor_tool_id.js';
import { TransformMode } from '@/types/transform_mode.js';

describe('tool_instruction', () => {
  it('formats title, shortcut, and description', () => {
    const text = formatToolInstructionTooltip({
      title: 'Move',
      shortcut: 'W',
      description: 'Drag axes to translate.',
    });
    expect(text).toBe('Move (W)\n\nDrag axes to translate.');
  });

  it('omits blank description blocks', () => {
    expect(formatToolInstructionTooltip({ title: 'Clip', description: '  ' })).toBe('Clip');
  });

  it('provides catalog entries for primary tools', () => {
    expect(toolInstructionForEditorTool(EditorToolId.OBJECT).title).toBe('Object Select');
    expect(toolInstructionForEditorTool(EditorToolId.FACE).shortcut).toBe('Shift+Tab');
    expect(toolInstructionForEditorTool(EditorToolId.OBJECT).shortcut).toBe('O');
    expect(toolInstructionForEditorTool(EditorToolId.CLIP_PLANE).title).toContain('Clip');
    expect(toolInstructionForEditorTool(EditorToolId.GRID).title).toBe('Grid');
  });

  it('provides catalog entries for transform modes', () => {
    expect(toolInstructionForTransformMode(TransformMode.BOUNDS).shortcut).toBe('T');
    expect(toolInstructionForTransformMode(TransformMode.TRANSLATE).shortcut).toBe('W');
    expect(toolInstructionForTransformMode(TransformMode.ROTATE).shortcut).toBe('E');
    expect(toolInstructionForTransformMode(TransformMode.SCALE).shortcut).toBe('P');
  });
});
