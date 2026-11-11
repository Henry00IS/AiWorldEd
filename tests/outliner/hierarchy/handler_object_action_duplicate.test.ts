import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { HandlerObjectAction } from '@/outliner/hierarchy/handler_object_action.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { markAsSolidCsgGroup, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';

/** Scene pieces shared by the duplicate tests. */
interface DuplicateScene {
  world: THREE.Group;
  commandStack: CommandStack;
  selectionManager: ManagerSelection;
  handler: HandlerObjectAction;
}

/**
 * Builds an empty world with a handler.
 *
 * @returns Scene pieces.
 */
function sceneCreate(): DuplicateScene {
  const world = new THREE.Group();
  world.name = 'World';
  const commandStack = new CommandStack(64);
  const selectionManager = new ManagerSelection();
  const handler = new HandlerObjectAction(world, commandStack, selectionManager);
  return { world, commandStack, selectionManager, handler };
}

/**
 * Creates a solid CSG group under a parent.
 *
 * @param parent Solid root or CSG group.
 * @param name Group name.
 * @returns The group.
 */
function csgGroupAdd(parent: THREE.Object3D, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  markAsSolidCsgGroup(group);
  parent.add(group);
  return group;
}

/**
 * Adds a box brush to a model and moves its mesh under a parent.
 *
 * @param model Solid model.
 * @param parent Solid root or CSG group.
 * @returns The brush mesh.
 */
function brushAdd(model: SolidModel, parent: THREE.Object3D): THREE.Mesh {
  const brush = model.addBoxBrush(1, SolidOperation.Additive);
  parent.add(brush.mesh!);
  model.syncBrushOrderFromScene();
  return brush.mesh!;
}

/**
 * Describes a hierarchy node and its content children by kind, for structure
 * comparison between a source and its copy.
 *
 * @param object Hierarchy node.
 * @returns Nested kind description.
 */
function shape(object: THREE.Object3D): unknown {
  const kind = SolidModel.isSolidModelObject(object)
    ? 'model'
    : SolidBrushVisual.isBrushObject(object)
      ? 'brush'
      : isSolidCsgGroup(object)
        ? 'csg'
        : ModifierVolume.isGenerator(object)
          ? `generator:${ModifierVolume.read(object).modifiers[0]?.kind ?? ''}`
          : ModifierVolume.isVolume(object)
            ? 'volume'
            : object instanceof THREE.Mesh
              ? 'mesh'
              : 'group';
  const children = object.children
    .filter((child) => !isEditorHelperObject(child) && !SolidModel.isResultMesh(child))
    .map((child) => shape(child));
  return children.length > 0 ? { kind, children } : kind;
}

/**
 * Returns the sibling right after an object.
 *
 * @param object Source object.
 * @returns Next sibling.
 */
function nextSibling(object: THREE.Object3D): THREE.Object3D {
  const parent = object.parent!;
  return parent.children[parent.children.indexOf(object) + 1]!;
}

/**
 * Lists every object under a root, root included.
 *
 * @param root Subtree root.
 * @returns Objects.
 */
function subtree(root: THREE.Object3D): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  root.traverse((object) => objects.push(object));
  return objects;
}

describe('HandlerObjectAction duplicate of every object kind', () => {
  it('duplicates a CSG group with its brush and Column generator', () => {
    const { world, handler } = sceneCreate();
    const model = new SolidModel('Solid');
    world.add(model.root);
    const group = csgGroupAdd(model.root, 'Columns');
    brushAdd(model, group);
    const column = modifierGeneratorNodeCreate('column');
    column.position.set(3, 0, 0);
    group.add(column);
    const brushesBefore = model.getBrushCount();

    handler.duplicateHierarchyObjects([group]);

    const copy = nextSibling(group);
    expect(copy).not.toBe(group);
    expect(shape(copy)).toEqual(shape(group));
    const copiedColumn = copy.children.find((child) => ModifierVolume.isGenerator(child))!;
    expect(copiedColumn).not.toBe(column);
    expect(ModifierVolume.read(copiedColumn)).toEqual(ModifierVolume.read(column));
    expect(copiedColumn.position.toArray()).toEqual(column.position.toArray());
    expect(copiedColumn.children.some((child) => child.userData['isModifierVolumeEdge'] === true)).toBe(true);
    expect(model.getBrushCount()).toBe(brushesBefore + 1);
  });

  it('duplicates nested CSG groups with a generator, a volume and brushes in order', () => {
    const { world, handler } = sceneCreate();
    const model = new SolidModel('Solid');
    world.add(model.root);
    const outer = csgGroupAdd(model.root, 'Outer');
    brushAdd(model, outer);
    const inner = csgGroupAdd(outer, 'Inner');
    inner.add(modifierGeneratorNodeCreate('stairs'));
    inner.add(ModifierVolume.create({}));
    brushAdd(model, inner);

    handler.duplicateHierarchyObjects([outer]);

    const copy = nextSibling(outer);
    expect(shape(copy)).toEqual(shape(outer));
    expect(subtree(copy).some((object) => subtree(outer).includes(object))).toBe(false);
  });

  it('duplicates a plain group outside every model with all of its content', () => {
    const { world, handler } = sceneCreate();
    const group = new THREE.Group();
    group.name = 'Props';
    world.add(group);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const inner = new THREE.Group();
    inner.name = 'Inner';
    group.add(inner);
    inner.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const model = new SolidModel('Solid');
    group.add(model.root);
    brushAdd(model, model.root);

    handler.duplicateHierarchyObjects([group]);

    const copy = nextSibling(group);
    expect(copy).toBeInstanceOf(THREE.Group);
    expect(copy).not.toBe(group);
    expect(shape(copy)).toEqual(shape(group));
    const copiedModel = SolidModel.fromObject(copy.children.find((child) => SolidModel.isSolidModelObject(child))!);
    expect(copiedModel).not.toBe(model);
    expect(copiedModel?.getBrushCount()).toBe(1);
  });

  it('duplicates a whole solid model with its groups and generators', () => {
    const { world, handler } = sceneCreate();
    const model = new SolidModel('Solid');
    world.add(model.root);
    const group = csgGroupAdd(model.root, 'Group');
    brushAdd(model, group);
    group.add(modifierGeneratorNodeCreate('arch'));

    handler.duplicateHierarchyObjects([model.root]);

    const copy = nextSibling(model.root);
    expect(SolidModel.fromObject(copy)).not.toBe(model);
    expect(shape(copy)).toEqual(shape(model.root));
  });

  it('duplicates a mixed selection next to each source', () => {
    const { world, handler, selectionManager } = sceneCreate();
    const model = new SolidModel('Solid');
    world.add(model.root);
    const brush = brushAdd(model, model.root);
    const generator = modifierGeneratorNodeCreate('column');
    model.root.add(generator);
    const props = new THREE.Group();
    world.add(props);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    props.add(crate);
    const empty = new THREE.Group();
    world.add(empty);

    handler.duplicateHierarchyObjects([crate, brush, empty, generator]);

    for (const source of [brush, generator, crate, empty]) {
      const copy = nextSibling(source);
      expect(copy).not.toBe(source);
      expect(copy.parent).toBe(source.parent);
      expect(shape(copy)).toEqual(shape(source));
    }
    expect(selectionManager.getInspectorObjects()).toHaveLength(4);
  });

  it('undoes everything in one step and redoes the same objects', () => {
    const { world, handler, commandStack } = sceneCreate();
    const model = new SolidModel('Solid');
    world.add(model.root);
    const group = csgGroupAdd(model.root, 'Group');
    brushAdd(model, group);
    group.add(modifierGeneratorNodeCreate('column'));
    const props = new THREE.Group();
    world.add(props);
    props.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const rootChildren = model.root.children.slice();
    const worldChildren = world.children.slice();
    const brushes = model.getBrushCount();

    handler.duplicateHierarchyObjects([group, props]);
    const groupCopy = nextSibling(group);
    const propsCopy = nextSibling(props);
    const created = [...subtree(groupCopy), ...subtree(propsCopy)];

    commandStack.undo();
    expect(model.root.children).toEqual(rootChildren);
    expect(world.children).toEqual(worldChildren);
    expect(model.getBrushCount()).toBe(brushes);

    commandStack.redo();
    expect(nextSibling(group)).toBe(groupCopy);
    expect(nextSibling(props)).toBe(propsCopy);
    expect([...subtree(groupCopy), ...subtree(propsCopy)]).toEqual(created);
    expect(model.getBrushCount()).toBe(brushes + 1);
    expect(shape(groupCopy)).toEqual(shape(group));
  });
});
