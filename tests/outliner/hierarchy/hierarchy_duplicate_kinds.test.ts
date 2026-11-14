import { describe, it, expect } from 'vitest';
import { DecalProjectorVolume } from '@/decal/volume/decal_projector_volume.js';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { HandlerObjectAction } from '@/outliner/hierarchy/handler_object_action.js';
import {
  hierarchyDuplicateKindOf,
  type HierarchyDuplicateKind,
} from '@/outliner/hierarchy/hierarchy_duplicate_clone.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { createAddMenuEntries, type AddMenuActions } from '@/layout/setup/add_menu_entries.js';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';
import { TerrainGenerator } from '@/terrain/terrain_generator.js';
import { modifierVolumeTemplateCreate, modifierVolumeTemplates } from '@/modifier/stack/modifier_volume_templates.js';
import {
  MODIFIER_GENERATOR_NODE_KINDS,
  modifierGeneratorNodeCreate,
} from '@/modifier/stack/modifier_generator_node.js';
import { contentMeshImportCreate, contentMeshImportFinalize } from '@/io/geometry/content_mesh_import.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import type { ObjectEntry } from '@/io/scene/io_types.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelCodec, type SerializedSolidTreeNode } from '@/solid/io/solid_model_codec.js';
import { getSolidGroupOperation, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { setObjectLocked } from '@/utils/object_lock.js';

/** Makes one object of a kind the user can create or import. */
type ObjectFactory = () => THREE.Object3D;

/** Makes one solid hierarchy node inside a model, under a parent. */
type SolidNodeFactory = (model: SolidModel, parent: THREE.Object3D) => THREE.Object3D;

const primitives = new ToolPrimitiveCreation(new THREE.Group());

/**
 * Builds an imported content mesh the way the OBJ, glTF and FBX importers do.
 *
 * @param flagKey Importer flag.
 * @returns Imported mesh.
 */
function importedMesh(flagKey: string): THREE.Mesh {
  const mesh = contentMeshImportCreate(createMeshDocumentBox(1, 2, 1), 'Imported', flagKey);
  contentMeshImportFinalize(mesh, false);
  return mesh;
}

/**
 * Builds a solid model with one box brush.
 *
 * @returns Solid model root.
 */
function solidModelWithBrush(): THREE.Object3D {
  const model = new SolidModel('Solid');
  model.addBoxBrush(1, SolidOperation.Additive);
  return model.root;
}

/** Every Add menu action, keyed by callback name and template id. */
const addMenuFactories: Record<string, ObjectFactory> = {
  onAddCube: () => primitives.createBox(1, 1, 1),
  onAddSphere: () => primitives.createSphere(0.5),
  onAddCylinder: () => primitives.createCylinder(0.5, 0.5, 1),
  onAddPlane: () => primitives.createPlane(2, 2),
  onAddTerrain: () => new TerrainGenerator().createTerrain(8, 8, 4, 1, 7),
  onAddSolidModel: solidModelWithBrush,
  ...Object.fromEntries(
    modifierVolumeTemplates.map((template) => [
      `onAddModifierVolume:${template.id}`,
      () => modifierVolumeTemplateCreate(template.id),
    ]),
  ),
  'onAddDecalProjector:projector': () => DecalProjectorVolume.create({ mode: 'projector' }),
  'onAddDecalProjector:surfaceMesh': () => DecalProjectorVolume.create({ mode: 'surfaceMesh' }),
};

/** Scene entries that live outside solid models, by where they come from. */
const sceneFactories: Record<string, ObjectFactory> = {
  ...addMenuFactories,
  'Import OBJ Mesh': () => importedMesh('importedFromObj'),
  'Import glTF Mesh': () => importedMesh('importedFromGlb'),
  'Import FBX Mesh': () => importedMesh('importedFromFbx'),
  'Import Hierarchy Group': () => {
    const group = new THREE.Group();
    group.name = 'Imported';
    group.add(importedMesh('importedFromGlb'));
    return group;
  },
  'Plain Group': () => {
    const group = new THREE.Group();
    group.name = 'Group';
    group.add(primitives.createBox(1, 1, 1));
    return group;
  },
  'Hidden Cube': () => {
    const mesh = primitives.createBox(1, 1, 1);
    mesh.visible = false;
    return mesh;
  },
  'Group With A Locked Cube': () => {
    const group = new THREE.Group();
    group.name = 'Group';
    const mesh = primitives.createBox(1, 1, 1);
    setObjectLocked(mesh, true);
    group.add(mesh);
    return group;
  },
};

/**
 * Adds a CSG group with one brush under a parent.
 *
 * @param operation Group operation.
 * @returns Node factory.
 */
function csgGroupFactory(operation: SolidOperation): SolidNodeFactory {
  return (model, parent) => {
    const group = new THREE.Group();
    group.name = 'CSG Group';
    markAsSolidCsgGroup(group, operation);
    parent.add(group);
    group.add(model.addBoxBrush(1, SolidOperation.Additive).mesh!);
    group.add(modifierGeneratorNodeCreate('column'));
    model.syncBrushOrderFromScene();
    return group;
  };
}

/** Every node kind a solid model's brush tree holds. */
const solidNodeFactories: Record<SerializedSolidTreeNode['kind'], Record<string, SolidNodeFactory>> = {
  brush: {
    'Additive Brush': (model, parent) => brushAdd(model, parent, SolidOperation.Additive),
    'Subtractive Brush': (model, parent) => brushAdd(model, parent, SolidOperation.Subtractive),
    'Intersecting Brush': (model, parent) => brushAdd(model, parent, SolidOperation.Intersecting),
  },
  group: {
    'Additive CSG Group': csgGroupFactory(SolidOperation.Additive),
    'Subtractive CSG Group': csgGroupFactory(SolidOperation.Subtractive),
    'Intersecting CSG Group': csgGroupFactory(SolidOperation.Intersecting),
  },
  modifier: {
    ...Object.fromEntries(
      modifierVolumeTemplates.map((template) => [
        `Volume ${template.id}`,
        (_model: SolidModel, parent: THREE.Object3D) =>
          parent.add(modifierVolumeTemplateCreate(template.id)).children.at(-1)!,
      ]),
    ),
    ...Object.fromEntries(
      MODIFIER_GENERATOR_NODE_KINDS.map((kind) => [
        `Generator ${kind}`,
        (_model: SolidModel, parent: THREE.Object3D) => parent.add(modifierGeneratorNodeCreate(kind)).children.at(-1)!,
      ]),
    ),
  },
};

/**
 * Adds a box brush under a parent of its model.
 *
 * @param model Solid model.
 * @param parent Solid root or CSG group.
 * @param operation Brush operation.
 * @returns Brush mesh.
 */
function brushAdd(model: SolidModel, parent: THREE.Object3D, operation: SolidOperation): THREE.Object3D {
  const mesh = model.addBoxBrush(1, operation).mesh!;
  parent.add(mesh);
  model.syncBrushOrderFromScene();
  return mesh;
}

/** One sample per duplicate kind, so a new kind needs a sample here. */
const kindSamples: Record<Exclude<HierarchyDuplicateKind, 'helper'>, () => THREE.Object3D> = {
  solidModel: solidModelWithBrush,
  brush: () => new SolidModel('Solid').addBoxBrush(1, SolidOperation.Additive).mesh!,
  solidGroup: () => csgGroupFactory(SolidOperation.Additive)(new SolidModel('Solid'), new THREE.Group()),
  volume: () => modifierVolumeTemplateCreate('bevel'),
  mesh: () => primitives.createBox(1, 1, 1),
  group: () => new THREE.Group(),
};

const serializer = new SceneSerializer();

/**
 * Drops identity fields, which a copy must change, from serialized data, and
 * reads negative zero as zero.
 *
 * @param value Serialized data.
 * @returns Data without ids and names.
 */
function withoutIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIdentity);
  if (Object.is(value, -0)) return 0;
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['uuid', 'name', 'parentId', 'id', 'brushId'].includes(key))
      .map(([key, entry]) => [key, withoutIdentity(entry)]),
  );
}

/**
 * Describes a node and its content the way it is saved, without identity.
 *
 * @param object Node.
 * @returns Comparable description.
 */
function describeNode(object: THREE.Object3D): unknown {
  const kind = hierarchyDuplicateKindOf(object);
  const children = () =>
    object.children.filter((child) => hierarchyDuplicateKindOf(child) !== 'helper').map(describeNode);
  switch (kind) {
    case 'helper':
      return null;
    case 'brush': {
      const instance = SolidModel.fromObject(object)!.findBrushByMesh(object)!;
      return { kind, brush: withoutIdentity(SolidModelCodec.brushEncode(instance)) };
    }
    case 'solidGroup':
      return {
        kind,
        operation: getSolidGroupOperation(object),
        transform: object.matrix.toArray(),
        visible: object.visible,
        children: children(),
      };
    case 'group':
      return { kind, entry: withoutIdentity(entryOf(object)), children: children() };
    default:
      return { kind, entry: withoutIdentity(entryOf(object)) };
  }
}

/**
 * Serializes one node as the scene file does.
 *
 * @param object Node.
 * @returns Scene entry.
 */
function entryOf(object: THREE.Object3D): ObjectEntry {
  object.updateMatrix();
  return serializer.createEntryForChild(object, '');
}

/**
 * Duplicates a node through the outliner action and returns the copy.
 *
 * @param world World root.
 * @param source Node to duplicate.
 * @returns The copy right after the source.
 */
function duplicate(world: THREE.Group, source: THREE.Object3D): THREE.Object3D {
  const handler = new HandlerObjectAction(world, new CommandStack(16), new ManagerSelection());
  handler.duplicateHierarchyObjects([source]);
  const parent = source.parent!;
  const copy = parent.children[parent.children.indexOf(source) + 1]!;
  expect(copy).not.toBe(source);
  expect(copy.uuid).not.toBe(source.uuid);
  source.updateMatrix();
  copy.updateMatrix();
  return copy;
}

describe('Duplicate covers every object kind a user can make', () => {
  it('has a test factory for every Add menu entry', () => {
    const called: string[] = [];
    const actions = new Proxy({} as AddMenuActions, {
      get: (_target, key: string) => (templateId?: string) =>
        called.push(templateId === undefined ? key : `${key}:${templateId}`),
    });
    const walk = (entries: readonly unknown[]): void => {
      for (const entry of entries as Array<{ children?: unknown[]; onClick?: () => void }>) {
        if (entry.children) walk(entry.children);
        entry.onClick?.();
      }
    };
    walk(createAddMenuEntries(actions));
    expect(called.length).toBeGreaterThan(0);
    expect(called.filter((key) => !(key in addMenuFactories))).toEqual([]);
  });

  it('classifies a sample of every duplicate kind as that kind', () => {
    for (const [kind, sample] of Object.entries(kindSamples)) {
      expect(hierarchyDuplicateKindOf(sample()), kind).toBe(kind);
    }
  });

  it('classifies both scene entry types without leaving one out', () => {
    const types: Record<ObjectEntry['type'], THREE.Object3D> = {
      mesh: primitives.createBox(1, 1, 1),
      group: new THREE.Group(),
    };
    for (const object of Object.values(types)) expect(hierarchyDuplicateKindOf(object)).not.toBe('helper');
  });

  for (const [label, factory] of Object.entries(sceneFactories)) {
    it(`duplicates ${label} on its own and inside a plain group`, () => {
      const world = new THREE.Group();
      const alone = factory();
      world.add(alone);
      expect(describeNode(duplicate(world, alone))).toEqual(describeNode(alone));

      const holder = new THREE.Group();
      holder.name = 'Holder';
      world.add(holder);
      const inner = factory();
      holder.add(inner);
      const holderCopy = duplicate(world, holder);
      expect(describeNode(holderCopy)).toEqual(describeNode(holder));
      expect(holderCopy.children.filter((child) => hierarchyDuplicateKindOf(child) !== 'helper')).toHaveLength(1);
    });
  }

  for (const [nodeKind, factories] of Object.entries(solidNodeFactories)) {
    for (const [label, factory] of Object.entries(factories)) {
      it(`duplicates ${label} (${nodeKind}) on its own, inside a CSG group and inside a nested CSG group`, () => {
        const world = new THREE.Group();
        const model = new SolidModel('Solid');
        world.add(model.root);
        const alone = factory(model, model.root);
        expect(describeNode(duplicate(world, alone))).toEqual(describeNode(alone));

        const outer = new THREE.Group();
        markAsSolidCsgGroup(outer);
        model.root.add(outer);
        const nested = new THREE.Group();
        markAsSolidCsgGroup(nested, SolidOperation.Subtractive);
        outer.add(nested);
        factory(model, nested);
        model.syncBrushOrderFromScene();
        const brushesBefore = model.getBrushCount();
        const outerCopy = duplicate(world, outer);
        expect(describeNode(outerCopy)).toEqual(describeNode(outer));
        expect(model.getBrushCount()).toBe(brushesBefore + countBrushes(outer));
      });
    }
  }
});

/**
 * Counts brush meshes under a node.
 *
 * @param root Node.
 * @returns Brush count.
 */
function countBrushes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object !== root && hierarchyDuplicateKindOf(object) === 'brush') count++;
  });
  return count;
}
