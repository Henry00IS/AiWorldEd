import * as THREE from 'three';
import { isResultMesh, isSolidModelObject } from '@/solid/model/solid_model_keys.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { modifierStackOutputIs } from '@/modifier/stack/output/modifier_stack_output.js';

/** One editable content mesh in the Edit Mode domain. */
export interface EditDomainContentMesh {
  kind: 'content_mesh';
  mesh: THREE.Mesh;
  targetId: string;
}

/** One solid brush in the Edit Mode domain (constrained edit later). */
export interface EditDomainBrush {
  kind: 'brush';
  solidModel: SolidModel;
  brushId: string;
  targetId: string;
  resultMesh: THREE.Mesh | null;
}

/** Union of editable domain targets. */
export type EditDomainTarget = EditDomainContentMesh | EditDomainBrush;

/**
 * Builds the Edit Mode domain from the current object selection.
 *
 * @param selectedObjects Objects selected in Object Mode on enter.
 * @returns Domain targets (content meshes and brushes).
 */
export function buildEditSessionDomain(selectedObjects: readonly THREE.Object3D[]): EditDomainTarget[] {
  const targets: EditDomainTarget[] = [];
  const seen = new Set<string>();
  for (const object of selectedObjects) {
    appendDomainTargetsFromObject(object, targets, seen);
  }
  return targets;
}

/**
 * Appends domain targets discovered under one selected object. Brushes and
 * meshes a modifier stack built are skipped, since their stack rebuilds them.
 *
 * @param object Selected scene object.
 * @param targets Output list.
 * @param seen Deduped target ids.
 */
function appendDomainTargetsFromObject(object: THREE.Object3D, targets: EditDomainTarget[], seen: Set<string>): void {
  if (modifierStackOutputIs(object)) {
    return;
  }
  if (object instanceof THREE.Mesh && isEditableContentMesh(object)) {
    appendContentMeshTarget(object, targets, seen);
    return;
  }
  appendSolidModelTargetsFromObject(object, targets, seen);
}

/**
 * Appends the brush targets a selected solid model, brush or result mesh stands
 * for.
 *
 * @param object Selected scene object.
 * @param targets Output list.
 * @param seen Deduped target ids.
 */
function appendSolidModelTargetsFromObject(
  object: THREE.Object3D,
  targets: EditDomainTarget[],
  seen: Set<string>,
): void {
  const solidModel = SolidModel.fromObject(object);
  if (!solidModel) {
    return;
  }
  if (isSolidModelObject(object)) {
    appendSolidModelBrushTargets(solidModel, targets, seen);
    return;
  }
  const singleBrush = solidModel.findBrushByMesh(object);
  if (singleBrush) {
    appendSingleBrushTarget(solidModel, singleBrush.id, targets, seen);
    return;
  }
  if (isResultMesh(object)) {
    appendSolidModelBrushTargets(solidModel, targets, seen);
  }
}

/**
 * Appends one brush target by id.
 *
 * @param solidModel Solid model.
 * @param brushId Brush id.
 * @param targets Output list.
 * @param seen Deduped ids.
 */
function appendSingleBrushTarget(
  solidModel: SolidModel,
  brushId: string,
  targets: EditDomainTarget[],
  seen: Set<string>,
): void {
  const targetId = `brush:${brushId}`;
  if (seen.has(targetId)) {
    return;
  }
  if (!solidModel.findBrush(brushId)) {
    return;
  }
  seen.add(targetId);
  targets.push({
    kind: 'brush',
    solidModel,
    brushId,
    targetId,
    resultMesh: solidModel.getResultMesh(),
  });
}

/**
 * Returns whether a mesh is ordinary content geometry for freeform edit.
 *
 * @param mesh Candidate mesh.
 * @returns True for non-solid content meshes.
 */
export function isEditableContentMesh(mesh: THREE.Mesh): boolean {
  if (isResultMesh(mesh)) {
    return false;
  }
  if (SolidBrushVisual.shouldSkipFacePick(mesh)) {
    return false;
  }
  if (mesh.userData['isSolidBrush'] === true) {
    return false;
  }
  return true;
}

/**
 * Appends one content mesh target.
 *
 * @param mesh Content mesh.
 * @param targets Output list.
 * @param seen Deduped ids.
 */
function appendContentMeshTarget(mesh: THREE.Mesh, targets: EditDomainTarget[], seen: Set<string>): void {
  const targetId = mesh.uuid;
  if (seen.has(targetId)) {
    return;
  }
  seen.add(targetId);
  targets.push({ kind: 'content_mesh', mesh, targetId });
}

/**
 * Appends every brush under a solid model as constrained domain targets.
 *
 * @param solidModel Solid model.
 * @param targets Output list.
 * @param seen Deduped ids.
 */
function appendSolidModelBrushTargets(solidModel: SolidModel, targets: EditDomainTarget[], seen: Set<string>): void {
  const resultMesh = solidModel.getResultMesh();
  for (const instance of solidModel.getBrushes()) {
    const targetId = `brush:${instance.id}`;
    if (seen.has(targetId)) {
      continue;
    }
    seen.add(targetId);
    targets.push({
      kind: 'brush',
      solidModel,
      brushId: instance.id,
      targetId,
      resultMesh,
    });
  }
}
