import { describe, expect, it } from 'vitest';
import { editMeshPlainKeyCommand } from '@/edit/tool/edit_mesh_shortcut.js';

describe('editMeshPlainKeyCommand', () => {
  it('maps E, I and J to extrude, inset and connect only without modifiers', () => {
    expect(editMeshPlainKeyCommand('KeyE', new KeyboardEvent('keydown', { code: 'KeyE' }), false)).toBe(
      'extrude_faces',
    );
    expect(editMeshPlainKeyCommand('KeyI', undefined, false)).toBe('inset_faces');
    expect(editMeshPlainKeyCommand('KeyJ', undefined, false)).toBe('connect_vertices');
    expect(
      editMeshPlainKeyCommand('KeyI', new KeyboardEvent('keydown', { code: 'KeyI', ctrlKey: true }), false),
    ).toBeNull();
    expect(
      editMeshPlainKeyCommand('KeyE', new KeyboardEvent('keydown', { code: 'KeyE', shiftKey: true }), false),
    ).toBeNull();
    expect(editMeshPlainKeyCommand('KeyE', undefined, true)).toBeNull();
    expect(editMeshPlainKeyCommand('KeyQ', undefined, false)).toBeNull();
    expect(editMeshPlainKeyCommand('KeyD', new KeyboardEvent('keydown', { code: 'KeyD', shiftKey: true }), true)).toBe(
      'duplicate_faces',
    );
    expect(editMeshPlainKeyCommand('KeyD', undefined, false)).toBeNull();
  });
});
