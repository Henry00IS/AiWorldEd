import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import type {
  FaceSurfaceDescription,
  FaceSurfaceDescriptionSerialized,
} from '@/texture/uv_matrix/face_surface_description.js';
import { modifierStackAuthoredBevelDerive } from '@/modifier/stack/evaluate/modifier_stack_authored_bevel.js';
import {
  modifierStackCaptureOf,
  modifierStackRecordsSeed,
  modifierStackRunCapture,
  modifierStackSharedCreate,
} from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierVolumeSceneRoot } from '@/modifier/stack/modifier_volume.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';

/** Brush geometry and surfaces, enough to restore an authored brush. */
export interface ModifierStackBakeShape {
  /** Convex topology in brush-local space. */
  brush: SolidBrush;
  /** Default surface. */
  defaultSurface: FaceSurfaceDescriptionSerialized;
  /** Per-face surfaces. */
  faceSurfaces: (FaceSurfaceDescriptionSerialized | undefined)[];
}

/** New authored brush made from one derived brush. */
export interface ModifierStackBakeCreation {
  /** Display name of the derived brush. */
  name: string;
  /** Source brush operation. */
  operation: SolidBrushInstance['operation'];
  /** Model-local position of the recentred brush. */
  position: THREE.Vector3;
  /** Topology centred on its own origin. */
  brush: SolidBrush;
  /** Face surfaces in the recentred frame. */
  surfaces: FaceSurfaceDescription[];
  /** Scene-order anchor: the authored node or volume slot it follows. */
  anchor: Pick<ModifierStackUnit, 'origin' | 'slot'>;
}

/** Everything one solid needs to bake a volume. */
export interface ModifierStackBakeModelPlan {
  /** Solid model. */
  model: SolidModel;
  /** Brushes to create, in output order. */
  created: ModifierStackBakeCreation[];
  /** Authored brushes whose shape the volume chamfered. */
  replaced: { id: string; before: ModifierStackBakeShape; after: ModifierStackBakeShape }[];
}

/**
 * Evaluates one volume against every solid, without touching the live scene,
 * and lists what baking would create and reshape.
 *
 * @param volume Modifier volume to bake.
 * @returns One plan per solid the volume changes.
 */
export function modifierStackBakePlan(volume: THREE.Object3D): ModifierStackBakeModelPlan[] {
  const sceneRoot = modifierVolumeSceneRoot(volume);
  sceneRoot.updateMatrixWorld(true);
  const plans: ModifierStackBakeModelPlan[] = [];
  for (const model of SolidModelRegistry.collectUnder(sceneRoot)) {
    const plan = modifierStackBakeModel(model, volume, sceneRoot);
    if (plan.created.length + plan.replaced.length > 0) plans.push(plan);
  }
  return plans;
}

/**
 * Plans the bake for one solid.
 *
 * @param model Solid model.
 * @param volume Modifier volume.
 * @param sceneRoot Scene root.
 * @returns Plan for this solid.
 */
function modifierStackBakeModel(
  model: SolidModel,
  volume: THREE.Object3D,
  sceneRoot: THREE.Object3D,
): ModifierStackBakeModelPlan {
  const authored = model.getBrushes();
  const capture = modifierStackCaptureOf(volume, authored, model.root);
  const bevel = modifierStackAuthoredBevelDerive([capture]);
  const shared = modifierStackSharedCreate(
    model.root,
    modifierStackRecordsSeed(authored, bevel.derived),
    (brush) => bevel.standIns.get(brush.id) ?? brush,
  );
  const created = modifierStackRunCapture(capture, shared, sceneRoot).flatMap((unit) =>
    unit.brushes.map((brush) => modifierStackBakeCreationOf(brush, { origin: unit.origin, slot: unit.slot })),
  );
  const replaced = [...bevel.standIns.entries()].flatMap(([id, standIn]) =>
    modifierStackBakeReplacement(authored, id, standIn),
  );
  return { model, created, replaced };
}

/**
 * Describes the reshape of one chamfered authored brush.
 *
 * @param authored Authored brushes.
 * @param id Brush id.
 * @param standIn Chamfered stand-in.
 * @returns Zero or one replacement.
 */
function modifierStackBakeReplacement(
  authored: readonly SolidBrushInstance[],
  id: string,
  standIn: SolidBrushInstance,
): ModifierStackBakePlanReplacement[] {
  const source = authored.find((brush) => brush.id === id);
  return source ? [{ id, before: modifierStackBakeShapeOf(source), after: modifierStackBakeShapeOf(standIn) }] : [];
}

type ModifierStackBakePlanReplacement = ModifierStackBakeModelPlan['replaced'][number];

/**
 * Captures the topology and surfaces of a brush.
 *
 * @param instance Brush.
 * @returns Detached shape.
 */
export function modifierStackBakeShapeOf(instance: SolidBrushInstance): ModifierStackBakeShape {
  return {
    brush: instance.brush.clone(),
    defaultSurface: instance.serializeDefaultSurface(),
    faceSurfaces: instance.serializeFaceSurfaces(),
  };
}

/**
 * Recentres a derived brush on its vertex centroid so the new authored brush
 * gets a sensible pivot; UVs follow so textures do not move.
 *
 * @param derived Derived brush in model space.
 * @param anchor Scene-order anchor of its unit.
 * @returns Creation record.
 */
function modifierStackBakeCreationOf(
  derived: SolidBrushInstance,
  anchor: ModifierStackBakeCreation['anchor'],
): ModifierStackBakeCreation {
  const center = new THREE.Vector3();
  for (const vertex of derived.brush.vertices) center.add(vertex);
  center.divideScalar(Math.max(1, derived.brush.vertices.length));
  const brush = derived.brush.clone();
  brush.transformVertices(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  const shift = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z);
  const surfaces = derived.brush.faces.map((_, index) => {
    const surface = derived.getFaceSurface(index);
    surface.uv = surface.uv.multiplyMatrix4(shift);
    return surface;
  });
  return { name: derived.name, operation: derived.operation, position: center, brush, surfaces, anchor };
}
