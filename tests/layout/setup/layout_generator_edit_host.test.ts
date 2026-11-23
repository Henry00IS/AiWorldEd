import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { layoutGeneratorEditHostCreate } from '@/layout/setup/layout_generator_edit_host.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';
import { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import { CommandStack } from '@/commands/command_stack.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { PATH_ASSET_DEFAULT, pathAssetDecode } from '@/path/model/path_asset.js';
import { pathAssetPointMove } from '@/path/model/path_asset_edit.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackParametersRead } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import {
  modifierStackSlidersRecord,
  type ModifierStackSlider,
} from '@/modifier/stack/widgets/modifier_stack_slider_record.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentEditModeWith,
} from '@/solid_script/document/solid_script_document.js';

/**
 * Creates a SolidScript generator whose script has Has Edit Mode set as given.
 *
 * @param editMode True for a script with an edit mode.
 * @returns Generator node and its step id.
 */
function scriptGenerator(editMode: boolean): { node: THREE.Mesh; stepId: string } {
  const node = modifierGeneratorNodeCreate('solidScript');
  const settings = ModifierVolume.read(node);
  const step = settings.modifiers[0];
  if (!step) throw new Error('no step');
  const script = solidScriptDocumentCreate([{ command: 'input', values: { name: 'Height', type: 'Number' } }]);
  step.parameters['script'] = solidScriptDocumentEditModeWith(script, editMode);
  step.parameters['inputs'] = { Height: '1' };
  ModifierVolume.write(node, settings);
  return { node, stepId: step.id };
}

/**
 * Returns a slider of a step, writing Height.
 *
 * @param stepId Step id.
 * @returns Slider.
 */
function heightSlider(stepId: string): ModifierStackSlider {
  return {
    stepId,
    key: `${stepId}:1:0`,
    label: 'Height',
    value: 1,
    writes: 'Height',
    target: 'input',
    color: '',
    component: null,
    ruler: true,
    axis: null,
    origin: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 1, 0),
    min: null,
    max: null,
  };
}

/**
 * Builds a host over a real selection and overlay policy; the pick stack
 * returns the given meshes.
 *
 * @param stack Meshes under every client point, nearest first.
 * @returns Host, selection and policy.
 */
function setup(stack: THREE.Mesh[]) {
  const selectionManager = new ManagerSelection();
  const editorOverlayPolicy = new PolicyEditorOverlay();
  const pane = {
    getCamera: () => new THREE.PerspectiveCamera(),
    getContentElement: () => document.createElement('div'),
  };
  const commandStack = new CommandStack(16);
  const gridSnap = new GridSnap(true, 0.25);
  const setRailEditing = vi.fn();
  const host = layoutGeneratorEditHostCreate({
    selectionManager,
    editorOverlayPolicy,
    getInteractiveViewports: () => [pane, { ...pane, getContentElement: () => null }],
    pickStack: () => stack,
    commandStack,
    gridSnap,
    setRailEditing,
  });
  return { host, selectionManager, editorOverlayPolicy, commandStack, gridSnap, setRailEditing };
}

describe('layoutGeneratorEditHostCreate', () => {
  it('reports the single selected object only when its script has an edit mode', () => {
    const editable = scriptGenerator(true).node;
    const plain = scriptGenerator(false).node;
    const column = modifierGeneratorNodeCreate('column');
    const { host, selectionManager } = setup([]);
    selectionManager.setSelection([editable]);
    expect(host.selectedEditable()).toBe(editable);
    selectionManager.setSelection([editable, new THREE.Mesh()]);
    expect(host.selectedEditable()).toBeNull();
    for (const other of [plain, column]) {
      selectionManager.setSelection([other]);
      expect(host.selectedEditable()).toBeNull();
    }
  });

  it('picks the nearest object with an edit mode and never an ordinary object', () => {
    const editable = scriptGenerator(true).node;
    const plain = scriptGenerator(false).node;
    const { host, selectionManager } = setup([new THREE.Mesh(), plain, editable]);
    host.pickEditable(5, 5);
    expect(selectionManager.getAllSelectedObjectsAsArray()).toEqual([editable]);
  });

  it('writes a drag live and puts it in the undo history as one step', () => {
    const { node, stepId } = scriptGenerator(true);
    const { host, selectionManager, commandStack } = setup([]);
    selectionManager.setSelection([node]);
    modifierStackSlidersRecord(node, stepId, [heightSlider(stepId)]);
    expect(host.sliders().map((slider) => slider.key)).toEqual([`${stepId}:1:0`]);
    const inputs = () => modifierStackParametersRead(node, stepId)?.['inputs'];
    host.slide(heightSlider(stepId), 2);
    host.slide(heightSlider(stepId), 3);
    expect(inputs()).toEqual({ Height: '3' });
    expect(commandStack.canUndo()).toBe(false);
    host.changeEnd();
    expect(inputs()).toEqual({ Height: '3' });
    commandStack.undo();
    expect(inputs()).toEqual({ Height: '1' });
    expect(commandStack.canUndo()).toBe(false);
  });

  it('lists the Path inputs of the edited object and writes a moved point as one undo step', () => {
    const model = new SolidModel('Rail');
    const node = modifierGeneratorNodeCreate('solidScript');
    const settings = ModifierVolume.read(node);
    const step = settings.modifiers[0];
    if (!step) throw new Error('no step');
    const script = solidScriptDocumentCreate([{ command: 'input', values: { name: 'Rail', type: 'Path' } }]);
    step.parameters['script'] = solidScriptDocumentEditModeWith(script, true);
    ModifierVolume.write(node, settings);
    model.root.add(node);
    model.root.updateMatrixWorld(true);
    modifierStackCompile(model.getBrushes(), model.root);
    const { host, selectionManager, commandStack } = setup([]);
    selectionManager.setSelection([node]);
    const [rail] = host.paths();
    if (!rail) throw new Error('no path');
    expect(rail.path).toEqual(PATH_ASSET_DEFAULT);
    const stored = () =>
      String((modifierStackParametersRead(node, step.id)?.['inputs'] as Record<string, string>)?.['Rail']);
    host.pathWrite(rail, pathAssetPointMove(rail.path, 1, [2, 0, 0]));
    host.pathWrite(rail, pathAssetPointMove(rail.path, 1, [3, 0, 0]));
    host.changeEnd();
    expect(pathAssetDecode(stored())?.points[1]).toEqual([3, 0, 0]);
    expect(host.paths()[0]?.path.points[1]).toEqual([3, 0, 0]);
    commandStack.undo();
    expect(stored()).toBe('undefined');
    expect(commandStack.canUndo()).toBe(false);
  });

  it('drags a built-in Stairs Landing into its parameter as one undo step', () => {
    const model = new SolidModel('Stairs');
    const node = modifierGeneratorNodeCreate('stairs');
    model.root.add(node);
    model.root.updateMatrixWorld(true);
    modifierStackCompile(model.getBrushes(), model.root);
    const { host, selectionManager, commandStack } = setup([]);
    selectionManager.setSelection([node]);
    expect(host.selectedEditable()).toBe(node);
    const landing = host.sliders().find((slider) => slider.label === 'Landing');
    if (!landing) throw new Error('no landing handle');
    const read = () => modifierStackParametersRead(node, landing.stepId)?.['landing'];
    host.slide(landing, 0.25);
    host.changeEnd();
    expect(read()).toBe(0.25);
    expect(host.sliders().find((slider) => slider.label === 'Landing')?.value).toBeCloseTo(0.25);
    commandStack.undo();
    expect(read()).toBe(0);
  });

  it('takes a cancelled drag back without an undo step', () => {
    const { node, stepId } = scriptGenerator(true);
    const { host, selectionManager, commandStack } = setup([]);
    selectionManager.setSelection([node]);
    host.slide(heightSlider(stepId), 4);
    host.changeCancel();
    expect(modifierStackParametersRead(node, stepId)?.['inputs']).toEqual({ Height: '1' });
    expect(commandStack.canUndo()).toBe(false);
  });

  it('snaps distances to the grid only while snapping is on', () => {
    const { host, gridSnap } = setup([]);
    gridSnap.setEnabled(true);
    gridSnap.setInterval(0.25);
    expect(host.snapDistance(0.3)).toBeCloseTo(0.25);
    gridSnap.setEnabled(false);
    expect(host.snapDistance(0.3)).toBeCloseTo(0.3);
  });

  it('holds the generator editing overlay while editing', () => {
    const { host, editorOverlayPolicy, setRailEditing } = setup([]);
    host.setEditing(true);
    expect(editorOverlayPolicy.isAllowed(EditorOverlayId.GENERATOR_EDITING)).toBe(true);
    expect(setRailEditing).toHaveBeenLastCalledWith(true);
    host.setEditing(false);
    expect(editorOverlayPolicy.isAllowed(EditorOverlayId.GENERATOR_EDITING)).toBe(false);
    expect(setRailEditing).toHaveBeenLastCalledWith(false);
  });

  it('lists only panes that have a content element', () => {
    expect(setup([]).host.panes()).toHaveLength(1);
  });
});
