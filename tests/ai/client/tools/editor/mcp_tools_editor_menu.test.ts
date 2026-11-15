import { afterEach, describe, expect, it } from 'vitest';
import { menuRegistry } from '@/ui/menu/menu_registry.js';
import { editorApiFixtureCreate } from '../../helpers_editor_api.js';

const removals: (() => void)[] = [];

afterEach(() => removals.splice(0).forEach((remove) => remove()));

describe('editor menu tools', () => {
  it('lists live menu entries with submenus and runs one like a click', () => {
    let runs = 0;
    removals.push(
      menuRegistry.add('Test Edit', () => [
        { label: 'Duplicate', onClick: () => runs++, shortcut: 'Ctrl+D' },
        { kind: 'separator' },
        { label: 'Hidden', onClick: () => runs++, isVisible: () => false },
        { kind: 'submenu', label: 'More', children: [{ label: 'Off', onClick: () => runs++, isEnabled: () => false }] },
      ]),
    );
    const { api } = editorApiFixtureCreate();
    const listed = api.invokeTool('editor_menu_list', { menu: 'Test Edit' });
    expect(listed.data).toEqual({
      items: [
        { path: ['Test Edit', 'Duplicate'], enabled: true, shortcut: 'Ctrl+D' },
        { path: ['Test Edit', 'More', 'Off'], enabled: false },
      ],
    });
    expect(api.invokeTool('editor_menu_run', { path: ['Test Edit', 'Duplicate'] }).ok).toBe(true);
    expect(api.invokeTool('editor_menu_run', { path: ['Test Edit', 'More', 'Off'] }).ok).toBe(false);
    expect(api.invokeTool('editor_menu_run', { path: ['Test Edit', 'Hidden'] }).ok).toBe(false);
    expect(runs).toBe(1);
  });

  it('refuses scene, file and session menus and dialog entries', () => {
    let runs = 0;
    removals.push(menuRegistry.add('Test File', () => [{ label: 'New', onClick: () => runs++ }], false));
    removals.push(menuRegistry.add('Test Tools', () => [{ label: 'Options\u2026', onClick: () => runs++ }]));
    const { api } = editorApiFixtureCreate();
    const file = api.invokeTool('editor_menu_run', { path: ['Test File', 'New'] });
    expect(file.message).toMatch(/only the user runs it/);
    expect(api.invokeTool('editor_menu_run', { path: ['Test Tools', 'Options\u2026'] }).message).toMatch(/dialog/);
    expect(runs).toBe(0);
  });
});
