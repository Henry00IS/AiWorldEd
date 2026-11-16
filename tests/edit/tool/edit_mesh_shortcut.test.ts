import { describe, expect, it } from 'vitest';
import { EDIT_MESH_SHORTCUT_REMINDERS, editMeshPlainKeyCommand } from '@/edit/tool/edit_mesh_shortcut.js';

describe('editMeshPlainKeyCommand', () => {
  it('maps E, I and J to extrude, inset and connect only without modifiers', () => {
    expect(editMeshPlainKeyCommand('KeyE', new KeyboardEvent('keydown', { code: 'KeyE' }), false)).toBe(
      'extrude_faces',
    );
    expect(editMeshPlainKeyCommand('KeyI', undefined, false)).toBe('inset_faces');
    expect(editMeshPlainKeyCommand('KeyJ', undefined, false)).toBe('connect_vertices');
    expect(editMeshPlainKeyCommand('KeyY', undefined, false)).toBe('split_faces');
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
    expect(editMeshPlainKeyCommand('KeyB', new KeyboardEvent('keydown', { code: 'KeyB', ctrlKey: true }), true)).toBe(
      'bevel_edges',
    );
  });

  it('lists Bevel Edges and Duplicate Faces so the keyboard tab cannot drift', () => {
    const bevel = EDIT_MESH_SHORTCUT_REMINDERS.find((row) => row.command === 'bevel_edges');
    const duplicate = EDIT_MESH_SHORTCUT_REMINDERS.find((row) => row.command === 'duplicate_faces');
    expect(bevel).toMatchObject({
      id: 'edit-bevel',
      label: 'Bevel Edges (Edit Mode)',
      shortcut: 'Ctrl+B',
      keyCode: 'KeyB',
      modifiers: 'ctrl',
    });
    expect(duplicate).toMatchObject({
      id: 'edit-duplicate-faces',
      label: 'Duplicate Faces (Edit Mode)',
      shortcut: 'Shift+D',
      keyCode: 'KeyD',
      modifiers: 'shift',
    });
  });

  it('resolves every registered reminder from its key and modifiers', () => {
    for (const row of EDIT_MESH_SHORTCUT_REMINDERS) {
      const event = new KeyboardEvent('keydown', {
        code: row.keyCode,
        ctrlKey: row.modifiers === 'ctrl',
        shiftKey: row.modifiers === 'shift',
      });
      expect(editMeshPlainKeyCommand(row.keyCode, event, row.modifiers !== 'none')).toBe(row.command);
    }
  });
});
