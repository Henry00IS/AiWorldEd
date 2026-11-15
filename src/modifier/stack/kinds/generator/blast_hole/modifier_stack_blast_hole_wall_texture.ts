import * as THREE from 'three';
import type { ModifierStackActionTarget, ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackPatch } from '@/modifier/stack/modifier_stack_operations.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';

/** A wall brush face the Blast Hole box sits in. */
export interface BlastHoleWallFace {
  /** Texture of the face. */
  textureId: string;
  /** Id of the brush it belongs to. */
  brushId: string;
}

/**
 * Finds the texture of the wall a Blast Hole box sits in: of the visible
 * additive brushes whose bounds hold the box centre, the one sharing the most
 * volume with the box, and of its faces the one facing most along the box's
 * front or back.
 *
 * @param node Blast Hole node.
 * @returns Wall face, or null when the box sits in no brush.
 */
export function blastHoleWallFace(node: THREE.Object3D): BlastHoleWallFace | null {
  node.updateWorldMatrix(true, false);
  const nodeBox = new THREE.Box3().setFromObject(node);
  const center = node.getWorldPosition(new THREE.Vector3());
  const front = new THREE.Vector3(0, 0, 1).transformDirection(node.matrixWorld);
  let best: { face: BlastHoleWallFace; overlap: number } | null = null;
  for (const model of blastHoleModelsAround(node)) {
    for (const brush of model.getBrushes()) {
      if (!brush.visible || brush.operation !== SolidOperation.Additive) continue;
      const solid = brush.getModelSpaceBrush();
      const toWorld = model.root.matrixWorld;
      const bounds = new THREE.Box3().setFromPoints(
        solid.vertices.map((vertex) => vertex.clone().applyMatrix4(toWorld)),
      );
      if (!bounds.clone().expandByScalar(1e-3).containsPoint(center)) continue;
      const shared = bounds.clone().intersect(nodeBox).getSize(new THREE.Vector3());
      const overlap = shared.x * shared.y * shared.z;
      if (best && overlap <= best.overlap) continue;
      let facing = -1;
      let surfaceIndex = -1;
      solid.faces.forEach((face, index) => {
        const plane = solid.planes[index];
        if (!plane) return;
        const along = Math.abs(plane.normal.clone().transformDirection(toWorld).dot(front));
        if (along > facing) [facing, surfaceIndex] = [along, face.surfaceIndex];
      });
      if (surfaceIndex < 0) continue;
      best = { face: { textureId: brush.getFaceSurface(surfaceIndex).textureId, brushId: brush.id }, overlap };
    }
  }
  return best?.face ?? null;
}

/**
 * Lists the solid models in the scene the node belongs to.
 *
 * @param node Scene node.
 * @returns Solid models.
 */
function blastHoleModelsAround(node: THREE.Object3D): SolidModel[] {
  let root = node;
  while (root.parent) root = root.parent;
  return [...SolidModelRegistry.collectUnder(root)];
}

/**
 * Sets the Blast Hole texture to the texture of the wall it sits in, as one
 * undoable stack edit that syncs like any other parameter change.
 *
 * @param target Action target.
 */
export function blastHoleUseWallTexture(target: ModifierStackActionTarget): void {
  const wall = blastHoleWallFace(target.volume);
  if (!wall) return target.status('The box sits in no wall brush.');
  if (!ModifierVolume.isVolume(target.volume)) return target.status('Only a Blast Hole node can pick a wall texture.');
  const before = ModifierVolume.read(target.volume);
  const entry = before.modifiers.find((candidate) => candidate.id === target.stepId);
  if (!entry) return;
  const after = modifierStackPatch(before, target.stepId, {
    parameters: { ...entry.parameters, texture: wall.textureId },
  });
  const command = new CommandModifierStackSet(target.volume, before, after);
  if (target.commandStack) target.commandStack.push(command);
  else command.execute();
  target.status(wall.textureId ? 'Using the wall texture.' : 'The wall uses the default texture.');
  target.refresh?.();
}

/** Inspector button that copies the wall's texture onto the Blast Hole. */
export const BLAST_HOLE_WALL_TEXTURE_FIELD: ModifierStackField = {
  key: 'useWallTexture',
  label: 'Use Wall Texture',
  type: 'action',
  default: '',
  group: 'Texture',
  hint: 'Sets Texture to the texture of the wall the box sits in, so the filled-back pieces match it.',
  action: blastHoleUseWallTexture,
};
