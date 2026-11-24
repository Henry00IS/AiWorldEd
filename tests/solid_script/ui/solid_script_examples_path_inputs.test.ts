import { afterEach, describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackPaths, modifierStackPathPatch } from '@/modifier/stack/widgets/modifier_stack_sliders.js';
import {
  modifierStackParametersCommand,
  modifierStackParametersStackRead,
} from '@/modifier/stack/modifier_stack_parameters_commit.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { pathAssetPointMove } from '@/path/model/path_asset_edit.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { editorFixture, find, tool } from './solid_script_editor_fixture.js';

/** Lets pending promises settle. */
async function settle(): Promise<void> {
  for (let round = 0; round < 10; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Opens a built-in example by name from the Examples window.
 *
 * @param name Example name.
 */
async function openExample(name: string): Promise<void> {
  tool('Examples…').click();
  await settle();
  const search = find<HTMLInputElement>('[data-solid-script-examples] input');
  search.value = name;
  search.dispatchEvent(new Event('input', { bubbles: true }));
  tool('Open').click();
  await settle();
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('Path inputs across examples', () => {
  it('keeps a path drawn in the scene through switching examples and a level undo', async () => {
    const fixture = editorFixture([{ command: 'cube' }]);
    const model = new SolidModel('paths');
    fixture.world.add(model.root);
    model.root.add(fixture.node);
    const rebuild = (): void => {
      fixture.world.updateMatrixWorld(true);
      model.markDirty();
      model.rebuild(true);
    };
    const run = (): string | undefined =>
      (ModifierVolume.read(fixture.node).modifiers[0]?.parameters['inputs'] as Record<string, string>)['Run'];
    const name = (): string =>
      (ModifierVolume.read(fixture.node).modifiers[0]?.parameters['script'] as { name: string }).name;
    await openExample('Path Stairs');
    rebuild();
    const path = modifierStackPaths(fixture.node)[0]!;
    const before = modifierStackParametersStackRead(fixture.node)!;
    const moved = pathAssetPointMove(path.path, 0, [9, 9, 9]);
    modifierStackParametersCommand(
      fixture.node,
      fixture.stepId,
      modifierStackPathPatch(fixture.node, path, moved)!,
    )?.execute();
    fixture.commandStack.push(
      new CommandModifierStackSet(fixture.node, before, modifierStackParametersStackRead(fixture.node)!),
    );
    await openExample('Baseboard');
    rebuild();
    await openExample('Path Stairs');
    rebuild();
    expect(modifierStackPaths(fixture.node)[0]?.path.points[0]).toEqual([9, 9, 9]);
    await openExample('Baseboard');
    fixture.commandStack.undo();
    fixture.commandStack.redo();
    expect(name()).toBe('Baseboard');
    expect(run()).toContain('[9,9,9]');
  });
});
