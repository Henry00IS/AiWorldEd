import { describe, expect, it } from 'vitest';
import { editAlignStatusMessage } from '@/edit/align/edit_align_status.js';

describe('editAlignStatusMessage', () => {
  it('reports an empty selection, an aligned selection and the moved vertex count', () => {
    expect(editAlignStatusMessage({ kind: 'grid' }, -1)).toBe('Select vertices, edges or faces to align');
    expect(editAlignStatusMessage({ kind: 'grid' }, 0)).toBe('Selection is already aligned');
    expect(editAlignStatusMessage({ kind: 'grid' }, 1)).toBe('Aligned 1 vertex to the grid');
    expect(editAlignStatusMessage({ kind: 'axis', axis: 'z', anchor: 'center' }, 4)).toBe(
      'Aligned 4 vertices to their center Z',
    );
    expect(editAlignStatusMessage({ kind: 'axis', axis: 'x', anchor: 'min' }, 2)).toBe(
      'Aligned 2 vertices to their minimum X',
    );
  });
});
