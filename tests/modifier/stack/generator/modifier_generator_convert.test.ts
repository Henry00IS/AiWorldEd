import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { PanelPropertiesModifierStackSection } from '@/modifier/stack/ui/panel_properties_modifier_stack_section.js';
import {
  MODIFIER_GENERATOR_NODE_KINDS,
  modifierGeneratorNodeCreate,
} from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';

/**
 * Builds a solid holding one generator node and an inspector bound to it.
 *
 * @param kind Generator kind.
 * @returns Fixture parts.
 */
function convertFixture(kind: string) {
  const world = new THREE.Group();
  const model = new SolidModel('Convert test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(kind);
  model.root.add(node);
  world.updateMatrixWorld(true);
  const section = new PanelPropertiesModifierStackSection(
    () => document.createElement('section'),
    (title) => Object.assign(document.createElement('header'), { textContent: title }),
  );
  const stack = new CommandStack(32);
  section.setCommandStack(stack);
  document.body.replaceChildren(section.getElement());
  section.updateFromObjects([node]);
  const generated = () => modifierStackCompile(model.getBrushes(), model.root).instances.length;
  return { world, model, node, section, stack, generated };
}

/**
 * Finds the Convert to Brush button.
 *
 * @param root Inspector root.
 * @returns Button, or null.
 */
function convertButton(root: HTMLElement): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>('button[data-generator-convert]');
}

describe('Convert to Brush', () => {
  it('shows a Convert to Brush button for every generator kind, with a tooltip', () => {
    for (const kind of MODIFIER_GENERATOR_NODE_KINDS) {
      const { section } = convertFixture(kind);
      const button = convertButton(section.getElement());
      expect(button, kind).not.toBeNull();
      expect(button?.textContent).toContain('Convert to Brush');
      expect(button?.title.length).toBeGreaterThan(10);
    }
  });

  it('turns the generator into the same regular brushes as one undo step', () => {
    const { model, node, section, stack, generated } = convertFixture('torus');
    const before = generated();
    expect(model.getBrushes()).toHaveLength(0);
    convertButton(section.getElement())?.click();
    expect(node.parent).toBeNull();
    expect(model.getBrushes().length).toBe(before);
    stack.undo();
    expect(node.parent).toBe(model.root);
    expect(model.getBrushes()).toHaveLength(0);
    stack.redo();
    expect(node.parent).toBeNull();
    expect(model.getBrushes().length).toBe(before);
  });

  it('hides the button on plain modifier volumes', () => {
    const { section } = convertFixture('sphere');
    const volume = new THREE.Mesh();
    section.updateFromObjects([volume]);
    const button = convertButton(section.getElement());
    expect(button === null || button.style.display === 'none').toBe(true);
  });
});
