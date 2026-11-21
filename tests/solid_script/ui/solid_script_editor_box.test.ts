import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
  MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierVolumeTemplateEntries } from '@/modifier/stack/modifier_volume_templates.js';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import {
  solidScriptDocumentCreate,
  type SolidScriptLine,
  type SolidScriptUse,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet, solidScriptEditorOpen } from '@/solid_script/ui/solid_script_editor_open.js';
import { categoryShow, explorerRows } from './solid_script_editor_fixture.js';

/**
 * Reads the explorer value for a system name.
 *
 * @param name Shown name, such as $Script.Usage.
 * @returns Value text, or undefined when it is not listed.
 */
function valueOf(name: string): string | undefined {
  return explorerRows()
    .find((row) => row.startsWith(`${name}|`))
    ?.split('|')[1];
}

/** Lines that read the box and the usage. */
const BOX_LINES: SolidScriptLine[] = [
  { command: 'echo', values: { value: '[$Script.Usage] [$Box.Position] [$Box.Size]' } },
  { command: 'cube' },
];

/**
 * Opens the editor after the host has been posed, so the preview reads that
 * pose.
 *
 * @param use Generator or modifier host.
 * @param pose Places the node, and an optional parent, before the editor opens.
 * @returns The posed node.
 */
function openPosed(use: SolidScriptUse, pose: (node: THREE.Object3D, world: THREE.Group) => void): THREE.Object3D {
  const world = new THREE.Group();
  const node =
    use === 'modifier'
      ? ModifierVolume.create({
          modifiers: modifierVolumeTemplateEntries([MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND]),
        })
      : modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  world.add(node);
  pose(node, world);
  world.updateMatrixWorld(true);
  const stepId = ModifierVolume.read(node).modifiers[0]?.id ?? '';
  modifierStackParametersCommit(node, stepId, { script: solidScriptDocumentCreate(BOX_LINES, 'Test Script') }, null);
  const target: ModifierStackActionTarget = {
    volume: node,
    stepId,
    commandStack: new CommandStack(50),
    status: () => {},
    refresh: () => {},
  };
  solidScriptEditorOpen(target);
  return node;
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('SolidScript editor preview of $Box and $Script.Usage', () => {
  it('shows Generator and the generator pose in the Variables tab', () => {
    openPosed('generator', (node) => {
      node.position.set(1, 2, 3);
      node.scale.set(2, 2, 2);
    });
    categoryShow('System');
    expect(valueOf('$Script.Usage')).toBe('Generator');
    expect(valueOf('$Box.Position')).toBe('[1, 2, 3]');
    expect(valueOf('$Box.Scale')).toBe('[2, 2, 2]');
    expect(valueOf('$Box.Size')).toBe('[2, 2, 2]');
  });

  it('shows Modifier and the volume pose, including a parent, when previewed as a modifier', () => {
    openPosed('modifier', (node, world) => {
      const parent = new THREE.Group();
      parent.position.set(5, 0, 0);
      world.add(parent);
      parent.add(node);
      node.position.set(1, 2, 3);
      node.scale.set(4, 2, 6);
    });
    categoryShow('System');
    expect(valueOf('$Script.Usage')).toBe('Modifier');
    expect(valueOf('$Box.Position')).toBe('[6, 2, 3]');
    expect(valueOf('$Box.Scale')).toBe('[4, 2, 6]');
    expect(valueOf('$Box.Size')).toBe('[4, 2, 6]');
  });
});
