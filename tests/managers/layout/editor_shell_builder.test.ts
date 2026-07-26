import { describe, expect, it, vi } from 'vitest';
import { EditorShellBuilder, EditorToolbarActions } from '../../../src/managers/layout/editor_shell_builder.js';
import { Toolbar } from '../../../src/ui/toolbar.js';

/** Creates toolbar callbacks whose calls can be inspected independently. */
function createToolbarActions(): EditorToolbarActions {
  return new Proxy(
    {},
    {
      get: (target, property) => {
        if (!(property in target)) {
          Reflect.set(
            target,
            property,
            vi.fn(() => false),
          );
        }
        return Reflect.get(target, property);
      },
    },
  ) as EditorToolbarActions;
}

/**
 * Exposes the toolbar population seam without changing its production
 * visibility.
 */
function populateToolbar(toolbar: Toolbar, actions: EditorToolbarActions): void {
  const builder = new EditorShellBuilder() as unknown as {
    createToolbarButtons: (target: Toolbar, callbacks: EditorToolbarActions) => void;
  };
  builder.createToolbarButtons(toolbar, actions);
}

describe('EditorShellBuilder toolbar', () => {
  it('groups every brush creation action under one Add Brush dropdown', () => {
    const container = document.createElement('div');
    const toolbar = new Toolbar(container);
    const actions = createToolbarActions();
    populateToolbar(toolbar, actions);

    const menuButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Add Brush'),
    );
    menuButton?.click();
    const menuItems = Array.from(container.querySelectorAll('.editor-toolbar-dropdown-item')) as HTMLButtonElement[];
    const brushItems = menuItems.filter((item) =>
      ['Cube', 'Sphere', 'Cylinder', 'Plane', 'Terrain', 'Solid Model'].includes(item.textContent ?? ''),
    );

    expect(menuButton).toBeDefined();
    expect(brushItems.map((item) => item.textContent)).toEqual([
      'Cube',
      'Sphere',
      'Cylinder',
      'Plane',
      'Terrain',
      'Solid Model',
    ]);
    expect(container.querySelector('[aria-label="Add Cube"]')).toBeNull();

    brushItems[0]!.click();
    expect(actions.onAddCube).toHaveBeenCalledOnce();
    toolbar.dispose();
  });
});
