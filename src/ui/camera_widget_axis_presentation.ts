import * as THREE from 'three';
import {
  CoordinateSpaceAdapter,
  axisDirectionToVector,
  type CoordinateAxis,
} from '../coordinates/coordinate_space_adapter.js';
import type { AxisDirection, CoordinateSpaceDefinition } from '../settings/coordinate_space_types.js';
import { Theme } from '../theme.js';

/** Semantic directions presented by the viewport orientation widget. */
export type CameraWidgetAxisRole = 'right' | 'up' | 'forward';

/** Resolved presentation for one semantic coordinate direction. */
export interface CameraWidgetAxisPresentation {
  role: CameraWidgetAxisRole;
  axis: CoordinateAxis;
  signedAxis: AxisDirection;
  editorDirection: THREE.Vector3;
  color: number;
}

/**
 * Resolves the active profile into Right, Up, and Forward widget axes.
 *
 * @param space Active profile coordinate space.
 * @returns Semantic axis presentations in stable display order.
 */
export function resolveCameraWidgetAxisPresentations(space: CoordinateSpaceDefinition): CameraWidgetAxisPresentation[] {
  const adapter = new CoordinateSpaceAdapter(space);
  return [
    resolveAxisPresentation(adapter, 'right', space.right),
    resolveAxisPresentation(adapter, 'up', space.up),
    resolveAxisPresentation(adapter, 'forward', space.forward),
  ];
}

/**
 * Resolves one semantic role into its editor direction and display style.
 *
 * @param adapter Active coordinate adapter.
 * @param role Semantic profile role.
 * @param signedAxis Signed profile axis.
 * @returns Complete axis presentation.
 */
function resolveAxisPresentation(
  adapter: CoordinateSpaceAdapter,
  role: CameraWidgetAxisRole,
  signedAxis: AxisDirection,
): CameraWidgetAxisPresentation {
  const axis = coordinateAxisForDirection(signedAxis);
  const editorDirection = adapter.toEditorDirection(axisDirectionToVector(signedAxis));
  return { role, axis, signedAxis, editorDirection, color: colorForCoordinateAxis(axis) };
}

/**
 * Extracts an unsigned coordinate letter from a signed direction.
 *
 * @param direction Signed coordinate direction.
 * @returns Unsigned coordinate axis.
 */
export function coordinateAxisForDirection(direction: AxisDirection): CoordinateAxis {
  return direction.slice(1) as CoordinateAxis;
}

/**
 * Returns the conventional viewport color for a coordinate letter.
 *
 * @param axis Coordinate axis.
 * @returns Theme color expressed as a hexadecimal number.
 */
export function colorForCoordinateAxis(axis: CoordinateAxis): number {
  if (axis === 'x') return Theme.widgetXAxisColor;
  if (axis === 'y') return Theme.widgetYAxisColor;
  return Theme.widgetZAxisColor;
}
