import { describe, it, expect } from 'vitest';
import {
  EditorComponentMode,
  getEditorComponentModeDigit,
  getEditorComponentModeLabel,
} from '@/types/editor_component_mode.js';

describe('EditorComponentMode', () => {
  it('labels and digits match 1/2/3', () => {
    expect(getEditorComponentModeLabel(EditorComponentMode.VERTEX)).toBe('Vertex');
    expect(getEditorComponentModeLabel(EditorComponentMode.EDGE)).toBe('Edge');
    expect(getEditorComponentModeLabel(EditorComponentMode.FACE)).toBe('Face');
    expect(getEditorComponentModeDigit(EditorComponentMode.VERTEX)).toBe('1');
    expect(getEditorComponentModeDigit(EditorComponentMode.EDGE)).toBe('2');
    expect(getEditorComponentModeDigit(EditorComponentMode.FACE)).toBe('3');
  });
});
