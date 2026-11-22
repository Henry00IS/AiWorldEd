import * as THREE from 'three';
import { CsgBooleanOps, CsgOperation } from '@/csg/csg_boolean_ops.js';
import { CsgPolygon } from '@/csg/csg_polygon.js';
import { solidScriptShapeMeshes, type SolidScriptShapeMesh, type SolidScriptUv } from './solid_script_mesh.js';
import type { SolidScriptShape } from './solid_script_shape.js';

/** Shared mesh boolean engine of the editor. */
const SOLID_SCRIPT_MESH_MODES_CSG = new CsgBooleanOps();

/** Corners closer than this, in metres, are joined into one after a cut. */
const SOLID_SCRIPT_MESH_MODES_WELD = 1e-5;

/**
 * Turns the faces of a mesh into polygons for the boolean engine.
 *
 * @param mesh Mesh.
 * @returns Polygons with an area.
 */
function solidScriptMeshModesPolygons(mesh: SolidScriptShapeMesh): CsgPolygon[] {
  return mesh.faces.flatMap((loop, face) => {
    const corners = loop.map((index) => mesh.points[index] ?? new THREE.Vector3());
    return corners.length >= 3 ? [new CsgPolygon(corners, null, mesh.uvs[face] ?? null)] : [];
  });
}

/**
 * Builds a mesh from polygons the boolean engine gave, sharing corners at the
 * same place, keeping the texture coordinates the faces carried.
 *
 * @param polygons Polygons.
 * @param like Mesh whose label, texture and tags it keeps.
 * @returns Mesh, or null when nothing is left.
 */
function solidScriptMeshModesMesh(
  polygons: readonly CsgPolygon[],
  like: SolidScriptShapeMesh,
): SolidScriptShapeMesh | null {
  if (polygons.length === 0) return null;
  const points: THREE.Vector3[] = [];
  const known = new Map<string, number>();
  const placeOf = (at: THREE.Vector3): number => {
    const key = at
      .toArray()
      .map((value) => Math.round(value / SOLID_SCRIPT_MESH_MODES_WELD))
      .join(',');
    const found = known.get(key) ?? points.push(at.clone()) - 1;
    known.set(key, found);
    return found;
  };
  const faces = polygons.map((polygon) => polygon.getVertices().map(placeOf));
  const uvs = polygons.map((polygon) => polygon.getUvs()?.map(([u, v]): SolidScriptUv => [u, v]) ?? null);
  const made: SolidScriptShapeMesh = { ...like, points, faces, uvs };
  delete made.mode;
  delete made.uvCarry;
  return made;
}

/**
 * Cuts one closed mesh with another through the editor's boolean engine.
 *
 * @param mesh Mesh that is kept or cut.
 * @param cutter Mesh that cuts.
 * @param operation Subtract or intersect.
 * @returns What is left, or null when nothing is.
 */
function solidScriptMeshModesCut(
  mesh: SolidScriptShapeMesh,
  cutter: SolidScriptShapeMesh,
  operation: CsgOperation,
): SolidScriptShapeMesh | null {
  const kept = solidScriptMeshModesPolygons(mesh);
  const cuts = solidScriptMeshModesPolygons(cutter);
  if (kept.length === 0 || cuts.length === 0) return operation === CsgOperation.SUBTRACT ? mesh : null;
  return solidScriptMeshModesMesh(SOLID_SCRIPT_MESH_MODES_CSG.operatePolygons(kept, cuts, operation), mesh);
}

/** The meshes one shape gives and how they combine with the meshes before it. */
interface SolidScriptMeshModesPart {
  meshes: SolidScriptShapeMesh[];
  mode: 'Subtractive' | 'Intersecting' | undefined;
}

/**
 * Reads what one shape adds to the meshes of its level.
 *
 * @param shape Shape.
 * @returns Its meshes and their Mode.
 */
function solidScriptMeshModesPart(shape: SolidScriptShape): SolidScriptMeshModesPart {
  if (shape.kind === 'mesh') return { meshes: [shape], mode: solidScriptMeshModesCutting(shape.mode) };
  if (shape.kind === 'group')
    return { meshes: solidScriptMeshModesLevel(shape.children), mode: solidScriptMeshModesCutting(shape.mode) };
  if (shape.kind === 'boolean') return { meshes: solidScriptMeshModesLevel(shape.children), mode: undefined };
  return { meshes: [], mode: undefined };
}

/**
 * Keeps a Mode only when it cuts.
 *
 * @param mode Mode as set.
 * @returns Subtractive, Intersecting or nothing.
 */
function solidScriptMeshModesCutting(mode: string | undefined): SolidScriptMeshModesPart['mode'] {
  return mode === 'Subtractive' || mode === 'Intersecting' ? mode : undefined;
}

/**
 * Combines the meshes of one level in order: a Subtractive mesh cuts itself out
 * of the meshes before it, an Intersecting one keeps only where they overlap
 * it, and either is then gone, like a solid with that Mode.
 *
 * @param shapes Shapes of the level, in order.
 * @returns Meshes left.
 */
function solidScriptMeshModesLevel(shapes: readonly SolidScriptShape[]): SolidScriptShapeMesh[] {
  let kept: SolidScriptShapeMesh[] = [];
  for (const shape of shapes) {
    const { meshes, mode } = solidScriptMeshModesPart(shape);
    if (mode === 'Subtractive')
      kept = kept.flatMap((mesh) =>
        meshes.reduce<SolidScriptShapeMesh[]>(
          (left, cutter) => left.flatMap((part) => solidScriptMeshModesCut(part, cutter, CsgOperation.SUBTRACT) ?? []),
          [mesh],
        ),
      );
    else if (mode === 'Intersecting')
      kept = kept.flatMap((mesh) =>
        meshes.flatMap((cutter) => solidScriptMeshModesCut(mesh, cutter, CsgOperation.INTERSECT) ?? []),
      );
    else kept.push(...meshes);
  }
  return kept;
}

/**
 * Whether any mesh or group holding meshes in a shape tree cuts.
 *
 * @param shapes Shapes.
 * @returns True when one has Mode Subtractive or Intersecting.
 */
function solidScriptMeshModesAny(shapes: readonly SolidScriptShape[]): boolean {
  return shapes.some((shape) => {
    if (shape.kind === 'mesh') return solidScriptMeshModesCutting(shape.mode) !== undefined;
    if (shape.kind !== 'group' && shape.kind !== 'boolean') return false;
    const cuts = shape.kind === 'group' && solidScriptMeshModesCutting(shape.mode) !== undefined;
    return (cuts && solidScriptShapeMeshes(shape.children).length > 0) || solidScriptMeshModesAny(shape.children);
  });
}

/**
 * The meshes a script's result shows, after meshes with Mode Subtractive or
 * Intersecting cut the meshes before them on their level. Solids are not cut by
 * meshes, and meshes are not cut by solids.
 *
 * @param shapes Result shapes.
 * @returns Meshes to show.
 */
export function solidScriptShapeMeshesCut(shapes: readonly SolidScriptShape[]): SolidScriptShapeMesh[] {
  return solidScriptMeshModesAny(shapes) ? solidScriptMeshModesLevel(shapes) : solidScriptShapeMeshes(shapes);
}
