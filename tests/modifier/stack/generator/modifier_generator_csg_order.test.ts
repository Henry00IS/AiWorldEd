import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierGeneratorOperationCommand } from '@/modifier/stack/modifier_generator_operation.js';
import { HandlerObjectAction } from '@/outliner/hierarchy/handler_object_action.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

type Cutter = 'brush' | 'generator';

/** Where the cutter sits in the solid's hierarchy. */
type Spot = 'root' | 'additive group' | 'subtractive group';

/** Inside the 4-unit world box and inside both the box cutter and the column. */
const PROBE = new THREE.Vector3(0.05, 0.3, 0.03);

/**
 * Builds a solid with a 4-unit additive world box and one cutter: a 1-unit box
 * brush or a Column generator node of the same box, at the given spot.
 *
 * @param cutter Cutter kind.
 * @param spot Hierarchy spot.
 * @param operation Cutter operation.
 * @returns Scene pieces.
 */
function scene(cutter: Cutter, spot: Spot, operation: SolidOperation) {
  const world = new THREE.Group();
  const model = new SolidModel('Csg order');
  world.add(model.root);
  model.addBoxBrush(4, SolidOperation.Additive);
  let parent: THREE.Object3D = model.root;
  if (spot !== 'root') {
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, spot === 'subtractive group' ? SolidOperation.Subtractive : SolidOperation.Additive);
    model.root.add(group);
    parent = group;
  }
  let node: THREE.Object3D;
  if (cutter === 'brush') {
    node = model.addBoxBrush(1, operation, parent).mesh!;
  } else {
    node = modifierGeneratorNodeCreate('column');
    node.scale.set(1, 1, 1);
    parent.add(node);
    modifierGeneratorOperationCommand(node, operation)?.execute();
  }
  world.updateMatrixWorld(true);
  model.markDirty();
  modifierBevelRefreshScene(world);
  model.rebuild(true);
  return { world, model, node };
}

/**
 * Returns whether a model-space point lies inside the solid's result mesh, by
 * ray parity.
 *
 * @param model Solid model.
 * @param point Point in model space.
 * @returns True inside.
 */
function solidAt(model: SolidModel, point: THREE.Vector3): boolean {
  const mesh = new THREE.Mesh(model.getResultMesh().geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(point, new THREE.Vector3(1, 0.1234, 0.0567).normalize());
  return ray.intersectObject(mesh).length % 2 === 1;
}

/**
 * Wires a hierarchy action handler over a scene.
 *
 * @param world Scene world.
 * @returns Handler and its selection.
 */
function handlerOf(world: THREE.Group): { handler: HandlerObjectAction; selection: ManagerSelection } {
  const selection = new ManagerSelection();
  return { handler: new HandlerObjectAction(world, new CommandStack(64), selection), selection };
}

describe('generator pieces in the CSG order', () => {
  const cases: [Spot, SolidOperation, boolean][] = [
    ['root', SolidOperation.Subtractive, false],
    ['additive group', SolidOperation.Subtractive, true],
    ['subtractive group', SolidOperation.Additive, false],
  ];
  for (const [spot, operation, solid] of cases) {
    it(`combines like a box brush at the same spot: ${SolidOperation[operation]} cutter at ${spot}`, () => {
      const brush = scene('brush', spot, operation);
      const generator = scene('generator', spot, operation);
      expect(solidAt(brush.model, PROBE)).toBe(solid);
      expect(solidAt(generator.model, PROBE)).toBe(solid);
      expect(solidAt(generator.model, new THREE.Vector3(1.6, 0.2, 1.6))).toBe(true);
    });
  }

  it('re-places a generator in the CSG order when it is grouped and ungrouped, like a brush', () => {
    for (const cutter of ['brush', 'generator'] as const) {
      const { world, model, node } = scene(cutter, 'root', SolidOperation.Subtractive);
      const { handler, selection } = handlerOf(world);
      expect(solidAt(model, PROBE)).toBe(false);
      selection.setSelection([node as THREE.Mesh], [node]);
      handler.onGroupSelected();
      const group = node.parent as THREE.Group;
      expect(group).not.toBe(model.root);
      expect(solidAt(model, PROBE)).toBe(true);
      handler.ungroupGroup(group);
      expect(node.parent).toBe(model.root);
      expect(solidAt(model, PROBE)).toBe(false);
    }
  });
});
