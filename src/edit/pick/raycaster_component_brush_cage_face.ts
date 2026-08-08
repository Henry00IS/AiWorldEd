import * as THREE from 'three';
import type { BrushEditCage } from '@/edit/brush/brush_edit_cage.js';
import {
  pickComponentFaceLoops,
  type ComponentFaceLoopPickResult,
  type ComponentFaceLoopTarget,
} from '@/edit/pick/raycaster_component_face_loops.js';

/** Result of a brush cage face pick in Edit Mode. */
export type ComponentBrushCageFacePickResult = ComponentFaceLoopPickResult;

/**
 * Picks the closest front-facing brush cage face under the pointer.
 *
 * @param event Pointer event.
 * @param camera Active camera.
 * @param pickElement Element used for NDC conversion.
 * @param cages Domain brush cages.
 * @returns Closest face pick, or null.
 */
export function pickComponentBrushCageFace(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  cages: readonly BrushEditCage[],
): ComponentBrushCageFacePickResult | null {
  return pickComponentFaceLoops(event, camera, pickElement, buildBrushCageFaceLoopTargets(cages));
}

/**
 * Builds face-loop targets from brush edit cages.
 *
 * @param cages Domain brush cages.
 * @returns Face-loop targets for pick.
 */
function buildBrushCageFaceLoopTargets(cages: readonly BrushEditCage[]): ComponentFaceLoopTarget[] {
  const targets: ComponentFaceLoopTarget[] = [];
  for (const cage of cages) {
    targets.push(buildOneBrushCageFaceLoopTarget(cage));
  }
  return targets;
}

/**
 * Builds one face-loop target from a brush cage.
 *
 * @param cage Brush cage.
 * @returns Face-loop target.
 */
function buildOneBrushCageFaceLoopTarget(cage: BrushEditCage): ComponentFaceLoopTarget {
  return {
    targetId: cage.targetId,
    faces: cage.faces.map((face) => ({
      faceIndex: face.faceIndex,
      worldLoop: face.vertexIndices
        .map((vertexIndex) => cage.worldPositions[vertexIndex])
        .filter((point): point is THREE.Vector3 => !!point),
    })),
  };
}
