import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierStackOwnerDecode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import { modifierStackDerivedByRoot } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
  MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet, solidScriptEditorOpen } from '@/solid_script/ui/solid_script_editor_open.js';

/**
 * Whether each script run since the list was last cleared timed its lines, in
 * run order.
 */
const counted = vi.hoisted(() => ({ runs: [] as boolean[] }));

vi.mock('@/solid_script/language/solid_script_machine.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/solid_script/language/solid_script_machine.js')>();
  type Args = ConstructorParameters<typeof real.SolidScriptMachine>;
  /** Machine that notes each run of a script. */
  class CountedMachine extends real.SolidScriptMachine<never> {
    private readonly timed: boolean;
    constructor(...args: Args) {
      super(...args);
      this.timed = args[4] === true;
    }
    override run(lines: Parameters<InstanceType<typeof real.SolidScriptMachine>['run']>[0]) {
      counted.runs.push(this.timed);
      return super.run(lines as never);
    }
  }
  return { ...real, SolidScriptMachine: CountedMachine };
});

/** Forgets the runs counted so far. */
const runsClear = (): void => void (counted.runs.length = 0);

/**
 * Lines of a script that builds the given number of cubes.
 *
 * @param count Cubes.
 * @returns Lines.
 */
function cubes(count: number): SolidScriptLine[] {
  return Array.from({ length: count }, (_, index) => ({
    command: 'cube',
    values: { size: `${index + 1}` },
  })) as SolidScriptLine[];
}

/**
 * Builds a SolidScript generator in a level, with its inspector rows shown.
 *
 * @returns Fixture parts.
 */
function fixture() {
  const world = new THREE.Group();
  const model = new SolidModel('share');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  const stepId = ModifierVolume.read(node).modifiers[0]?.id ?? '';
  const commandStack = new CommandStack(50);
  const kind = modifierStackKindFind(MODIFIER_STACK_SOLID_SCRIPT_KIND)!;
  const parameters = () => kind.normalizeParameters(ModifierVolume.read(node).modifiers[0]?.parameters ?? {});
  const target = { volume: node, stepId, commandStack, status: () => {}, refresh: () => rows.update(parameters()) };
  const rows = new ModifierStackFieldRows(
    kind.fields,
    () => undefined,
    () => [],
    {},
    (status) => ({ ...target, status }),
  );
  document.body.append(rows.getElement());
  const edit = (count: number): void => {
    modifierStackParametersCommit(
      node,
      stepId,
      { script: solidScriptDocumentCreate(cubes(count), 'Cubes') },
      commandStack,
    );
    rows.update(parameters());
    world.updateMatrixWorld(true);
    model.markDirty();
    model.rebuild(true);
  };
  return { node, stepId, target, rows, edit, model, detail: () => rows.getElement().textContent ?? '' };
}

/**
 * Builds a box brush with a SolidScript modifier in a level, with the
 * modifier's inspector rows shown.
 *
 * @returns Fixture parts.
 */
function modifierFixture() {
  const world = new THREE.Group();
  const model = new SolidModel('share');
  world.add(model.root);
  const owner = model.addBoxBrush(4, SolidOperation.Additive).mesh as THREE.Object3D;
  const entry = modifierStackEntryCreate(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND, []);
  modifierStackOwnerDecode(owner, { modifiers: [entry] });
  const commandStack = new CommandStack(50);
  const kind = modifierStackKindFind(MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND)!;
  const parameters = () => kind.normalizeParameters(ModifierVolume.read(owner).modifiers[0]?.parameters ?? {});
  const target = { volume: owner, stepId: entry.id, commandStack, status: () => {}, refresh: () => {} };
  const rows = new ModifierStackFieldRows(
    kind.fields,
    () => undefined,
    () => [],
    {},
    (status) => ({ ...target, status }),
  );
  document.body.append(rows.getElement());
  const edit = (count: number): void => {
    const lines = [{ command: 'input_objects', values: {} }, ...cubes(count)] as SolidScriptLine[];
    const script = solidScriptDocumentUsesWith(solidScriptDocumentCreate(lines, 'Cubes'), {
      generator: false,
      modifier: true,
    });
    modifierStackParametersCommit(owner, entry.id, { script }, commandStack);
    rows.update(parameters());
    world.updateMatrixWorld(true);
    model.markDirty();
    model.rebuild(true);
  };
  return { edit, detail: () => rows.getElement().textContent ?? '' };
}

beforeEach(runsClear);

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('SolidScript runs shared by the stack, the inspector and the editor', () => {
  it('runs the script once per edit for the inspector and the stack', () => {
    const { edit, detail, model } = fixture();
    edit(2);
    runsClear();
    edit(3);
    expect(counted.runs.length).toBe(1);
    expect(detail()).toMatch(/3 lines · 3 solids/);
    expect(modifierStackDerivedByRoot.get(model.root)?.size).toBe(3);
  });

  it('runs the script once per edit with the editor open too', () => {
    const { edit, target, detail } = fixture();
    edit(1);
    solidScriptEditorOpen(target);
    runsClear();
    edit(2);
    expect(counted.runs.length).toBe(1);
    expect(counted.runs).toEqual([true]);
    expect(detail()).toMatch(/2 lines · 2 solids/);
    expect(document.querySelector('[data-solid-script-editor]')?.textContent).toMatch(/2 solids/);
  });

  it('runs a modifier script once per edit for the inspector and the stack', () => {
    const { edit, detail } = modifierFixture();
    edit(1);
    runsClear();
    edit(2);
    expect(counted.runs.length).toBe(1);
    expect(detail()).toMatch(/3 lines · 3 solids/);
  });

  it('runs again when the box changes, since the inputs differ', () => {
    const { edit, model, node } = fixture();
    edit(2);
    runsClear();
    node.scale.set(3, 1, 1);
    node.parent!.updateMatrixWorld(true);
    model.markDirty();
    model.rebuild(true);
    expect(counted.runs.length).toBe(1);
  });

  it('shows the stack run in the inspector when nothing changed since', () => {
    const { edit, rows, node } = fixture();
    edit(2);
    runsClear();
    const kind = modifierStackKindFind(MODIFIER_STACK_SOLID_SCRIPT_KIND)!;
    rows.update(kind.normalizeParameters(ModifierVolume.read(node).modifiers[0]?.parameters ?? {}));
    expect(counted.runs.length).toBe(0);
  });
});
