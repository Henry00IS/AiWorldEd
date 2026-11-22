import * as THREE from 'three';
import { solidScriptSolidEdited } from './solid_script_solid_validate.js';
import {
  SOLID_SCRIPT_GEOMETRY_EPSILON,
  type SolidScriptFaceFacts,
  type SolidScriptGeometryLeaf,
} from '@/solid_script/language/solid_script_geometry.js';

/**
 * How one face is scaled: by Factor about Center, in every direction or, when
 * Axis is given, only along it.
 */
export interface SolidScriptScaleFaceHow {
  factor: number;
  center: THREE.Vector3;
  axis: THREE.Vector3 | null;
}

/** One face or edge to scale: its corners and how. */
export interface SolidScriptScaleElement {
  corners: readonly THREE.Vector3[];
  how: SolidScriptScaleFaceHow;
}

/**
 * Scales the faces of a brush or mesh. Faces that share corners scale as one
 * island, by the average of their Factors about the average of their Centers. A
 * brush stays a brush, convex or not until the output is checked; a mesh stays
 * a mesh.
 *
 * @param leaf Brush or mesh.
 * @param faces Faces of that leaf to scale.
 * @param howOf How each face is scaled.
 * @param label Command, for messages.
 * @returns Updated leaf.
 */
export function solidScriptScaleFaces(
  leaf: SolidScriptGeometryLeaf,
  faces: readonly SolidScriptFaceFacts[],
  howOf: (face: SolidScriptFaceFacts) => SolidScriptScaleFaceHow,
  label: string,
): SolidScriptGeometryLeaf {
  return solidScriptScaleElements(
    leaf,
    faces.map((face) => ({ corners: face.corners, how: howOf(face) })),
    label,
  );
}

/**
 * Scales faces or edges of a brush or mesh, joined ones as one island.
 *
 * @param leaf Brush or mesh.
 * @param elements Faces or edges with how each is scaled.
 * @param label Command, for messages.
 * @returns Updated leaf.
 */
export function solidScriptScaleElements(
  leaf: SolidScriptGeometryLeaf,
  elements: readonly SolidScriptScaleElement[],
  label: string,
): SolidScriptGeometryLeaf {
  for (const { how } of elements)
    if (!Number.isFinite(how.factor)) throw new Error(`${label} needs a Factor, such as 1 or 0.5, not ${how.factor}`);
  const islands = solidScriptScaleIslands(elements);
  const points = leaf.points.map((point) => {
    const island = islands.find((entry) => entry.corners.some((corner) => solidScriptScaleSame(corner, point)));
    return island ? solidScriptScaleFaceMove(point, island.how) : point.clone();
  });
  return leaf.kind === 'solid' ? solidScriptSolidEdited(leaf, points) : { ...leaf, points };
}

/**
 * Joins elements that share a corner into islands, each with the average of its
 * elements' Factors, Centers and Axes.
 *
 * @param elements Faces or edges with how each is scaled.
 * @returns Islands with their corners and how.
 */
function solidScriptScaleIslands(elements: readonly SolidScriptScaleElement[]): SolidScriptScaleElement[] {
  const owner = elements.map((_, index) => index);
  const root = (index: number): number => {
    const above = owner[index] ?? index;
    return above === index ? index : (owner[index] = root(above));
  };
  elements.forEach((element, index) =>
    elements.slice(0, index).forEach((other, at) => {
      if (element.corners.some((corner) => other.corners.some((point) => solidScriptScaleSame(corner, point))))
        owner[root(index)] = root(at);
    }),
  );
  const groups = new Map<number, SolidScriptScaleElement[]>();
  elements.forEach((element, index) => groups.set(root(index), [...(groups.get(root(index)) ?? []), element]));
  return [...groups.values()].map(solidScriptScaleIslandOf);
}

/**
 * Averages the elements of one island.
 *
 * @param members Elements of the island.
 * @returns The island's corners and how.
 */
function solidScriptScaleIslandOf(members: readonly SolidScriptScaleElement[]): SolidScriptScaleElement {
  const average = (vectors: THREE.Vector3[]): THREE.Vector3 =>
    vectors.reduce((sum, vector) => sum.add(vector), new THREE.Vector3()).divideScalar(vectors.length);
  const axes = members.flatMap(({ how }) => (how.axis ? [how.axis] : []));
  return {
    corners: members.flatMap((member) => member.corners),
    how: {
      factor: members.reduce((sum, { how }) => sum + how.factor, 0) / members.length,
      center: average(members.map(({ how }) => how.center)),
      axis: axes.length === members.length ? average(axes).normalize() : null,
    },
  };
}

/**
 * Tells whether two corners are the same point.
 *
 * @param a First corner.
 * @param b Second corner.
 * @returns True when they touch.
 */
function solidScriptScaleSame(a: THREE.Vector3, b: THREE.Vector3): boolean {
  return a.distanceTo(b) <= SOLID_SCRIPT_GEOMETRY_EPSILON;
}

/**
 * Scales one point by Factor about Center, only along Axis when one is given.
 *
 * @param point Point.
 * @param how Factor, Center and Axis.
 * @returns Scaled point.
 */
function solidScriptScaleFaceMove(point: THREE.Vector3, how: SolidScriptScaleFaceHow): THREE.Vector3 {
  const offset = point.clone().sub(how.center);
  if (!how.axis) return how.center.clone().addScaledVector(offset, how.factor);
  return point.clone().addScaledVector(how.axis, offset.dot(how.axis) * (how.factor - 1));
}
