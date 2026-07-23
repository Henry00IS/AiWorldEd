import * as THREE from 'three';
import { SolidBrush } from '../brush/solid_brush.js';
import { SolidPlane } from '../brush/solid_plane.js';
import { SolidBrushInstance } from '../model/solid_brush_instance.js';
import { SolidOperation } from '../types/solid_operation.js';
import { SurfaceCategory } from '../types/surface_category.js';
import {
  shouldKeepSurfaceCategory,
  shouldReverseSurfaceWinding
} from '../types/surface_category.js';
import { BrushMembership } from './brush_membership.js';
import { CategoryRouter } from './category_router.js';
import { SurfaceFragmentSplitter } from './surface_fragment_splitter.js';
import { SOLID_FAT_PLANE_EPSILON } from './solid_math_constants.js';

/**
 * A finalized surface polygon produced by solid CSG compilation.
 */
export interface SolidCompiledPolygon {
  /** Ordered vertices in model space. */
  vertices: THREE.Vector3[];
  /** Outward (or cavity) normal after category resolution. */
  normal: THREE.Vector3;
  /** Surface index from the originating brush face. */
  surfaceIndex: number;
  /** Originating brush instance id. */
  brushId: string;
  /** Texture authored on the originating brush (baked into the result). */
  textureId: string;
  /** Final surface category (aligned or reverse-aligned). */
  category: SurfaceCategory;
}

/**
 * World-space brush snapshot used during compilation.
 */
interface PreparedBrush {
  instance: SolidBrushInstance;
  brush: SolidBrush;
  bounds: THREE.Box3;
  /** Indices of other prepared brushes whose bounds overlap this one. */
  overlappingPeerIndices: number[];
  operation: SolidOperation;
}

/**
 * Compiles solid brush instances into surface polygons using Sander-style
 * categorization with bounds-accelerated peer filtering for large scenes.
 */
export class SolidCsgCompiler {
  private readonly membershipEpsilon: number;
  private readonly boundsPad: number;
  private readonly scratchCentroid = new THREE.Vector3();
  private readonly scratchOutside = new THREE.Vector3();
  private readonly scratchInside = new THREE.Vector3();

  /**
   * Creates a solid CSG compiler.
   * @param membershipEpsilon Optional fat-plane epsilon for membership tests.
   */
  constructor(membershipEpsilon: number = SOLID_FAT_PLANE_EPSILON) {
    this.membershipEpsilon = membershipEpsilon;
    this.boundsPad = membershipEpsilon * 2;
  }

  /**
   * Compiles all visible brushes into final surface polygons.
   * @param instances Ordered brush instances (tree order = list order).
   * @returns Compiled surface polygons for meshing.
   */
  compile(instances: SolidBrushInstance[]): SolidCompiledPolygon[] {
    const prepared = this.prepareBrushes(instances);
    if (prepared.length === 0) return [];
    this.buildOverlapGraph(prepared);
    const output: SolidCompiledPolygon[] = [];
    for (let brushIndex = 0; brushIndex < prepared.length; brushIndex++) {
      this.compileBrushSurfaces(prepared, brushIndex, output);
    }
    return output;
  }

  /**
   * Transforms visible instances into model-space prepared brushes.
   * @param instances Source instances.
   * @returns Prepared brush list.
   */
  private prepareBrushes(instances: SolidBrushInstance[]): PreparedBrush[] {
    const prepared: PreparedBrush[] = [];
    for (const instance of instances) {
      if (!instance.visible) continue;
      const brush = instance.getModelSpaceBrush();
      prepared.push({
        instance,
        brush,
        bounds: brush.computeLocalBounds(),
        overlappingPeerIndices: [],
        operation: instance.operation
      });
    }
    return prepared;
  }

  /**
   * Builds undirected overlap adjacency for bounds-accelerated CSG.
   * @param prepared Prepared brushes to index.
   */
  private buildOverlapGraph(prepared: PreparedBrush[]): void {
    const count = prepared.length;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        if (!this.boundsOverlap(prepared[i].bounds, prepared[j].bounds)) {
          continue;
        }
        prepared[i].overlappingPeerIndices.push(j);
        prepared[j].overlappingPeerIndices.push(i);
      }
    }
  }

  /**
   * Compiles all faces of one brush into the output list.
   * @param prepared All prepared brushes.
   * @param brushIndex Index of the subject brush.
   * @param output Accumulator for compiled polygons.
   */
  private compileBrushSurfaces(
    prepared: PreparedBrush[],
    brushIndex: number,
    output: SolidCompiledPolygon[]
  ): void {
    const subject = prepared[brushIndex];
    if (subject.overlappingPeerIndices.length === 0) {
      this.emitIsolatedBrushSurfaces(subject, prepared, brushIndex, output);
      return;
    }
    for (let faceIndex = 0; faceIndex < subject.brush.faces.length; faceIndex++) {
      const face = subject.brush.faces[faceIndex];
      const faceVertices = subject.brush.getFaceVertices(face);
      const facePlane = subject.brush.planes[faceIndex];
      const cutPlanes = this.collectCutPlanes(prepared, brushIndex, facePlane);
      const fragments =
        cutPlanes.length === 0
          ? [faceVertices]
          : SurfaceFragmentSplitter.splitByPlanes(faceVertices, cutPlanes);
      for (const fragment of fragments) {
        const compiled = this.finalizeFragment(
          fragment,
          facePlane,
          face.surfaceIndex,
          subject,
          prepared,
          brushIndex
        );
        if (compiled) output.push(compiled);
      }
    }
  }

  /**
   * Fast path for a brush that does not overlap any peer volume.
   * Additive/copy isolates keep exterior faces; lone subtractive/intersect emit nothing.
   * @param subject Isolated brush.
   * @param prepared All brushes (for membership tests).
   * @param brushIndex Subject index.
   * @param output Polygon accumulator.
   */
  private emitIsolatedBrushSurfaces(
    subject: PreparedBrush,
    prepared: PreparedBrush[],
    brushIndex: number,
    output: SolidCompiledPolygon[]
  ): void {
    if (subject.operation === SolidOperation.Subtractive) return;
    if (subject.operation === SolidOperation.Intersecting) return;
    for (let faceIndex = 0; faceIndex < subject.brush.faces.length; faceIndex++) {
      const face = subject.brush.faces[faceIndex];
      const faceVertices = subject.brush.getFaceVertices(face);
      const facePlane = subject.brush.planes[faceIndex];
      const compiled = this.finalizeFragment(
        faceVertices,
        facePlane,
        face.surfaceIndex,
        subject,
        prepared,
        brushIndex
      );
      if (compiled) output.push(compiled);
    }
  }

  /**
   * Collects planes from overlapping peer brushes that may cut the subject face.
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @param facePlane Subject face plane.
   * @returns Planes for fragment splitting.
   */
  private collectCutPlanes(
    prepared: PreparedBrush[],
    subjectIndex: number,
    facePlane: SolidPlane
  ): SolidPlane[] {
    const planes: SolidPlane[] = [];
    const subject = prepared[subjectIndex];
    for (const peerIndex of subject.overlappingPeerIndices) {
      const peer = prepared[peerIndex];
      for (const plane of peer.brush.planes) {
        if (facePlane.isAlignedWith(plane) || facePlane.isReverseAlignedWith(plane)) {
          continue;
        }
        planes.push(plane);
      }
    }
    return planes;
  }

  /**
   * Classifies a fragment and emits a compiled polygon when it is a boundary.
   * @param fragment Fragment vertices.
   * @param facePlane Original face plane.
   * @param surfaceIndex Face surface index.
   * @param subject Subject prepared brush.
   * @param prepared All brushes.
   * @param subjectIndex Subject index.
   * @returns Compiled polygon or null when discarded.
   */
  private finalizeFragment(
    fragment: THREE.Vector3[],
    facePlane: SolidPlane,
    surfaceIndex: number,
    subject: PreparedBrush,
    prepared: PreparedBrush[],
    subjectIndex: number
  ): SolidCompiledPolygon | null {
    if (fragment.length < 3) return null;
    if (!this.isBoundaryFragment(fragment, facePlane.normal, prepared)) {
      return null;
    }
    const category = this.routeFragmentCategory(
      fragment,
      facePlane.normal,
      prepared,
      subjectIndex
    );
    if (!shouldKeepSurfaceCategory(category)) return null;
    const vertices = fragment.map((point) => point.clone());
    const normal = facePlane.normal.clone();
    if (shouldReverseSurfaceWinding(category)) {
      vertices.reverse();
      normal.negate();
    }
    return {
      vertices,
      normal,
      surfaceIndex,
      brushId: subject.instance.id,
      textureId: subject.instance.getSurfaceTextureId(surfaceIndex),
      category
    };
  }

  /**
   * Routes a fragment's categories through brush operations in tree order.
   * Non-overlapping peers contribute Outside without a full plane classify.
   * @param fragment Fragment polygon.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @returns Final routed category.
   */
  private routeFragmentCategory(
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    prepared: PreparedBrush[],
    subjectIndex: number
  ): SurfaceCategory {
    let category = SurfaceCategory.Outside;
    const subject = prepared[subjectIndex];
    const overlapSet = this.buildIndexSet(subject.overlappingPeerIndices);
    overlapSet.add(subjectIndex);
    for (let index = 0; index < prepared.length; index++) {
      const peer = prepared[index];
      let relative: SurfaceCategory;
      if (index === subjectIndex) {
        relative = SurfaceCategory.SelfAligned;
      } else if (!overlapSet.has(index)) {
        relative = SurfaceCategory.Outside;
      } else {
        relative = BrushMembership.classifyPolygon(fragment, peer.brush, normal);
      }
      category = CategoryRouter.route(category, relative, peer.operation);
    }
    return category;
  }

  /**
   * Double-checks boundary status with solid-membership samples across the face.
   * @param fragment Fragment vertices.
   * @param normal Face normal.
   * @param prepared All brushes.
   * @returns True when the fragment lies on the final solid boundary.
   */
  private isBoundaryFragment(
    fragment: THREE.Vector3[],
    normal: THREE.Vector3,
    prepared: PreparedBrush[]
  ): boolean {
    this.computeCentroidInto(fragment, this.scratchCentroid);
    const offset = Math.max(this.membershipEpsilon * 4, 1e-4);
    this.scratchOutside
      .copy(this.scratchCentroid)
      .addScaledVector(normal, offset);
    this.scratchInside
      .copy(this.scratchCentroid)
      .addScaledVector(normal, -offset);
    const outsideInSolid = this.evaluateSolidMembership(
      this.scratchOutside,
      prepared
    );
    const insideInSolid = this.evaluateSolidMembership(
      this.scratchInside,
      prepared
    );
    return outsideInSolid !== insideInSolid;
  }

  /**
   * Evaluates the ordered CSG expression at a point with bounds early-outs.
   * @param point Sample point in model space.
   * @param prepared Brush list in tree order.
   * @returns True when the point is inside the final solid.
   */
  private evaluateSolidMembership(
    point: THREE.Vector3,
    prepared: PreparedBrush[]
  ): boolean {
    let inside = false;
    for (const entry of prepared) {
      if (!this.boundsContainPoint(entry.bounds, point)) {
        inside = this.applyOperation(inside, false, entry.operation);
        continue;
      }
      const inBrush = BrushMembership.isInsidePlanes(
        point,
        entry.brush.planes,
        this.membershipEpsilon
      );
      inside = this.applyOperation(inside, inBrush, entry.operation);
    }
    return inside;
  }

  /**
   * Applies a CSG operation to an accumulated membership flag.
   * @param current Current solid membership.
   * @param inBrush Whether the point is inside the operand brush.
   * @param operation Operand operation.
   * @returns Updated membership.
   */
  private applyOperation(
    current: boolean,
    inBrush: boolean,
    operation: SolidOperation
  ): boolean {
    if (operation === SolidOperation.Additive) return current || inBrush;
    if (operation === SolidOperation.Subtractive) return current && !inBrush;
    return current && inBrush;
  }

  /**
   * Returns whether two bounds overlap (with a small pad).
   * @param a First bounds.
   * @param b Second bounds.
   * @returns True when they may touch or intersect.
   */
  private boundsOverlap(a: THREE.Box3, b: THREE.Box3): boolean {
    const pad = this.boundsPad;
    return !(
      a.max.x + pad < b.min.x ||
      a.min.x - pad > b.max.x ||
      a.max.y + pad < b.min.y ||
      a.min.y - pad > b.max.y ||
      a.max.z + pad < b.min.z ||
      a.min.z - pad > b.max.z
    );
  }

  /**
   * Returns whether a padded AABB contains a point.
   * @param bounds Axis-aligned bounds.
   * @param point Sample point.
   * @returns True when the point is inside the expanded box.
   */
  private boundsContainPoint(bounds: THREE.Box3, point: THREE.Vector3): boolean {
    const pad = this.boundsPad;
    return (
      point.x >= bounds.min.x - pad &&
      point.x <= bounds.max.x + pad &&
      point.y >= bounds.min.y - pad &&
      point.y <= bounds.max.y + pad &&
      point.z >= bounds.min.z - pad &&
      point.z <= bounds.max.z + pad
    );
  }

  /**
   * Writes the arithmetic centroid of a polygon into a target vector.
   * @param polygon Vertices.
   * @param target Output vector.
   */
  private computeCentroidInto(
    polygon: THREE.Vector3[],
    target: THREE.Vector3
  ): void {
    target.set(0, 0, 0);
    for (const point of polygon) {
      target.add(point);
    }
    if (polygon.length > 0) {
      target.multiplyScalar(1 / polygon.length);
    }
  }

  /**
   * Builds a Set from numeric indices for O(1) membership tests.
   * @param indices Index list.
   * @returns Set of indices.
   */
  private buildIndexSet(indices: number[]): Set<number> {
    return new Set(indices);
  }
}
