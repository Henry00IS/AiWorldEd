import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandTransformTranslate } from '@/transform/commands/command_transform_translate.js';
import { CommandTransformRotate } from '@/transform/commands/command_transform_rotate.js';
import { CommandTransformScale } from '@/transform/commands/command_transform_scale.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackKinds } from '@/modifier/stack/modifier_stack_catalog.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateEntries } from '@/modifier/stack/modifier_volume_templates.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { UndoCommand } from '@/commands/command_undo.js';
import type { ModifierStackCategory } from '@/modifier/stack/kinds/modifier_stack_kind.js';

describe('modifier volume parent transform undo', () => {
  for (const kind of modifierStackKinds) {
    describe(kind.id, () => {
      it('restores derived output when a parent group move is undone and redone', () => {
        expectHistoryRoundTrip(sceneForKind(kind.id, kind.category), moveGroup);
      });

      it('restores derived output when a parent group rotation is undone and redone', () => {
        expectHistoryRoundTrip(sceneForKind(kind.id, kind.category), rotateGroup);
      });

      it('restores derived output when a parent group scale is undone and redone', () => {
        expectHistoryRoundTrip(sceneForKind(kind.id, kind.category), scaleGroup);
      });

      it('restores derived output when a parent group is moved and compiled without a volume-pose remember, then undone', () => {
        const scene = sceneForKind(kind.id, kind.category);
        const start = resultFingerprint(scene);
        const command = moveGroup(scene.group);
        command.execute();
        scene.world.updateMatrixWorld(true);
        scene.model.rebuild(true);
        expect(resultFingerprint(scene), 'parent move should change the compiled result').not.toBe(start);
        command.undo();
        SolidModel.refreshAfterHistoryChange(scene.world);
        expect(resultFingerprint(scene), 'undo should restore the compiled result').toBe(start);
      });
    });
  }
});

/** World, solid, parent group and the compiled result under test. */
interface VolumeUndoScene {
  world: THREE.Group;
  model: SolidModel;
  group: THREE.Group;
}

/**
 * Builds a world group that contains the solid and the volume or generator, so
 * moving the group changes the compiled output together.
 *
 * @param kindId Persisted kind id.
 * @param category Kind category.
 * @returns Scene.
 */
function sceneForKind(kindId: string, category: ModifierStackCategory): VolumeUndoScene {
  const world = new THREE.Group();
  const group = new THREE.Group();
  group.name = 'Parent Group';
  world.add(group);
  const model = new SolidModel(`Undo ${kindId}`);
  group.add(model.root);
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  source.mesh!.position.set(1.25, 0, 0);
  source.pullTransformFromMesh();
  if (category === 'generate') {
    const node = modifierGeneratorNodeCreate(kindId);
    node.position.set(0, 0, 0);
    model.root.add(node);
  } else {
    const volume = ModifierVolume.create({ modifiers: volumeEntries(kindId) });
    volume.scale.setScalar(8);
    group.add(volume);
  }
  world.updateMatrixWorld(true);
  modifierBevelRefreshScene(world);
  return { world, model, group };
}

/**
 * Builds stack entries for a capturing volume, giving Smooth a wide angle so
 * shading changes are visible on a box.
 *
 * @param kindId Kind id.
 * @returns Stack entries.
 */
function volumeEntries(kindId: string) {
  const entries = modifierVolumeTemplateEntries([kindId]);
  if (kindId !== 'smooth') return entries;
  return entries.map((entry) => ({ ...entry, parameters: { ...entry.parameters, maxAngle: 180 } }));
}

/**
 * Executes a group transform, refreshes as a live commit would, then checks
 * that undo and redo restore the compiled result through the editor's history
 * refresh path.
 *
 * @param scene Scene under test.
 * @param makeCommand Factory for the parent-group command.
 */
function expectHistoryRoundTrip(scene: VolumeUndoScene, makeCommand: (group: THREE.Object3D) => UndoCommand): void {
  const start = resultFingerprint(scene);
  const command = makeCommand(scene.group);
  command.execute();
  modifierBevelRefreshScene(scene.world);
  const transformed = resultFingerprint(scene);
  expect(transformed, 'parent transform should change the compiled result').not.toBe(start);
  command.undo();
  SolidModel.refreshAfterHistoryChange(scene.world);
  expect(resultFingerprint(scene), 'undo should restore the compiled result').toBe(start);
  command.execute();
  SolidModel.refreshAfterHistoryChange(scene.world);
  expect(resultFingerprint(scene), 'redo should restore the transformed result').toBe(transformed);
}

/**
 * Builds a translate command that moves a group far enough to change coverage
 * and clone placement.
 *
 * @param group Parent group.
 * @returns Translate command.
 */
function moveGroup(group: THREE.Object3D): CommandTransformTranslate {
  return new CommandTransformTranslate(
    [
      {
        object: group,
        position: group.position.clone(),
        finalPosition: group.position.clone().add(new THREE.Vector3(12, 5, 0)),
      },
    ],
    new THREE.Vector3(),
  );
}

/**
 * Builds a rotate command that orbits the group away from the origin.
 *
 * @param group Parent group.
 * @returns Rotate command.
 */
function rotateGroup(group: THREE.Object3D): CommandTransformRotate {
  const originalPosition = group.position.clone();
  const originalQuaternion = group.quaternion.clone();
  const finalPosition = originalPosition.clone().add(new THREE.Vector3(10, 0, 0));
  const finalQuaternion = originalQuaternion
    .clone()
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
  return new CommandTransformRotate(
    [{ object: group, originalPosition, originalQuaternion, finalPosition, finalQuaternion }],
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
    Math.PI / 2,
  );
}

/**
 * Builds a scale command that enlarges the group and shifts it so coverage and
 * generated poses change.
 *
 * @param group Parent group.
 * @returns Scale command.
 */
function scaleGroup(group: THREE.Object3D): CommandTransformScale {
  const originalPosition = group.position.clone();
  const originalScale = group.scale.clone();
  return new CommandTransformScale(
    [
      {
        object: group,
        originalPosition,
        originalScale,
        finalPosition: originalPosition.clone().add(new THREE.Vector3(12, 5, 0)),
        finalScale: originalScale.clone().multiplyScalar(2),
      },
    ],
    new THREE.Vector3(),
    new THREE.Vector3(1, 0, 0),
    2,
  );
}

/**
 * Builds a compact fingerprint of the compiled solid in world space, including
 * positions and normals so shading-only kinds are covered too.
 *
 * @param scene Scene under test.
 * @returns Stable fingerprint.
 */
function resultFingerprint(scene: VolumeUndoScene): string {
  scene.world.updateMatrixWorld(true);
  const mesh = scene.model.getResultMesh();
  const box = new THREE.Box3().setFromObject(mesh, true);
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  const quantize = (value: number): number => Math.round(value * 1e5);
  const parts = [
    quantize(box.min.x),
    quantize(box.min.y),
    quantize(box.min.z),
    quantize(box.max.x),
    quantize(box.max.y),
    quantize(box.max.z),
    position?.count ?? 0,
    checksumAttribute(position, quantize),
    checksumAttribute(normal, quantize),
  ];
  return parts.join(',');
}

/**
 * Sums quantized attribute components.
 *
 * @param attribute Geometry attribute, if any.
 * @param quantize Rounding function.
 * @returns Checksum.
 */
function checksumAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  quantize: (value: number) => number,
): number {
  if (!attribute) return 0;
  let sum = 0;
  for (let index = 0; index < attribute.count * attribute.itemSize; index++) {
    sum += quantize(attribute.array[index] ?? 0);
  }
  return sum;
}
