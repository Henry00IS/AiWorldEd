import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { layoutGeneratorEditHostCreate } from '@/layout/setup/layout_generator_edit_host.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import { CommandStack } from '@/commands/command_stack.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { MODIFIER_STACK_PATH_KIND } from '@/modifier/stack/kinds/generator/path/modifier_stack_path_object.js';
import { pathAssetEncode, type PathAsset } from '@/path/model/path_asset.js';
import { pathAssetPointInsert } from '@/path/model/path_asset_edit.js';
import { pathEditSelect } from '@/path/edit/path_edit_selection.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';

/** Five points along X: four stretches. */
const RAIL: PathAsset = {
  points: [0, 1, 2, 3, 4].map((x) => [x, 0, x % 2]) as PathAsset['points'],
  segments: [{ kind: 'Straight' }, { kind: 'Smooth' }, { kind: 'Straight' }, { kind: 'Straight' }],
  closed: false,
};

/**
 * Builds a node of a kind with its first step's parameters patched.
 *
 * @param kind Generator kind.
 * @param patch Parameters to merge.
 * @returns Node.
 */
function nodeOf(kind: string, patch: Record<string, unknown>): THREE.Mesh {
  const node = modifierGeneratorNodeCreate(kind);
  const settings = ModifierVolume.read(node);
  settings.modifiers[0]!.parameters = { ...settings.modifiers[0]!.parameters, ...patch };
  ModifierVolume.write(node, settings);
  return node;
}

/**
 * Selects a node in a scene, evaluates it, and shows its inspector rows, which
 * the host refreshes the way the properties panel does after an edit.
 *
 * @param node Script generator with a Rail path, or a Path object.
 * @returns Host, inspector rows, command stack and step id.
 */
function setup(node: THREE.Mesh) {
  const model = new SolidModel('Inspector');
  model.root.add(node);
  const compile = (): void => {
    model.root.updateMatrixWorld(true);
    modifierStackCompile(model.getBrushes(), model.root);
  };
  compile();
  const step = ModifierVolume.read(node).modifiers[0]!;
  const kind = modifierStackKindFind(step.kind)!;
  const commandStack = new CommandStack(16);
  const parameters = () => kind.normalizeParameters(ModifierVolume.read(node).modifiers[0]?.parameters ?? {});
  const rows: ModifierStackFieldRows = new ModifierStackFieldRows(
    kind.fields,
    () => undefined,
    () => [],
    {},
    (status) => ({ volume: node, stepId: step.id, commandStack, status, refresh: () => rows.update(parameters()) }),
  );
  rows.update(parameters());
  document.body.append(rows.getElement());
  const selectionManager = new ManagerSelection();
  selectionManager.setSelection([node]);
  const gridSnap = new GridSnap(true, 0.25);
  const host = layoutGeneratorEditHostCreate({
    selectionManager,
    editorOverlayPolicy: new PolicyEditorOverlay(),
    getInteractiveViewports: () => [],
    pickStack: () => [],
    commandStack,
    gridSnap,
    getUserSnapEnabled: () => true,
    onChange: () => {
      compile();
      rows.update(parameters());
    },
  });
  return { host, rows, commandStack, stepId: step.id };
}

/**
 * Returns the caption and Stretch choice the inspector shows.
 *
 * @param rows Inspector rows.
 * @returns Caption text and Stretch value, or null without a Stretch row.
 */
function shown(rows: ModifierStackFieldRows): [string, string | null] {
  const root = rows.getElement();
  const caption = root.querySelector('[data-path-point] .modifier-stack-ui-caption, [data-path-point] div');
  const stretch = root.querySelector<HTMLSelectElement>('[data-path-point] [aria-label="Stretch"]');
  return [caption?.textContent ?? '', stretch?.value ?? null];
}

afterEach(() => {
  pathEditSelect(null);
  document.body.replaceChildren();
});

describe('Generator tool edits and the inspector', () => {
  for (const [label, node, input] of [
    ['a script Own Path', () => scriptNode(), 'Rail'],
    ['a Path object', () => nodeOf(MODIFIER_STACK_PATH_KIND, { inputs: { Path: pathAssetEncode(RAIL) } }), 'Path'],
  ] as const) {
    it(`shows Stretch 5 of 5 right after Ctrl adds a fifth stretch to ${label}, and edits it`, () => {
      const { host, rows, commandStack, stepId } = setup(node());
      const select = (segments: number[], points: number[] = []): void =>
        pathEditSelect({ stepId, name: input, points, segments });
      select([3]);
      expect(shown(rows)).toEqual(['Stretch 4 of 4', 'Straight']);
      const [path] = host.paths();
      host.pathWrite(path!, pathAssetPointInsert(path!.path, 4, [5, 0, 1]));
      host.changeEnd();
      select([], [5]);
      select([4]);
      expect(shown(rows)).toEqual(['Stretch 5 of 5', 'Straight']);
      const stretch = rows.getElement().querySelector<HTMLSelectElement>('[aria-label="Stretch"]')!;
      stretch.value = 'Smooth';
      stretch.dispatchEvent(new Event('change'));
      expect(shown(rows)).toEqual(['Stretch 5 of 5', 'Smooth']);
      expect(host.paths()[0]?.path.segments[4]?.kind).toBe('Smooth');
      commandStack.undo();
      commandStack.undo();
      host.changeCancel();
      expect(shown(rows)[0]).toBe('');
    });
  }
});

/**
 * Builds a SolidScript generator with Has Edit Mode and a Rail path input.
 *
 * @returns Generator node.
 */
function scriptNode(): THREE.Mesh {
  return nodeOf(MODIFIER_STACK_SOLID_SCRIPT_KIND, {
    script: {
      ...solidScriptDocumentCreate([{ command: 'input', values: { name: 'Rail', type: 'Path' } }]),
      editMode: true,
    },
    inputs: { Rail: pathAssetEncode(RAIL) },
  });
}
