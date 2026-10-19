import { Vector3 } from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierBevelFaceRecord } from './modifier_bevel_face_record.js';

/**
 * Returns the average of a loop.
 *
 * @param loop Face vertices.
 * @returns Centroid. An empty loop returns the origin.
 */
export function modifierBevelLoopCentroid(loop: readonly Vector3[]): Vector3 {
  const center = new Vector3();
  for (const point of loop) center.add(point);
  return center.multiplyScalar(1 / Math.max(loop.length, 1));
}

/**
 * Reads one loop per face.
 *
 * @param brush Chamfered brush.
 * @returns Face loops in face order.
 */
export function modifierBevelFaceLoops(brush: SolidBrush): Vector3[][] {
  return brush.faces.map((face) => brush.getFaceVertices(face));
}

/**
 * Replaces brush topology with the loops when they form a closed solid.
 *
 * @param brush Brush held by the derived result.
 * @param loops Face loops, including any faces just appended.
 * @returns True when the brush was replaced.
 */
export function modifierBevelInstallFaceLoops(brush: SolidBrush, loops: Vector3[][]): boolean {
  const built = SolidBrushFactory.createFromFaceLoops(loops);
  if (!built || !modifierBevelShellCloses(built) || !modifierBevelRebuildHolds(brush, built)) return false;
  modifierBevelCopyBrush(brush, built);
  return true;
}

/**
 * Returns whether a rebuilt shell stays as convex as the brush it replaces.
 *
 * @param previous Brush before the replacement.
 * @param built Rebuilt brush.
 * @returns True when the replacement does not open the solid.
 */
function modifierBevelRebuildHolds(previous: SolidBrush, built: SolidBrush): boolean {
  return modifierBevelBrushGap(built) <= Math.max(1e-3, modifierBevelBrushGap(previous) + 1e-4);
}

/**
 * Returns the largest distance of a vertex outside a face.
 *
 * @param brush Brush to measure.
 * @returns Gap.
 */
function modifierBevelBrushGap(brush: SolidBrush): number {
  let gap = 0;
  for (const plane of brush.planes) {
    for (const vertex of brush.vertices) gap = Math.max(gap, plane.signedDistance(vertex));
  }
  return gap;
}

/**
 * Returns whether every wing edge has its opposite twin.
 *
 * @param brush Rebuilt brush.
 * @returns True when the shell is closed.
 */
function modifierBevelShellCloses(brush: SolidBrush): boolean {
  if (brush.faces.length < 4) return false;
  return brush.wingEdges.every((edge, index) => modifierBevelTwinCloses(brush, edge.twinIndex, index));
}

/**
 * Returns whether a twin points back at an edge.
 *
 * @param brush Rebuilt brush.
 * @param twin Twin index.
 * @param index Edge index.
 * @returns True when the pair agrees.
 */
function modifierBevelTwinCloses(brush: SolidBrush, twin: number, index: number): boolean {
  return twin !== index && brush.wingEdges[twin]?.twinIndex === index;
}

/**
 * Copies a rebuilt brush into the existing object.
 *
 * @param target Brush held by the derived result.
 * @param built Replacement topology.
 */
function modifierBevelCopyBrush(target: SolidBrush, built: SolidBrush): void {
  target.vertices = built.vertices;
  target.wingEdges = built.wingEdges;
  target.edgeFaceIndices = built.edgeFaceIndices;
  target.faces = built.faces;
  target.planes = built.planes;
}

/**
 * Copies one corner record for a new sector.
 *
 * @param record Corner record.
 * @returns Independent record.
 */
export function modifierBevelCopyCornerRecord(record: ModifierBevelFaceRecord): ModifierBevelFaceRecord {
  const edge = record.chamferEdge;
  return {
    parentSurfaceIndex: record.parentSurfaceIndex,
    smearFromDerivedIndex: record.smearFromDerivedIndex,
    chamferEdge: edge
      ? { pointA: edge.pointA.clone(), pointB: edge.pointB.clone(), destNormal: edge.destNormal.clone() }
      : null,
    cornerFace: record.cornerFace,
  };
}
