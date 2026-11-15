import * as THREE from 'three';
import type { EditorApiHost } from './editor_api_host.js';
import type { AlignBrushArgs, PreviewTransformArgs } from './editor_api_types.js';
import { boxToDto, computeBrushWorldBounds, vec3ToDto } from './editor_api_math.js';
import { findBrush } from './editor_api_lookup.js';
import {
  resolveEulerFromArgs,
  resolveSnappedPosition,
  resolveSnappedScale,
  shouldApplySnap,
  snapEulerWhenRequested,
} from './editor_api_snap.js';
import { CommandTransformPositionSet } from '@/transform/commands/command_transform_position_set.js';
import { failResult, okResult } from './editor_api_result.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

/** Align and dry-run transform helpers for snap-aware placement. */
export class EditorApiAlign {
  private readonly host: EditorApiHost;

  /**
   * Creates align helpers.
   *
   * @param host Injected editor systems.
   */
  constructor(host: EditorApiHost) {
    this.host = host;
  }

  /**
   * Moves brushId so it sits on/against targetBrushId (top, bottom, or side).
   *
   * @param args Align arguments.
   * @returns Applied local position and world bounds.
   */
  alignBrush(args: AlignBrushArgs): McpToolResult {
    const moving = findBrush(this.host.worldObject, args.brushId);
    const target = findBrush(this.host.worldObject, args.targetBrushId);
    if (!moving?.brush.mesh) return failResult(`Brush not found: ${args.brushId}`);
    if (!target) return failResult(`Target brush not found: ${args.targetBrushId}`);
    const movingBox = computeBrushWorldBounds(moving.model, moving.brush);
    const targetBox = computeBrushWorldBounds(target.model, target.brush);
    if (movingBox.isEmpty() || targetBox.isEmpty()) return failResult('Brush has empty bounds');
    const gap = typeof args.gap === 'number' ? args.gap : 0;
    const center = args.center !== false;
    const nextWorldCenter = this.computeAlignedCenter(movingBox, targetBox, args.mode, gap, center, args);
    if (!nextWorldCenter) return failResult(alignModeHelp());
    return this.applyWorldCenter(moving, nextWorldCenter, shouldApplySnap(args));
  }

  /**
   * Predicts world bounds after a proposed transform without committing.
   *
   * @param args Proposed TRS fields.
   * @returns Predicted bounds, size, center.
   */
  previewTransform(args: PreviewTransformArgs): McpToolResult {
    const found = findBrush(this.host.worldObject, args.brushId);
    if (!found) return failResult(`Brush not found: ${args.brushId}`);
    found.brush.pullTransformFromMesh();
    const pose = this.resolvePreviewPose(found.brush, args);
    const predicted = predictWorldBounds(found.model, found.brush, pose.position, pose.rotation, pose.scale);
    return okResult('Preview transform (not applied)', this.buildPreviewPayload(args.brushId, pose, predicted));
  }

  /**
   * Resolves proposed TRS for a dry-run from args and current brush pose.
   *
   * @param brush Brush instance.
   * @param args Preview args.
   * @returns Resolved local pose.
   */
  private resolvePreviewPose(brush: SolidBrushInstance, args: PreviewTransformArgs) {
    const useSnap = shouldApplySnap(args);
    const position = resolveSnappedPosition(this.host, args.position, brush.position, useSnap);
    const hasRotation = Boolean(args.rotationDegrees);
    const rotation = hasRotation
      ? snapEulerWhenRequested(this.host, resolveEulerFromArgs(args.rotationDegrees), useSnap)
      : brush.rotation.clone();
    const scale = resolveSnappedScale(this.host, args.scale, brush.scale, useSnap);
    return { position, rotation, scale };
  }

  /**
   * Builds the brush_transform_preview response payload.
   *
   * @param brushId Brush id.
   * @param pose Resolved pose.
   * @param predicted Predicted world box.
   * @returns Payload object.
   */
  private buildPreviewPayload(
    brushId: string,
    pose: { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 },
    predicted: THREE.Box3,
  ) {
    const size = predicted.getSize(new THREE.Vector3());
    const center = predicted.getCenter(new THREE.Vector3());
    return {
      brushId,
      position: vec3ToDto(pose.position),
      rotationDegrees: {
        x: THREE.MathUtils.radToDeg(pose.rotation.x),
        y: THREE.MathUtils.radToDeg(pose.rotation.y),
        z: THREE.MathUtils.radToDeg(pose.rotation.z),
      },
      scale: vec3ToDto(pose.scale),
      worldBounds: boxToDto(predicted),
      size: vec3ToDto(size),
      center: vec3ToDto(center),
      applied: false,
    };
  }

  /**
   * Computes the desired world center for an aligned brush.
   *
   * @param moving Current moving AABB.
   * @param target Target AABB.
   * @param mode Align mode.
   * @param gap Face gap.
   * @param center Whether to center free axes.
   * @param args Full align args (axis/direction).
   * @returns New world center or null when args invalid.
   */
  private computeAlignedCenter(
    moving: THREE.Box3,
    target: THREE.Box3,
    mode: AlignBrushArgs['mode'],
    gap: number,
    center: boolean,
    args: AlignBrushArgs,
  ): THREE.Vector3 | null {
    const movingSize = moving.getSize(new THREE.Vector3());
    const movingCenter = moving.getCenter(new THREE.Vector3());
    const targetCenter = target.getCenter(new THREE.Vector3());
    const next = movingCenter.clone();
    if (center) {
      next.x = targetCenter.x;
      next.z = targetCenter.z;
    }
    if (mode === 'top') {
      next.y = target.max.y + gap + movingSize.y * 0.5;
      return next;
    }
    if (mode === 'bottom') {
      next.y = target.min.y - gap - movingSize.y * 0.5;
      return next;
    }
    if (mode === 'side') return this.alignSideCenter(next, target, movingSize, gap, center, args);
    return null;
  }

  /**
   * Side-mode center: touch target on +x/-x/+z/-z.
   *
   * @param next Working center (may already be centered).
   * @param target Target AABB.
   * @param movingSize Moving size.
   * @param gap Face gap.
   * @param center Free-axis centering.
   * @param args Align args.
   * @returns Center or null.
   */
  private alignSideCenter(
    next: THREE.Vector3,
    target: THREE.Box3,
    movingSize: THREE.Vector3,
    gap: number,
    center: boolean,
    args: AlignBrushArgs,
  ): THREE.Vector3 | null {
    const axis = args.axis ?? 'x';
    const direction = args.direction === -1 ? -1 : 1;
    if (center) next.y = target.getCenter(new THREE.Vector3()).y;
    if (axis === 'x') {
      next.x = direction > 0 ? target.max.x + gap + movingSize.x * 0.5 : target.min.x - gap - movingSize.x * 0.5;
      return next;
    }
    next.z = direction > 0 ? target.max.z + gap + movingSize.z * 0.5 : target.min.z - gap - movingSize.z * 0.5;
    return next;
  }

  /**
   * Moves a brush so its world AABB center becomes nextWorldCenter.
   *
   * @param found Brush lookup.
   * @param nextWorldCenter Desired world center.
   * @param useSnap Whether to snap final local position.
   * @returns Tool result.
   */
  private applyWorldCenter(
    found: { model: SolidModel; brush: SolidBrushInstance },
    nextWorldCenter: THREE.Vector3,
    useSnap: boolean,
  ): McpToolResult {
    const mesh = found.brush.mesh!;
    const currentBox = computeBrushWorldBounds(found.model, found.brush);
    const currentCenter = currentBox.getCenter(new THREE.Vector3());
    const worldDelta = nextWorldCenter.clone().sub(currentCenter);
    const nextLocal = mesh.position.clone().add(this.worldDeltaToLocal(mesh, worldDelta));
    if (useSnap) this.host.gridSnap.snapVector3(nextLocal);
    this.host.commandStack.push(new CommandTransformPositionSet([mesh], [nextLocal]));
    found.brush.pullTransformFromMesh();
    this.host.solidModelController.onTransformsCommitted([mesh]);
    this.host.refreshAfterWorldMutation();
    this.host.refreshOutliner();
    this.host.showStatus(`Aligned ${found.brush.name}`);
    const bounds = boxToDto(computeBrushWorldBounds(found.model, found.brush));
    return okResult(`Aligned ${found.brush.name}`, {
      brushId: found.brush.id,
      position: vec3ToDto(mesh.position),
      worldBounds: bounds,
    });
  }

  /**
   * Converts a world-space translation into mesh parent-local delta.
   *
   * @param mesh Brush mesh.
   * @param worldDelta World translation.
   * @returns Local translation delta.
   */
  private worldDeltaToLocal(mesh: THREE.Mesh, worldDelta: THREE.Vector3): THREE.Vector3 {
    const parent = mesh.parent;
    if (!parent) return worldDelta.clone();
    parent.updateMatrixWorld(true);
    const origin = new THREE.Vector3();
    const offset = worldDelta.clone();
    parent.worldToLocal(origin);
    parent.worldToLocal(offset);
    return offset.sub(origin);
  }
}

/**
 * Predicts world AABB for a brush with a hypothetical local TRS.
 *
 * @param model Owning model.
 * @param brush Brush instance.
 * @param position Local position.
 * @param rotation Local rotation.
 * @param scale Local scale.
 * @returns Predicted world box.
 */
export function predictWorldBounds(
  model: SolidModel,
  brush: SolidBrushInstance,
  position: THREE.Vector3,
  rotation: THREE.Euler,
  scale: THREE.Vector3,
): THREE.Box3 {
  model.root.updateMatrixWorld(true);
  const localBounds = brush.brush.computeLocalBounds();
  if (localBounds.isEmpty()) return new THREE.Box3();
  const quaternion = new THREE.Quaternion().setFromEuler(rotation);
  const localMatrix = new THREE.Matrix4().compose(position, quaternion, scale);
  const worldMatrix = new THREE.Matrix4().multiplyMatrices(model.root.matrixWorld, localMatrix);
  return localBounds.clone().applyMatrix4(worldMatrix);
}

/**
 * Help text for invalid align mode args.
 *
 * @returns Error message.
 */
function alignModeHelp(): string {
  return 'mode must be "top", "bottom", or "side" (side needs axis x|z and optional direction 1|-1)';
}
