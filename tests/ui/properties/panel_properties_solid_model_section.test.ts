import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Theme } from '@/theme.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { PanelProperties } from '@/ui/properties/panel_properties.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

describe('PropertiesPanel solid model section', () => {
  let container: HTMLElement;
  let selectionManager: ManagerSelection;
  let panel: PanelProperties;
  let model: SolidModel;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new ManagerSelection();
    panel = new PanelProperties(container, Theme, selectionManager);
    model = new SolidModel('SolidProps');
    model.addBoxBrush(2, SolidOperation.Additive);
  });

  afterEach(() => {
    panel.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('shows the solid model section when the solid root is bound', () => {
    panel.bindObjects([model.root]);
    const section = findSolidModelSection(panel.getContainer());
    expect(section).not.toBeNull();
    expect(section!.style.display).not.toBe('none');
    expect(section!.textContent).toContain('Inverted world');
    expect(section!.textContent).toContain('+ Box Brush');
  });

  it('shows the solid model section when only the result mesh is selected', () => {
    selectionManager.selectObject(model.getResultMesh());
    const section = findSolidModelSection(panel.getContainer());
    expect(section).not.toBeNull();
    expect(section!.style.display).not.toBe('none');
  });

  it('shows the solid model section for an empty solid model root', () => {
    const empty = new SolidModel('EmptySolid');
    panel.bindObjects([empty.root]);
    const section = findSolidModelSection(panel.getContainer());
    expect(section).not.toBeNull();
    expect(section!.style.display).not.toBe('none');
    expect(section!.textContent).toContain('Inverted world');
  });

  it('invokes onSetInvertedWorld when the checkbox is toggled', () => {
    const onSetInvertedWorld = vi.fn();
    panel.setSolidBrushHandlers({
      onSetOperation: vi.fn(),
      onAddBoxBrush: vi.fn(),
      onMoveToFirst: vi.fn(),
      onMoveToLast: vi.fn(),
      onSetInvertedWorld,
    });
    panel.bindObjects([model.root]);
    const section = findSolidModelSection(panel.getContainer())!;
    const checkbox = section.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onSetInvertedWorld).toHaveBeenCalledWith(true);
  });

  it('hides the solid section after unbind', () => {
    panel.bindObjects([model.root]);
    panel.unbindObject();
    const section = findSolidModelSection(panel.getContainer());
    expect(section!.style.display).toBe('none');
  });
});

/**
 * Finds the Solid Model section element in the properties panel.
 *
 * @param panelRoot Properties panel container.
 * @returns Section element or null.
 */
function findSolidModelSection(panelRoot: HTMLElement): HTMLElement | null {
  for (const element of Array.from(panelRoot.querySelectorAll('div'))) {
    const header = element.firstElementChild;
    if (header?.textContent === 'Solid Model') return element;
  }
  return null;
}
