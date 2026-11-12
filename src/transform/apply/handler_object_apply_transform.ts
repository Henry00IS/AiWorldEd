import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ObjectApplyTransformKind, getObjectApplyTransformKindLabel } from '@/types/object_apply_transform_kind.js';
import { objectApplyTransformFlagsFromKind } from './object_apply_transform_flags.js';
import { CommandObjectApplyTransform, type ObjectApplyTarget } from './command_object_apply_transform.js';
import type { EditDomainTarget } from '@/edit/session/edit_session_domain.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { isResultMesh, isSolidModelObject } from '@/solid/model/solid_model_keys.js';

/** Dependencies for applying object transforms. */
export interface HandlerObjectApplyTransformDependencies {
  commandStack: CommandStack;
  getSelectedObjects: () => readonly THREE.Object3D[];
  getEditDomainTargets?: () => readonly EditDomainTarget[] | null;
  showStatusMessage: (message: string) => void;
  onAfterApply: (objects: readonly THREE.Object3D[]) => void;
}

/** Runs Object → Apply on the Edit Mode domain or object selection. */
export class HandlerObjectApplyTransform {
  private readonly deps: HandlerObjectApplyTransformDependencies;

  /**
   * Creates the apply handler.
   *
   * @param deps Shared editor dependencies.
   */
  constructor(deps: HandlerObjectApplyTransformDependencies) {
    this.deps = deps;
  }

  /**
   * Applies the chosen transform channels to the current domain or selection.
   *
   * @param kind Apply kind from the Object menu.
   * @returns True when at least one object changed.
   */
  apply(kind: ObjectApplyTransformKind): boolean {
    const targets = this.collectTargets();
    if (targets.length === 0) {
      this.deps.showStatusMessage('Select a mesh or brush to apply transforms');
      return false;
    }
    const flags = objectApplyTransformFlagsFromKind(kind);
    const command = new CommandObjectApplyTransform(flags, targets);
    command.execute();
    if (!command.didApply()) {
      this.deps.showStatusMessage(`Nothing to apply (${getObjectApplyTransformKindLabel(kind)})`);
      return false;
    }
    this.deps.commandStack.recordExecuted(command);
    this.deps.onAfterApply(this.collectAffectedObjects(targets));
    this.deps.showStatusMessage(`Applied ${getObjectApplyTransformKindLabel(kind)}`);
    return true;
  }

  /**
   * Builds apply targets from Edit Mode domain when open, otherwise selection.
   *
   * @returns Mesh and brush targets.
   */
  private collectTargets(): ObjectApplyTarget[] {
    const domain = this.deps.getEditDomainTargets?.() ?? null;
    if (domain && domain.length > 0) {
      return this.targetsFromEditDomain(domain);
    }
    return this.targetsFromSelection(this.deps.getSelectedObjects());
  }

  /**
   * Maps Edit Mode domain targets to apply targets.
   *
   * @param domain Edit domain.
   * @returns Apply targets.
   */
  private targetsFromEditDomain(domain: readonly EditDomainTarget[]): ObjectApplyTarget[] {
    const targets: ObjectApplyTarget[] = [];
    for (const entry of domain) {
      if (entry.kind === 'content_mesh') {
        targets.push({ kind: 'mesh', mesh: entry.mesh });
        continue;
      }
      const instance = entry.solidModel.findBrush(entry.brushId);
      if (instance) {
        targets.push({ kind: 'brush', solidModel: entry.solidModel, instance });
      }
    }
    return targets;
  }

  /**
   * Maps object selection to apply targets.
   *
   * @param selected Selected objects.
   * @returns Apply targets.
   */
  private targetsFromSelection(selected: readonly THREE.Object3D[]): ObjectApplyTarget[] {
    const targets: ObjectApplyTarget[] = [];
    const seenMeshes = new Set<string>();
    const seenBrushes = new Set<string>();
    for (const object of selected) {
      this.appendSelectionObject(object, targets, seenMeshes, seenBrushes);
    }
    return targets;
  }

  /**
   * Appends apply targets discovered under one selected object.
   *
   * @param object Selected object.
   * @param targets Output list.
   * @param seenMeshes Deduped mesh uuids.
   * @param seenBrushes Deduped brush keys.
   */
  private appendSelectionObject(
    object: THREE.Object3D,
    targets: ObjectApplyTarget[],
    seenMeshes: Set<string>,
    seenBrushes: Set<string>,
  ): void {
    if (object instanceof THREE.Mesh && this.isContentMesh(object)) {
      this.appendMeshTarget(object, targets, seenMeshes);
      return;
    }
    const solidModel = SolidModel.fromObject(object);
    if (!solidModel) {
      return;
    }
    if (SolidBrushVisual.isBrushObject(object) && object instanceof THREE.Mesh) {
      const instance = solidModel.findBrushByMesh(object);
      if (instance) {
        this.appendBrushTarget(solidModel, instance.id, targets, seenBrushes);
      }
      return;
    }
    if (isSolidModelObject(object) || isResultMesh(object)) {
      for (const instance of solidModel.getBrushes()) {
        this.appendBrushTarget(solidModel, instance.id, targets, seenBrushes);
      }
    }
  }

  /**
   * Appends one content mesh target when not already present.
   *
   * @param mesh Content mesh.
   * @param targets Output list.
   * @param seenMeshes Deduped uuids.
   */
  private appendMeshTarget(mesh: THREE.Mesh, targets: ObjectApplyTarget[], seenMeshes: Set<string>): void {
    if (seenMeshes.has(mesh.uuid)) {
      return;
    }
    seenMeshes.add(mesh.uuid);
    targets.push({ kind: 'mesh', mesh });
  }

  /**
   * Appends one brush target when not already present.
   *
   * @param solidModel Solid model.
   * @param brushId Brush id.
   * @param targets Output list.
   * @param seenBrushes Deduped keys.
   */
  private appendBrushTarget(
    solidModel: SolidModel,
    brushId: string,
    targets: ObjectApplyTarget[],
    seenBrushes: Set<string>,
  ): void {
    const key = `${solidModel.root.uuid}:${brushId}`;
    if (seenBrushes.has(key)) {
      return;
    }
    const instance = solidModel.findBrush(brushId);
    if (!instance) {
      return;
    }
    seenBrushes.add(key);
    targets.push({ kind: 'brush', solidModel, instance });
  }

  /**
   * Returns whether a mesh is ordinary content (not brush/result helpers).
   *
   * @param mesh Candidate mesh.
   * @returns True for content meshes.
   */
  private isContentMesh(mesh: THREE.Mesh): boolean {
    if (SolidBrushVisual.isBrushObject(mesh)) {
      return false;
    }
    if (isResultMesh(mesh)) {
      return false;
    }
    return true;
  }

  /**
   * Collects scene objects touched by an apply for visual refresh.
   *
   * @param targets Applied targets.
   * @returns Objects for gizmo/CSG refresh.
   */
  private collectAffectedObjects(targets: readonly ObjectApplyTarget[]): THREE.Object3D[] {
    const objects: THREE.Object3D[] = [];
    for (const target of targets) {
      if (target.kind === 'mesh') {
        objects.push(target.mesh);
        continue;
      }
      if (target.instance.mesh) {
        objects.push(target.instance.mesh);
      }
      objects.push(target.solidModel.root);
    }
    return objects;
  }
}
