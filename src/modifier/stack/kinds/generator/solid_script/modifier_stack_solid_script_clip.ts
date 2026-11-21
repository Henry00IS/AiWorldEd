import * as THREE from 'three';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { modifierStackReshapeClip } from '@/modifier/stack/evaluate/modifier_stack_reshape.js';
import type { ModifierStackSolidScriptPassed } from './modifier_stack_solid_script_layout.js';

/**
 * Clips received units with the script-space plane Input Objects recorded after
 * Clip, or returns the units unchanged when no pass has a plane.
 *
 * @param units Received units.
 * @param passes Input Objects passes, first received brush of each.
 * @param frame Frame-to-world matrix.
 * @param origin Script origin in frame coordinates (the received centre).
 * @param context Evaluation context.
 * @returns Kept units.
 */
export function modifierStackSolidScriptClipUnits(
  units: readonly ModifierStackUnit[],
  passes: readonly ModifierStackSolidScriptPassed[],
  frame: THREE.Matrix4,
  origin: THREE.Vector3,
  context: ModifierStackContext,
): ModifierStackUnit[] {
  const clip = passes.map((pass) => pass.clip).find((plane) => plane);
  if (!clip) return [...units];
  const plane = modifierStackSolidScriptModelPlane(clip, frame, origin, context.solidRoot);
  return units.flatMap((unit) => modifierStackSolidScriptClipUnit(unit, plane, context));
}

/**
 * Converts a script-space clip plane to model coordinates. The host keeps the
 * side opposite the script Normal, matching Clip.
 *
 * @param clip Script-space plane: Normal · p = constant, the Normal faces the
 *   dropped side.
 * @param frame Frame-to-world matrix.
 * @param origin Script origin in frame coordinates.
 * @param solidRoot Solid root.
 * @returns Model-space plane whose positive side is kept.
 */
function modifierStackSolidScriptModelPlane(
  clip: { normal: readonly [number, number, number]; constant: number },
  frame: THREE.Matrix4,
  origin: THREE.Vector3,
  solidRoot: THREE.Object3D,
): THREE.Plane {
  const dropped = new THREE.Vector3(...clip.normal);
  const framePlane = new THREE.Plane(dropped.clone().negate(), clip.constant + dropped.dot(origin));
  return framePlane.applyMatrix4(frame).applyMatrix4(solidRoot.matrixWorld.clone().invert());
}

/**
 * Clips one unit; wholly dropped authored brushes leave the CSG.
 *
 * @param unit Unit.
 * @param plane Model-space plane, positive side kept.
 * @param context Evaluation context.
 * @returns The unit with clipped brushes, or none when every brush was dropped.
 */
function modifierStackSolidScriptClipUnit(
  unit: ModifierStackUnit,
  plane: THREE.Plane,
  context: ModifierStackContext,
): ModifierStackUnit[] {
  const brushes = unit.brushes.flatMap((brush) => {
    const cut = modifierStackReshapeClip(brush, plane);
    if (!cut && unit.authored) context.records.hiddenAdd(brush.id);
    return cut ? [cut] : [];
  });
  return brushes.length > 0 ? [{ ...unit, brushes, reshaped: unit.authored || unit.reshaped }] : [];
}
