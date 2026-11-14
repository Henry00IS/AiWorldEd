import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { DecalModelLayerServices } from '@/decal/layer/decal_model_layer.js';
import { getDebugCheckerTexture } from '@/texture/library/factory_debug_texture.js';
import { decalProjectorNodeCreate } from '@/decal/volume/decal_projector_node.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';

/** A small level: a floor slab, a wall standing on it, and a far pillar. */
export interface DecalTestLevel {
  world: THREE.Group;
  model: SolidModel;
  floor: SolidBrushInstance;
  wall: SolidBrushInstance;
  pillar: SolidBrushInstance;
  floorTop: number;
  wallFrontX: number;
}

/**
 * Adds a box brush with a pose.
 *
 * @param model Solid model.
 * @param center Box center.
 * @param size Box size.
 * @returns Brush.
 */
function decalTestBox(model: SolidModel, center: THREE.Vector3, size: THREE.Vector3): SolidBrushInstance {
  const brush = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  brush.position.copy(center);
  brush.scale.copy(size);
  brush.pushTransformToMesh();
  return brush;
}

/**
 * Builds the test level and compiles it.
 *
 * @returns Level parts and the planes the decals land on.
 */
export function decalTestLevelCreate(): DecalTestLevel {
  const model = new SolidModel('decal_test');
  const floor = decalTestBox(model, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(10, 1, 10));
  const wall = decalTestBox(model, new THREE.Vector3(-2, 1.5, 0), new THREE.Vector3(1, 3, 6));
  const pillar = decalTestBox(model, new THREE.Vector3(4, 4, 4), new THREE.Vector3(0.5, 2, 0.5));
  const world = new THREE.Group();
  world.add(model.root);
  decalTestLevelRebuild(world, model);
  return { world, model, floor, wall, pillar, floorTop: 0, wallFrontX: -1.5 };
}

/**
 * Recompiles a test level after brush changes.
 *
 * @param world World root.
 * @param model Solid model.
 */
export function decalTestLevelRebuild(world: THREE.Group, model: SolidModel): void {
  world.updateMatrixWorld(true);
  model.syncBrushesFromScene();
  model.syncBrushOrderFromScene();
  model.markDirty();
  model.rebuild(true);
}

/**
 * Returns layer services with the default image and a real clock.
 *
 * @returns Services.
 */
export function decalTestServices(): DecalModelLayerServices {
  return { resolveImage: () => getDebugCheckerTexture(), now: () => performance.now() };
}

/**
 * Returns layer services whose clock jumps far ahead on every reading, so any
 * budget is spent at once.
 *
 * @returns Services.
 */
export function decalTestServicesWithoutTime(): DecalModelLayerServices {
  let time = 0;
  return {
    resolveImage: () => getDebugCheckerTexture(),
    now: () => {
      time += 1000;
      return time;
    },
  };
}

/**
 * Moves one brush the way an interactive drag does, so only the brushes the
 * move touches recompile.
 *
 * @param level Test level.
 * @param brush Brush to move.
 * @param offset World offset.
 */
export function decalTestBrushMoveLive(level: DecalTestLevel, brush: SolidBrushInstance, offset: THREE.Vector3): void {
  const mesh = brush.mesh;
  if (!mesh) throw new Error('brush without mesh');
  mesh.position.add(offset);
  level.world.updateMatrixWorld(true);
  level.model.prepareLiveBrushEdit([mesh], { positionLock: true, stretchLock: true });
  level.model.rebuildLive();
}

/**
 * Creates a decal projector node with a unit box and optional Decal modifier
 * parameters.
 *
 * @param parameters Decal modifier parameters to set.
 * @returns Projector mesh.
 */
export function decalTestProjector(parameters: Record<string, unknown> = {}): THREE.Mesh {
  const projector = decalProjectorNodeCreate();
  projector.scale.set(1, 1, 1);
  decalTestParametersSet(projector, parameters);
  return projector;
}

/**
 * Changes Decal modifier parameters of a projector, as the panel would.
 *
 * @param projector Decal projector.
 * @param parameters Parameters to merge in.
 */
export function decalTestParametersSet(projector: THREE.Object3D, parameters: Record<string, unknown>): void {
  const stack = ModifierVolume.read(projector);
  const [decal, ...rest] = stack.modifiers;
  if (!decal) return;
  ModifierVolume.write(projector, {
    ...stack,
    modifiers: [{ ...decal, parameters: { ...decal.parameters, ...parameters } }, ...rest],
  });
}
