import * as THREE from 'three';
import { solidHullBrushFromPoints } from '@/solid/algorithm/surface/solid_hull_brush.js';
import { getActiveThemeViewportPalette } from '@/viewports/theme/theme_viewport_palette.js';
import {
  generatorRhombicuboctahedronDirections,
  generatorRhombicuboctahedronExtent,
  generatorRhombicuboctahedronPoints,
  type GeneratorRhombicuboctahedronDirection,
} from '@/generator/rhombicuboctahedron/generator_rhombicuboctahedron.js';

/** Metres one corner unit of the shape spans in the picker. */
const SOLID_SCRIPT_NORMAL_PICK_SCALE = 0.5;

/** How much darker a face that points against an axis is drawn. */
const SOLID_SCRIPT_NORMAL_PICK_SHADE_NEGATIVE = 0.4;

/** One face of the picker's shape. */
export interface SolidScriptNormalPickFace {
  /** The direction the face points, with its text. */
  readonly direction: GeneratorRhombicuboctahedronDirection;
  /** Corners in order around the face, seen from outside. */
  readonly loop: readonly THREE.Vector3[];
  /** Fill colour, from the axes the face points along. */
  readonly color: THREE.Color;
}

/**
 * Returns where the shape's middle sits, so the shape stands on the grid.
 *
 * @returns Middle in metres.
 */
export function solidScriptNormalPickMiddle(): THREE.Vector3 {
  return new THREE.Vector3(0, generatorRhombicuboctahedronExtent('Grid Aligned') * SOLID_SCRIPT_NORMAL_PICK_SCALE, 0);
}

/**
 * Builds the 26 faces of the Grid Aligned shape standing on the grid, each with
 * the direction it points and its colour.
 *
 * @returns Faces.
 */
export function solidScriptNormalPickFaces(): SolidScriptNormalPickFace[] {
  const middle = solidScriptNormalPickMiddle();
  const points = generatorRhombicuboctahedronPoints('Grid Aligned').map((point) =>
    point.multiplyScalar(SOLID_SCRIPT_NORMAL_PICK_SCALE).add(middle),
  );
  const brush = solidHullBrushFromPoints(points);
  if (!brush) return [];
  const directions = generatorRhombicuboctahedronDirections();
  return brush.faces.flatMap((face, index) => {
    const normal = brush.planes[index]?.normal;
    const direction = normal ? solidScriptNormalPickClosest(directions, normal) : undefined;
    if (!direction) return [];
    const loop = brush.getFaceVertexIndices(face).flatMap((corner) => brush.vertices[corner]?.clone() ?? []);
    return [{ direction, loop, color: solidScriptNormalPickColor(direction) }];
  });
}

/**
 * Finds the direction closest to a normal.
 *
 * @param directions Directions.
 * @param normal Unit normal.
 * @returns Closest direction.
 */
function solidScriptNormalPickClosest(
  directions: readonly GeneratorRhombicuboctahedronDirection[],
  normal: THREE.Vector3,
): GeneratorRhombicuboctahedronDirection | undefined {
  let best: GeneratorRhombicuboctahedronDirection | undefined;
  for (const direction of directions) if (!best || direction.unit.dot(normal) > best.unit.dot(normal)) best = direction;
  return best;
}

/**
 * Mixes the axis colours of the axes a direction points along, darker for each
 * axis it points against.
 *
 * @param direction Direction.
 * @returns Colour.
 */
function solidScriptNormalPickColor(direction: GeneratorRhombicuboctahedronDirection): THREE.Color {
  const palette = getActiveThemeViewportPalette();
  const axes = [palette.widgetXAxisColor, palette.widgetYAxisColor, palette.widgetZAxisColor];
  const color = new THREE.Color(0, 0, 0);
  direction.readable.forEach((value, axis) => {
    if (value !== 0) color.add(new THREE.Color(axes[axis] ?? 0).multiplyScalar(1 / direction.axes));
  });
  const against = direction.readable.filter((value) => value < 0).length / direction.axes;
  return color.multiplyScalar(1 - SOLID_SCRIPT_NORMAL_PICK_SHADE_NEGATIVE * against);
}

/**
 * Writes a direction the way a direction field reads it: -1, 0 or 1 per axis,
 * such as 1, 1, 0, since every direction field turns its value into a unit
 * direction.
 *
 * @param direction Direction.
 * @returns Field text.
 */
export function solidScriptNormalPickText(direction: GeneratorRhombicuboctahedronDirection): string {
  return direction.readable.join(', ');
}
