import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { PanelPropertiesModifierStackSection } from '@/modifier/stack/ui/panel_properties_modifier_stack_section.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { modifierStackOwnerIs } from '@/modifier/stack/owner/modifier_stack_owner.js';
import { stackResultBounds } from '../modifier_stack_fixture.js';

/**
 * Creates the inspector with plain chrome and an undo stack.
 *
 * @returns Section, undo stack and root element.
 */
function inspector() {
  const section = new PanelPropertiesModifierStackSection(
    () => document.createElement('section'),
    (title) => Object.assign(document.createElement('header'), { textContent: title }),
  );
  const stack = new CommandStack(32);
  section.setCommandStack(stack);
  document.body.appendChild(section.getElement());
  return { section, stack, root: section.getElement() };
}

/**
 * Finds a button by accessible name.
 *
 * @param root Search root.
 * @param label Accessible name.
 * @returns Button.
 */
function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!found) throw new Error(`No button ${label}`);
  return found;
}

/**
 * Clicks a menu item by its label.
 *
 * @param label Visible label.
 */
function clickMenu(label: string): void {
  const item = [
    ...document.querySelectorAll<HTMLElement>('[role="menu"] button, [role="menu"] [role="menuitem"]'),
  ].find((element) => element.textContent?.includes(label));
  if (!item) throw new Error(`No menu item ${label}`);
  item.click();
}

/**
 * Returns the text of every element not hidden with display none.
 *
 * @param node Start node.
 * @returns Visible text.
 */
function visibleText(node: Node): string {
  if (node instanceof HTMLElement && node.style.display === 'none') return '';
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  return [...node.childNodes].map(visibleText).join('');
}

/**
 * Builds a solid with one box brush.
 *
 * @returns World, model and brush mesh.
 */
function brushWorld() {
  const world = new THREE.Group();
  const model = new SolidModel('Owner UI');
  world.add(model.root);
  const brush = model.addBoxBrush(1, SolidOperation.Additive);
  world.updateMatrixWorld(true);
  return { world, model, mesh: brush.mesh as THREE.Mesh };
}

describe('modifier section for brushes and groups', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows an empty Modifiers stack for a selected brush, without volume-only rows', () => {
    const { mesh } = brushWorld();
    const { section, root } = inspector();
    section.updateFromObjects([mesh]);
    expect(root.style.display).toBe('block');
    const text = visibleText(root);
    expect(text).toContain('Modifiers');
    expect(text).toContain('Add Modifier');
    expect(text).toContain('No modifiers yet');
    expect(text).not.toContain('Affects');
    expect(text).not.toContain('Capture');
    expect(text).not.toContain('Select a single');
    expect(button(root, 'Modifier actions')).toBeTruthy();
  });

  it('adds an array to a brush through the menu, rebuilds the solid, and undoes it', () => {
    const { mesh, model } = brushWorld();
    const { section, root, stack } = inspector();
    section.updateFromObjects([mesh]);
    button(root, 'Add a modifier to the end of the stack').click();
    clickMenu('Linear Array');
    expect(modifierStackOwnerIs(mesh)).toBe(true);
    expect(ModifierVolume.isVolume(mesh)).toBe(false);
    expect(stackResultBounds(model).getSize(new THREE.Vector3()).x).toBeGreaterThan(1.5);
    expect(root.textContent).toContain('1 source');
    stack.undo();
    expect(modifierStackOwnerIs(mesh)).toBe(false);
    expect(stackResultBounds(model).getSize(new THREE.Vector3()).x).toBeCloseTo(1);
  });

  it('edits a CSG group stack, and stays hidden for several selected brushes', () => {
    const { mesh, model } = brushWorld();
    const group = new THREE.Group();
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(mesh);
    const { section, root } = inspector();
    section.updateFromObjects([group]);
    expect(root.style.display).toBe('block');
    button(root, 'Add a modifier to the end of the stack').click();
    clickMenu('Mirror');
    expect(ModifierVolume.read(group).modifiers.map((entry) => entry.kind)).toEqual(['mirror']);
    const other = model.addBoxBrush(1).mesh as THREE.Mesh;
    section.updateFromObjects([mesh, other]);
    expect(root.style.display).toBe('none');
  });

  it('bakes the copies into brushes and keeps the brush, without its stack', () => {
    const { mesh, model } = brushWorld();
    const { section, root, stack } = inspector();
    section.updateFromObjects([mesh]);
    button(root, 'Add a modifier to the end of the stack').click();
    clickMenu('Linear Array');
    const copies = model.getResultMesh().geometry.getAttribute('position').count;
    button(root, 'Modifier actions').click();
    clickMenu('Bake to Brushes');
    expect(mesh.parent).not.toBeNull();
    expect(modifierStackOwnerIs(mesh)).toBe(false);
    expect(model.getBrushes().length).toBeGreaterThan(1);
    expect(model.getResultMesh().geometry.getAttribute('position').count).toBe(copies);
    stack.undo();
    expect(modifierStackOwnerIs(mesh)).toBe(true);
    expect(model.getBrushes()).toHaveLength(1);
  });
});
