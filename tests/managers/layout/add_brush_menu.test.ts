import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddBrushActions, AddBrushMenu } from '../../../src/managers/layout/add_brush_menu.js';
import { Toolbar } from '../../../src/ui/toolbar.js';

describe('AddBrushMenu', () => {
  let container: HTMLElement;
  let toolbar: Toolbar;

  beforeEach(() => {
    container = document.createElement('div');
    toolbar = new Toolbar(container);
  });

  /**
   * Creates independently observable callbacks for every brush option.
   *
   * @returns Mock brush creation actions.
   */
  function createActions(): AddBrushActions {
    return {
      onAddCube: vi.fn(),
      onAddSphere: vi.fn(),
      onAddCylinder: vi.fn(),
      onAddPlane: vi.fn(),
      onAddTerrain: vi.fn(),
      onAddSolidModel: vi.fn(),
    };
  }

  it('groups every current brush option under one Add dropdown', () => {
    new AddBrushMenu().addTo(toolbar, createActions());

    const header = container.querySelector('.editor-toolbar-menu-button');
    const itemLabels = Array.from(container.querySelectorAll('.editor-toolbar-dropdown-item')).map(
      (item) => item.textContent,
    );

    expect(header?.textContent).toContain('Add...');
    expect(itemLabels).toEqual(['Cube', 'Sphere', 'Cylinder', 'Plane', 'Terrain', 'Solid Model']);
    expect(container.querySelectorAll('.editor-toolbar-icon-button')).toHaveLength(0);
  });

  it('runs the matching editor action for each brush option', () => {
    const actions = createActions();
    new AddBrushMenu().addTo(toolbar, actions);

    const menuItems = container.querySelectorAll<HTMLButtonElement>('.editor-toolbar-dropdown-item');
    menuItems.forEach((item) => item.click());

    expect(actions.onAddCube).toHaveBeenCalledOnce();
    expect(actions.onAddSphere).toHaveBeenCalledOnce();
    expect(actions.onAddCylinder).toHaveBeenCalledOnce();
    expect(actions.onAddPlane).toHaveBeenCalledOnce();
    expect(actions.onAddTerrain).toHaveBeenCalledOnce();
    expect(actions.onAddSolidModel).toHaveBeenCalledOnce();
  });
});
