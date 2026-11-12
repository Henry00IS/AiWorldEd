import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCaptureOf, modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import {
  modifierStackGeneratorsByRoot,
  modifierStackTargetsResolve,
} from '@/modifier/stack/scope/modifier_stack_targets.js';
import { modifierVolumeTargetRows } from '@/modifier/volume/modifier_volume_target_tree.js';
import { modifierVolumeBlacklistWrite } from '@/modifier/volume/modifier_volume_blacklist.js';
import { CommandHierarchyDuplicate } from '@/outliner/commands/command_hierarchy_duplicate.js';
import { clipboardSceneCopy } from '@/clipboard/scene/clipboard_scene_data.js';
import { CommandClipboardScenePaste } from '@/clipboard/scene/command_clipboard_scene_paste.js';
import { clipboardScenePasteTargetResolve } from '@/clipboard/scene/clipboard_scene_paste_target.js';

/**
 * A building: a 10 x 4 x 10 additive block, a subtracted room leaving 1-unit
 * walls, floor and ceiling, four pillars in the room and a window cut through
 * the +X wall. Everything is built from these numbers so each test can derive
 * where the walls, pillars and window are.
 */
const BUILDING = { center: new THREE.Vector3(0, 2, 0), size: new THREE.Vector3(10, 4, 10) };
const ROOM = { center: new THREE.Vector3(0, 2, 0), size: new THREE.Vector3(8, 2, 8) };
const PILLAR_SIZE = new THREE.Vector3(0.5, 2, 0.5);
const PILLAR_SPOTS = [-2, 2].flatMap((x) => [-2, 2].map((z) => new THREE.Vector3(x, 2, z)));
const ROOM_WALL_X = ROOM.center.x + ROOM.size.x / 2;
const BUILDING_WALL_X = BUILDING.center.x + BUILDING.size.x / 2;
const WINDOW = {
  center: new THREE.Vector3((ROOM_WALL_X + BUILDING_WALL_X) / 2, 2, 0),
  size: new THREE.Vector3(BUILDING_WALL_X - ROOM_WALL_X + 1, 1, 1),
};

/** Scene of one building. */
interface BuildingScene {
  world: THREE.Group;
  model: SolidModel;
  building: THREE.Object3D;
  room: THREE.Object3D;
  pillars: THREE.Object3D[];
  window: THREE.Object3D;
}

/**
 * Adds a box brush with a center and size.
 *
 * @param model Solid model.
 * @param parent Parent node.
 * @param operation CSG operation.
 * @param box Center and size.
 * @param box.center Box center.
 * @param box.size Box size.
 * @param name Brush name.
 * @returns Brush mesh.
 */
function boxBrush(
  model: SolidModel,
  parent: THREE.Object3D,
  operation: SolidOperation,
  box: { center: THREE.Vector3; size: THREE.Vector3 },
  name: string,
): THREE.Object3D {
  const brush = model.addBoxBrush(1, operation, parent);
  const mesh = brush.mesh;
  if (!mesh) throw new Error('brush mesh missing');
  mesh.position.copy(box.center);
  mesh.scale.copy(box.size);
  mesh.name = name;
  mesh.updateMatrixWorld(true);
  brush.pullTransformFromMesh();
  return mesh;
}

/**
 * Builds the building, with the pillars under a given parent.
 *
 * @param pillarParent 'root' or 'group' for an additive CSG group of pillars.
 * @returns Scene.
 */
function buildingScene(pillarParent: 'root' | 'group' = 'root'): BuildingScene {
  const world = new THREE.Group();
  const model = new SolidModel('Building');
  world.add(model.root);
  const building = boxBrush(model, model.root, SolidOperation.Additive, BUILDING, 'Building');
  const room = boxBrush(model, model.root, SolidOperation.Subtractive, ROOM, 'Room');
  let parent: THREE.Object3D = model.root;
  if (pillarParent === 'group') {
    const group = new THREE.Group();
    group.name = 'Pillars';
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    model.root.add(group);
    parent = group;
  }
  const pillars = PILLAR_SPOTS.map((center, index) =>
    boxBrush(model, parent, SolidOperation.Additive, { center, size: PILLAR_SIZE }, `Pillar${index}`),
  );
  const window = boxBrush(model, model.root, SolidOperation.Subtractive, WINDOW, 'Window');
  world.updateMatrixWorld(true);
  return { world, model, building, room, pillars, window };
}

/**
 * Adds a bevel volume with a center and size under a parent.
 *
 * @param parent Parent node.
 * @param center Box center in world space.
 * @param size Box size.
 * @returns Volume.
 */
function volumeAt(parent: THREE.Object3D, center: THREE.Vector3, size: THREE.Vector3): THREE.Mesh {
  const volume = modifierVolumeTemplateCreate('bevel');
  volume.scale.copy(size);
  parent.add(volume);
  parent.updateMatrixWorld(true);
  volume.position.copy(parent.worldToLocal(center.clone()));
  parent.updateMatrixWorld(true);
  return volume;
}

/**
 * Names the brushes a volume affects in the scene's solid, before exclusions.
 *
 * @param scene Building scene.
 * @param volume Volume.
 * @returns Sorted brush names.
 */
function affected(scene: BuildingScene, volume: THREE.Object3D): string[] {
  scene.world.updateMatrixWorld(true);
  const brushes = scene.model.getBrushes();
  const targets = modifierStackTargetsResolve(volume, scene.model.root, brushes);
  return brushes
    .filter((brush) => targets.authoredIds.has(brush.id))
    .map((brush) => brush.mesh?.name ?? '')
    .sort();
}

const PILLAR_NAMES = PILLAR_SPOTS.map((_, index) => `Pillar${index}`);

describe('modifier volume scope: built geometry the volume touches', () => {
  it('takes the pillars it covers in a room, not the building or the room around it', () => {
    const scene = buildingScene();
    const span = Math.abs(PILLAR_SPOTS[0]!.x) * 2 + PILLAR_SIZE.x;
    const volume = volumeAt(scene.model.root, ROOM.center, new THREE.Vector3(span, 1, span));
    expect(affected(scene, volume)).toEqual(PILLAR_NAMES);
  });

  it('takes the room when it reaches a wall, and the building once it reaches the outside', () => {
    const scene = buildingScene();
    const z = PILLAR_SPOTS[0]!.z;
    const wall = volumeAt(scene.model.root, new THREE.Vector3(ROOM_WALL_X, 2, z), new THREE.Vector3(1, 0.5, 0.5));
    expect(affected(scene, wall)).toEqual(['Room']);
    const middle = (ROOM_WALL_X + BUILDING_WALL_X) / 2;
    const through = BUILDING_WALL_X - ROOM_WALL_X + 1;
    wall.position.set(middle, 2, z);
    wall.scale.set(through, 0.5, 0.5);
    expect(affected(scene, wall)).toEqual(['Building', 'Room']);
  });

  it('takes nothing while it floats in the hollow of a window, and the window once it reaches its sides', () => {
    const scene = buildingScene();
    const inside = WINDOW.size.clone().multiply(new THREE.Vector3(0.8, 0.6, 0.6));
    const volume = volumeAt(scene.model.root, WINDOW.center, inside);
    expect(affected(scene, volume)).toEqual([]);
    volume.scale.set((BUILDING_WALL_X - ROOM_WALL_X) * 0.6, WINDOW.size.y * 1.2, WINDOW.size.z * 0.6);
    expect(affected(scene, volume)).toEqual(['Window']);
  });

  it('takes nothing that comes after it in its parent', () => {
    const scene = buildingScene();
    const volume = volumeAt(scene.model.root, ROOM.center, new THREE.Vector3(5, 1, 5));
    scene.model.root.children.splice(scene.model.root.children.indexOf(volume), 1);
    scene.model.root.children.splice(scene.model.root.children.indexOf(scene.room) + 1, 0, volume);
    expect(affected(scene, volume)).toEqual([]);
    const later = boxBrush(
      scene.model,
      scene.model.root,
      SolidOperation.Additive,
      {
        center: ROOM.center,
        size: new THREE.Vector3(1, 1, 1),
      },
      'Later',
    );
    expect(later.parent?.children.indexOf(later)).toBeGreaterThan(scene.model.root.children.indexOf(volume));
    expect(affected(scene, volume)).toEqual([]);
  });

  it('inside a CSG group takes only that group, and its affect list lists only that group', () => {
    const scene = buildingScene('group');
    const group = scene.pillars[0]!.parent!;
    const reach = (ROOM_WALL_X + 0.25) * 2;
    const volume = volumeAt(group, ROOM.center, new THREE.Vector3(reach, 1, reach));
    expect(affected(scene, volume)).toEqual(PILLAR_NAMES);
    const rows = modifierVolumeTargetRows(volume, group).map((row) => row.name);
    expect(rows.sort()).toEqual(PILLAR_NAMES);
    modifierVolumeBlacklistWrite(volume, [scene.pillars[0]!.uuid]);
    const capture = modifierStackCaptureOf(volume, scene.model.getBrushes(), scene.model.root);
    expect(capture.units.map((unit) => unit.tree.name).sort()).toEqual(PILLAR_NAMES.slice(1));
  });

  it('outside every solid sees the whole solid by built geometry; inside another solid it sees nothing here', () => {
    const scene = buildingScene();
    const floating = volumeAt(scene.world, new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, 1, 1));
    expect(affected(scene, floating)).toEqual([]);
    floating.scale.set(5, 1, 5);
    expect(affected(scene, floating)).toEqual(PILLAR_NAMES);
    const other = new SolidModel('Other');
    scene.world.add(other.root);
    other.root.add(floating);
    expect(modifierStackTargetsResolve(floating, scene.model.root, scene.model.getBrushes()).scope).toBeNull();
  });

  it('takes a generator that comes before it, but not one that comes after it', () => {
    const scene = buildingScene();
    const column = modifierGeneratorNodeCreate('column');
    column.scale.set(0.5, 2, 0.5);
    column.position.copy(ROOM.center);
    scene.model.root.add(column);
    const volume = volumeAt(scene.model.root, ROOM.center, new THREE.Vector3(1, 1, 1));
    const captured = () => {
      scene.world.updateMatrixWorld(true);
      modifierStackCompile(scene.model.getBrushes(), scene.model.root);
      const generators = modifierStackGeneratorsByRoot.get(scene.model.root);
      return modifierStackCaptureOf(volume, scene.model.getBrushes(), scene.model.root, generators).units.length;
    };
    expect(captured()).toBeGreaterThan(0);
    scene.model.root.add(column);
    expect(captured()).toBe(0);
  });
});

describe('modifier volume placement inside a solid', () => {
  it('duplicates a volume inside a solid right after its source', () => {
    const scene = buildingScene();
    const volume = volumeAt(scene.model.root, ROOM.center, new THREE.Vector3(1, 1, 1));
    scene.model.root.children.splice(scene.model.root.children.indexOf(volume), 1);
    scene.model.root.children.splice(scene.model.root.children.indexOf(scene.room) + 1, 0, volume);
    const command = new CommandHierarchyDuplicate([volume], new THREE.Vector3());
    command.execute();
    const clone = scene.model.root.children[scene.model.root.children.indexOf(volume) + 1];
    expect(clone).not.toBe(scene.pillars[0]);
    expect(clone?.userData).toEqual(expect.objectContaining({ isModifierVolume: true }));
  });

  it('pastes a volume into the target solid after the anchor, and under the world without one', () => {
    const scene = buildingScene();
    const volume = volumeAt(scene.world, ROOM.center, new THREE.Vector3(1, 1, 1));
    const { data } = clipboardSceneCopy([volume]);
    const target = clipboardScenePasteTargetResolve(scene.world, scene.room, null);
    const paste = new CommandClipboardScenePaste(scene.world, JSON.parse(JSON.stringify(data)), target);
    paste.execute();
    const [pasted] = paste.pasted();
    expect(pasted?.parent).toBe(scene.model.root);
    expect(scene.model.root.children.indexOf(pasted!)).toBe(scene.model.root.children.indexOf(scene.room) + 1);
    const loose = new CommandClipboardScenePaste(scene.world, JSON.parse(JSON.stringify(data)));
    loose.execute();
    expect(loose.pasted()[0]?.parent).toBe(scene.world);
  });
});
