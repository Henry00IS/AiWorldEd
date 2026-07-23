import * as THREE from 'three';
import { SolidBrush } from '../../solid/brush/solid_brush.js';
import { SolidBrushFactory } from '../../solid/brush/solid_brush_factory.js';
import { SolidPlane } from '../../solid/brush/solid_plane.js';
import { FaceTextureMapping } from '../../texture/face_texture_mapping.js';
import {
  VMF_INCHES_TO_METERS,
  sourcePointToEditorMeters
} from './vmf_coordinates.js';
import { VmfHalfSpaceHullBuilder } from './vmf_half_space_hull.js';
import { VmfSolid, VmfSolidSide } from './vmf_types.js';
import { VmfUvConverter } from './vmf_uv_converter.js';

/**
 * One imported brush with per-face texture mappings aligned to face order.
 */
export interface VmfBuiltBrush {
  /** Convex solid brush in editor meters (Y-up), centered at local origin. */
  brush: SolidBrush;
  /** World-space center removed from brush vertices (instance position). */
  worldCenter: THREE.Vector3;
  /** Face mappings indexed like brush.faces / surfaceIndex. */
  faceMappings: FaceTextureMapping[];
  /** Original VMF solid id. */
  solidId: number;
  /** Side materials in face order. */
  materials: string[];
}

/**
 * Builds SolidBrush geometry from VMF solid sides via half-space equations.
 */
export class VmfBrushFromSides {
  private readonly hullBuilder = new VmfHalfSpaceHullBuilder();
  private readonly uvConverter = new VmfUvConverter();

  /**
   * Converts one VMF solid into a convex editor brush.
   * @param solid Parsed VMF solid.
   * @param unitScale Inches to meters.
   * @returns Built brush with mappings, or null when the solid is degenerate.
   */
  build(
    solid: VmfSolid,
    unitScale: number = VMF_INCHES_TO_METERS
  ): VmfBuiltBrush | null {
    if (solid.sides.length < 4) return null;
    const planes = solid.sides.map((side) =>
      this.sideToOutwardPlane(side, unitScale)
    );
    const hull = this.hullBuilder.build(planes);
    if (!hull) return null;
    const brush = SolidBrushFactory.createFromFaceLoops(
      hull.faceLoops.map((loop) => loop.vertices)
    );
    if (!brush) return null;
    return this.packageBuiltBrush(solid, brush, planes, hull.faceLoops, unitScale);
  }

  /**
   * Attaches UV mappings and material names to a constructed brush.
   * @param solid Source VMF solid.
   * @param brush Constructed solid brush.
   * @param planes Outward planes in side order.
   * @param faceLoops Hull face loops with plane indices.
   * @param unitScale Inches to meters.
   * @returns Packaged import result.
   */
  private packageBuiltBrush(
    solid: VmfSolid,
    brush: SolidBrush,
    planes: SolidPlane[],
    faceLoops: Array<{ planeIndex: number }>,
    unitScale: number
  ): VmfBuiltBrush {
    const planeIndices = faceLoops.map((loop) => loop.planeIndex);
    const faceMappings = planeIndices.map((planeIndex, faceIndex) =>
      this.mapFace(solid.sides[planeIndex], brush, planes, faceIndex, planeIndex, unitScale)
    );
    const materials = planeIndices.map(
      (planeIndex) => solid.sides[planeIndex].material
    );
    const worldCenter = this.centerBrushAtOrigin(brush);
    return {
      brush,
      worldCenter,
      faceMappings,
      solidId: solid.id,
      materials
    };
  }

  /**
   * Translates brush vertices so the AABB center is at the origin.
   * Leaves the solid in local space for transforms and CSG; caller stores
   * the removed center as the instance world position.
   * @param brush Brush whose vertices are shifted in place.
   * @returns Former center in editor meters (pre-shift).
   */
  private centerBrushAtOrigin(brush: SolidBrush): THREE.Vector3 {
    const bounds = brush.computeLocalBounds();
    const center = bounds.getCenter(new THREE.Vector3());
    for (const vertex of brush.vertices) {
      vertex.sub(center);
    }
    brush.recalculatePlanes();
    return center;
  }

  /**
   * Builds a face texture mapping for one hull face.
   * @param side Source solid side.
   * @param brush Constructed brush.
   * @param planes Side-order planes.
   * @param faceIndex Brush face index.
   * @param planeIndex Source side index.
   * @param unitScale Unit scale.
   * @returns Face texture mapping.
   */
  private mapFace(
    side: VmfSolidSide,
    brush: SolidBrush,
    planes: SolidPlane[],
    faceIndex: number,
    planeIndex: number,
    unitScale: number
  ): FaceTextureMapping {
    const plane = brush.planes[faceIndex] ?? planes[planeIndex];
    return this.uvConverter.convertSideMapping(
      side.material,
      side.uAxis,
      side.vAxis,
      plane.normal,
      undefined,
      undefined,
      unitScale
    );
  }

  /**
   * Builds an outward SolidPlane from three Source-space plane points.
   * After Z-up→Y-up swizzle, Source winding yields an outward normal with
   * a right-handed cross product.
   * @param side Solid side with plane points.
   * @param unitScale Inches to meters.
   * @returns Outward plane in editor space.
   */
  private sideToOutwardPlane(
    side: VmfSolidSide,
    unitScale: number
  ): SolidPlane {
    const p1 = sourcePointToEditorMeters(side.plane.p1, unitScale);
    const p2 = sourcePointToEditorMeters(side.plane.p2, unitScale);
    const p3 = sourcePointToEditorMeters(side.plane.p3, unitScale);
    return SolidPlane.fromPoints(p1, p2, p3);
  }
}
