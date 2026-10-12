import * as THREE from 'three';
import { TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON } from '@/edit/topology/topology_epsilon.js';
import { projectLoopCutParameterAlongScreenEdge } from './edit_loop_cut_slide_screen.js';

/** Locked seed edge for a loop-cut slide session. */
export interface LoopCutLockedSeed {
  /** Domain target id. */
  targetId: string;
  /** First endpoint index. */
  vertexA: number;
  /** Second endpoint index. */
  vertexB: number;
  /** World-space start. */
  worldA: THREE.Vector3;
  /** World-space end. */
  worldB: THREE.Vector3;
}

/**
 * Projects the pointer onto a locked world edge by snapping to that edge's
 * screen line, then solving the camera ray against the 3D segment.
 *
 * @param event Pointer event.
 * @param camera Active camera.
 * @param pickElement Pick element.
 * @param worldA Edge start.
 * @param worldB Edge end.
 * @returns Clamped interior parameter, or null when the edge cannot be
 *   projected.
 */
export function projectLoopCutParameterOnLockedEdge(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
): number | null {
  return projectLoopCutParameterAlongScreenEdge(event, camera, pickElement, worldA, worldB);
}

/**
 * Returns the parameter of a point along a segment.
 *
 * @param worldA Segment start.
 * @param worldB Segment end.
 * @param point Query point.
 * @returns Unclamped parameter.
 */
export function parameterOfPointOnSegment(worldA: THREE.Vector3, worldB: THREE.Vector3, point: THREE.Vector3): number {
  const span = worldB.clone().sub(worldA);
  const lengthSq = span.lengthSq();
  if (lengthSq < 1e-12) {
    return 0.5;
  }
  return point.clone().sub(worldA).dot(span) / lengthSq;
}

/**
 * Clamps a cut parameter away from the endpoints.
 *
 * @param parameter Raw parameter.
 * @returns Interior parameter.
 */
export function clampLoopCutParameter(parameter: number): number {
  if (parameter < TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON) {
    return TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON;
  }
  if (parameter > 1 - TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON) {
    return 1 - TOPOLOGY_EDGE_SPLIT_PARAMETER_EPSILON;
  }
  return parameter;
}
