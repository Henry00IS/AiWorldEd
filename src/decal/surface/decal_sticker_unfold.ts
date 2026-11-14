import * as THREE from 'three';
import { DecalSoupTopology } from './decal_soup_topology.js';

/** Where a decal's image lies relative to the model it is drawn on. */
export interface DecalStickerFrame {
  /** Model-to-projector transform. */
  modelToProjector: THREE.Matrix4;
  /** Unit model-space direction the image travels in. */
  travelDirection: THREE.Vector3;
}

/** One flat region of the soup: triangles that share a plane. */
interface DecalStickerSheet {
  /** Unit plane normal. */
  normal: THREE.Vector3;
  /** Plane offset along the normal. */
  offset: number;
  /** Rounded plane key; orders sheets the same whatever the triangle order. */
  key: string;
  /** Corner indices of the sheet's triangles, three per triangle. */
  corners: number[];
  /** Model-space bounds of the sheet. */
  bounds: THREE.Box3;
  /** Map from model space onto the flattened image plane, once placed. */
  layout: THREE.Matrix4 | null;
  /** Sheets sharing a stretch of edge with this one, with a point on it. */
  neighbours: { sheet: number; hinge: THREE.Vector3 }[];
}

/** Part of a triangle edge on the line where two sheets meet. */
interface DecalStickerEdgeSpan {
  /** Smaller line parameter. */
  from: number;
  /** Larger line parameter. */
  to: number;
}

/**
 * Lays a decal image across a surface like a sticker: the soup is split into
 * flat sheets, the sheet the projector aims at is turned to face the projector,
 * and every other sheet is folded flat about the edge it shares with an already
 * placed sheet. Image coordinates then keep true lengths along the surface
 * instead of stretching on steep faces.
 *
 * The layout depends only on the surface's shape, never on how it is cut into
 * triangles or in which order they come: sheets meet wherever their edges
 * overlap along the shared line, even when one side carries extra corners there
 * (a seam pass adds those), every turn pivots on the projector's centre line,
 * and sheets are visited in an order set by their planes.
 */
export class DecalStickerUnfold {
  /** Rounding step of sheet plane keys: normals and offsets within it match. */
  static readonly planeStep = 1e-3;
  /** Largest distance of an edge from a plane that still counts as on it. */
  static readonly lineTolerance = 1e-4;
  /** Shortest shared stretch of edge that joins two sheets. */
  static readonly minimumOverlap = 1e-4;

  private readonly topology = new DecalSoupTopology();
  private readonly scratch = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly pivot = new THREE.Matrix4();
  private readonly axisOrigin = new THREE.Vector3();

  /**
   * Rewrites the image coordinates of a soup by unfolding it.
   *
   * @param positions Model-space positions before any lift.
   * @param normals Shading normals.
   * @param uvs Image coordinates, overwritten.
   * @param frame Projector frame of the decal.
   */
  apply(positions: Float32Array, normals: Float32Array, uvs: Float32Array, frame: DecalStickerFrame): void {
    const triangleCount = positions.length / 9;
    if (triangleCount === 0) return;
    this.topology.analyze(positions, normals);
    this.axisOrigin.setScalar(0).applyMatrix4(this.pivot.copy(frame.modelToProjector).invert());
    const { sheets, sheetOfTriangle } = this.sheetsCollect(positions, triangleCount);
    this.neighboursLink(sheets, positions);
    const seed = this.seedSheet(positions, frame, sheets, sheetOfTriangle, triangleCount);
    this.sheetsPlace(sheets, seed, frame);
    this.uvsWrite(positions, uvs, sheets, sheetOfTriangle, frame);
  }

  /**
   * Groups triangles into sheets by their plane.
   *
   * @param positions Model-space positions.
   * @param triangleCount Number of triangles.
   * @returns Sheets and the sheet of every triangle.
   */
  private sheetsCollect(
    positions: Float32Array,
    triangleCount: number,
  ): { sheets: DecalStickerSheet[]; sheetOfTriangle: Int32Array } {
    const sheets: DecalStickerSheet[] = [];
    const sheetOfTriangle = new Int32Array(triangleCount);
    const sheetByKey = new Map<string, number>();
    const step = DecalStickerUnfold.planeStep;
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const normal = new THREE.Vector3().fromArray(this.topology.faceNormals, triangle * 3);
      const offset = normal.dot(this.scratch.fromArray(positions, triangle * 9));
      const key = [normal.x, normal.y, normal.z, offset].map((value) => Math.round(value / step)).join(',');
      let sheet = sheetByKey.get(key);
      if (sheet === undefined) {
        sheet = sheets.length;
        sheetByKey.set(key, sheet);
        sheets.push({ normal, offset, key, corners: [], bounds: new THREE.Box3(), layout: null, neighbours: [] });
      }
      const target = sheets[sheet];
      if (target) {
        for (let corner = triangle * 3; corner < triangle * 3 + 3; corner++) {
          target.corners.push(corner);
          target.bounds.expandByPoint(this.scratch.fromArray(positions, corner * 3));
        }
      }
      sheetOfTriangle[triangle] = sheet;
    }
    return { sheets, sheetOfTriangle };
  }

  /**
   * Links sheets whose edges overlap along the line where their planes meet.
   * Corners on only one side of that line, as a seam pass leaves, do not
   * matter: the overlap is measured along the line, not by shared corners.
   *
   * @param sheets Sheets.
   * @param positions Model-space positions.
   */
  private neighboursLink(sheets: DecalStickerSheet[], positions: Float32Array): void {
    const reach = DecalStickerUnfold.lineTolerance;
    for (let first = 0; first < sheets.length; first++) {
      const a = sheets[first];
      if (!a) continue;
      for (let second = first + 1; second < sheets.length; second++) {
        const b = sheets[second];
        if (!b || !this.boundsTouch(a.bounds, b.bounds, reach)) continue;
        const direction = new THREE.Vector3().crossVectors(a.normal, b.normal);
        if (direction.lengthSq() < 1e-8) continue;
        direction.normalize();
        const hinge = this.sharedStretch(a, b, direction, positions);
        if (!hinge) continue;
        a.neighbours.push({ sheet: second, hinge });
        b.neighbours.push({ sheet: first, hinge: hinge.clone() });
      }
    }
  }

  /**
   * Tells whether two boxes touch within a margin.
   *
   * @param a First box.
   * @param b Second box.
   * @param margin Margin.
   * @returns True when they touch.
   */
  private boundsTouch(a: THREE.Box3, b: THREE.Box3, margin: number): boolean {
    return (
      a.min.x <= b.max.x + margin &&
      b.min.x <= a.max.x + margin &&
      a.min.y <= b.max.y + margin &&
      b.min.y <= a.max.y + margin &&
      a.min.z <= b.max.z + margin &&
      b.min.z <= a.max.z + margin
    );
  }

  /**
   * Finds a stretch of line both sheets have an edge on, and returns a point in
   * the middle of it.
   *
   * @param a First sheet.
   * @param b Second sheet.
   * @param direction Unit direction of the line where the planes meet.
   * @param positions Model-space positions.
   * @returns Point on the shared stretch, or null when the sheets do not meet.
   */
  private sharedStretch(
    a: DecalStickerSheet,
    b: DecalStickerSheet,
    direction: THREE.Vector3,
    positions: Float32Array,
  ): THREE.Vector3 | null {
    const spansA = this.edgeSpansOnPlane(a, b, direction, positions);
    if (spansA.length === 0) return null;
    const spansB = this.edgeSpansOnPlane(b, a, direction, positions);
    if (spansB.length === 0) return null;
    const merged = (spans: DecalStickerEdgeSpan[]) => {
      spans.sort((left, right) => left.from - right.from);
      const out: DecalStickerEdgeSpan[] = [];
      for (const span of spans) {
        const last = out[out.length - 1];
        if (last && span.from <= last.to + DecalStickerUnfold.minimumOverlap) last.to = Math.max(last.to, span.to);
        else out.push({ ...span });
      }
      return out;
    };
    let best: DecalStickerEdgeSpan | null = null;
    for (const left of merged(spansA)) {
      for (const right of merged(spansB)) {
        const from = Math.max(left.from, right.from);
        const to = Math.min(left.to, right.to);
        if (to - from < DecalStickerUnfold.minimumOverlap) continue;
        if (!best || to - from > best.to - best.from) best = { from, to };
      }
    }
    if (!best) return null;
    const middle = (best.from + best.to) / 2;
    const anchor = this.linePoint(a, b);
    return anchor.addScaledVector(direction, middle - anchor.dot(direction));
  }

  /**
   * Lists the parameter spans, along the line, of a sheet's edges that lie on
   * another sheet's plane.
   *
   * @param sheet Sheet whose edges are tested.
   * @param other Sheet whose plane the edges must lie on.
   * @param direction Line direction.
   * @param positions Model-space positions.
   * @returns Spans.
   */
  private edgeSpansOnPlane(
    sheet: DecalStickerSheet,
    other: DecalStickerSheet,
    direction: THREE.Vector3,
    positions: Float32Array,
  ): DecalStickerEdgeSpan[] {
    const spans: DecalStickerEdgeSpan[] = [];
    const reach = DecalStickerUnfold.lineTolerance;
    const corners = sheet.corners;
    for (let index = 0; index < corners.length; index++) {
      const corner = corners[index] ?? 0;
      const next = corners[index - (index % 3) + ((index + 1) % 3)] ?? 0;
      if (Math.abs(this.planeDistance(other, positions, corner)) > reach) continue;
      if (Math.abs(this.planeDistance(other, positions, next)) > reach) continue;
      const start = this.scratch.fromArray(positions, corner * 3).dot(direction);
      const end = this.scratch.fromArray(positions, next * 3).dot(direction);
      spans.push({ from: Math.min(start, end), to: Math.max(start, end) });
    }
    return spans;
  }

  /**
   * Returns the signed distance of a corner from a sheet's plane.
   *
   * @param sheet Sheet.
   * @param positions Model-space positions.
   * @param corner Corner index.
   * @returns Distance.
   */
  private planeDistance(sheet: DecalStickerSheet, positions: Float32Array, corner: number): number {
    return sheet.normal.dot(this.scratch.fromArray(positions, corner * 3)) - sheet.offset;
  }

  /**
   * Returns a point on the line where two sheet planes meet.
   *
   * @param a First sheet.
   * @param b Second sheet.
   * @returns Point on the line.
   */
  private linePoint(a: DecalStickerSheet, b: DecalStickerSheet): THREE.Vector3 {
    const cross = new THREE.Vector3().crossVectors(a.normal, b.normal);
    const lengthSq = cross.lengthSq();
    const fromA = new THREE.Vector3().crossVectors(b.normal, cross).multiplyScalar(a.offset);
    const fromB = new THREE.Vector3().crossVectors(cross, a.normal).multiplyScalar(b.offset);
    return fromA.add(fromB).divideScalar(lengthSq);
  }

  /**
   * Picks the sheet the projector aims at: where its centre line first meets a
   * facing triangle, or else the facing triangle nearest the middle of the
   * image.
   *
   * @param positions Model-space positions.
   * @param frame Projector frame.
   * @param sheets Sheets.
   * @param sheetOfTriangle Sheet of every triangle.
   * @param triangleCount Number of triangles.
   * @returns Sheet index.
   */
  private seedSheet(
    positions: Float32Array,
    frame: DecalStickerFrame,
    sheets: readonly DecalStickerSheet[],
    sheetOfTriangle: Int32Array,
    triangleCount: number,
  ): number {
    const ray = new THREE.Ray(
      this.axisOrigin.clone().addScaledVector(frame.travelDirection, -1e6),
      frame.travelDirection,
    );
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const hit = new THREE.Vector3();
    let bestHit = -1;
    let bestDistance = Infinity;
    let bestKey = '';
    let fallback = 0;
    let fallbackScore = Infinity;
    let fallbackKey = '';
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const sheet = sheets[sheetOfTriangle[triangle] ?? 0];
      if (!sheet) continue;
      const facing = -sheet.normal.dot(frame.travelDirection);
      a.fromArray(positions, triangle * 9);
      b.fromArray(positions, triangle * 9 + 3);
      c.fromArray(positions, triangle * 9 + 6);
      if (facing > 0.2 && ray.intersectTriangle(a, b, c, false, hit)) {
        const distance = hit.distanceTo(ray.origin);
        const closer =
          distance < bestDistance - 1e-6 || (Math.abs(distance - bestDistance) <= 1e-6 && sheet.key < bestKey);
        if (closer) {
          bestDistance = distance;
          bestHit = sheetOfTriangle[triangle] ?? 0;
          bestKey = sheet.key;
        }
      }
      const centre = this.triangleCentre(positions, triangle).applyMatrix4(frame.modelToProjector);
      const score = centre.x * centre.x + centre.z * centre.z + (facing > 0.2 ? 0 : 10);
      if (score < fallbackScore - 1e-9 || (Math.abs(score - fallbackScore) <= 1e-9 && sheet.key < fallbackKey)) {
        fallbackScore = score;
        fallback = sheetOfTriangle[triangle] ?? 0;
        fallbackKey = sheet.key;
      }
    }
    return bestHit >= 0 ? bestHit : fallback;
  }

  /**
   * Places every sheet: the seed faces the projector, its neighbours fold flat
   * about shared edges outward, and unreached islands face the projector on
   * their own. Every turn of a sheet toward the projector pivots where the
   * projector's centre line meets the sheet's plane, and sheets are visited in
   * an order set by their planes alone.
   *
   * @param sheets Sheets.
   * @param seed Seed sheet.
   * @param frame Projector frame.
   */
  private sheetsPlace(sheets: DecalStickerSheet[], seed: number, frame: DecalStickerFrame): void {
    const facingProjector = frame.travelDirection.clone().negate();
    for (const sheet of sheets)
      sheet.neighbours.sort((left, right) => this.keyCompare(sheets, left.sheet, right.sheet));
    const rest = [...sheets.keys()].sort((left, right) => this.keyCompare(sheets, left, right));
    for (const start of [seed, ...rest]) {
      const startSheet = sheets[start];
      if (!startSheet || startSheet.layout) continue;
      startSheet.layout = this.hingeTurn(startSheet.normal, facingProjector, this.axisMeet(startSheet, frame));
      this.sheetsSpread(sheets, start);
    }
  }

  /**
   * Orders two sheets by their plane keys.
   *
   * @param sheets Sheets.
   * @param left First sheet index.
   * @param right Second sheet index.
   * @returns Sort order.
   */
  private keyCompare(sheets: readonly DecalStickerSheet[], left: number, right: number): number {
    const a = sheets[left]?.key ?? '';
    const b = sheets[right]?.key ?? '';
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /**
   * Returns where the projector's centre line meets a sheet's plane, or the
   * centre's foot on the plane when the line runs along it.
   *
   * @param sheet Sheet.
   * @param frame Projector frame.
   * @returns Model-space point.
   */
  private axisMeet(sheet: DecalStickerSheet, frame: DecalStickerFrame): THREE.Vector3 {
    const origin = this.axisOrigin;
    const along = sheet.normal.dot(frame.travelDirection);
    const height = sheet.normal.dot(origin) - sheet.offset;
    if (Math.abs(along) > 1e-3) return origin.clone().addScaledVector(frame.travelDirection, -height / along);
    return origin.clone().addScaledVector(sheet.normal, -height);
  }

  /**
   * Folds the sheets reachable from a placed sheet, breadth first.
   *
   * @param sheets Sheets.
   * @param start Placed sheet.
   */
  private sheetsSpread(sheets: DecalStickerSheet[], start: number): void {
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const placed = sheets[queue[head] ?? 0];
      if (!placed?.layout) continue;
      for (const { sheet, hinge } of placed.neighbours) {
        const target = sheets[sheet];
        if (!target || target.layout) continue;
        target.layout = placed.layout.clone().multiply(this.hingeTurn(target.normal, placed.normal, hinge));
        queue.push(sheet);
      }
    }
  }

  /**
   * Returns the turn about a fixed point that brings one normal onto another.
   * Two sheets sharing an edge turn about that edge, because their normals are
   * both perpendicular to it.
   *
   * @param from Normal to turn.
   * @param to Normal to reach.
   * @param fixed Point that stays in place.
   * @returns Model-space transform.
   */
  private hingeTurn(from: THREE.Vector3, to: THREE.Vector3, fixed: THREE.Vector3): THREE.Matrix4 {
    this.turn.setFromUnitVectors(from, to);
    const turned = new THREE.Matrix4().makeTranslation(fixed.x, fixed.y, fixed.z);
    turned.multiply(this.pivot.makeRotationFromQuaternion(this.turn));
    return turned.multiply(this.pivot.makeTranslation(-fixed.x, -fixed.y, -fixed.z));
  }

  /**
   * Writes every corner's image coordinates from its sheet's layout.
   *
   * @param positions Model-space positions.
   * @param uvs Image coordinates, overwritten.
   * @param sheets Placed sheets.
   * @param sheetOfTriangle Sheet of every triangle.
   * @param frame Projector frame.
   */
  private uvsWrite(
    positions: Float32Array,
    uvs: Float32Array,
    sheets: readonly DecalStickerSheet[],
    sheetOfTriangle: Int32Array,
    frame: DecalStickerFrame,
  ): void {
    const cornerCount = positions.length / 3;
    for (let corner = 0; corner < cornerCount; corner++) {
      const layout = sheets[sheetOfTriangle[Math.floor(corner / 3)] ?? 0]?.layout;
      if (!layout) continue;
      this.scratch
        .fromArray(positions, corner * 3)
        .applyMatrix4(layout)
        .applyMatrix4(frame.modelToProjector);
      uvs[corner * 2] = this.scratch.x + 0.5;
      uvs[corner * 2 + 1] = 0.5 - this.scratch.z;
    }
  }

  /**
   * Returns a triangle's centroid.
   *
   * @param positions Model-space positions.
   * @param triangle Triangle index.
   * @returns New vector.
   */
  private triangleCentre(positions: Float32Array, triangle: number): THREE.Vector3 {
    const base = triangle * 9;
    return new THREE.Vector3(
      ((positions[base] ?? 0) + (positions[base + 3] ?? 0) + (positions[base + 6] ?? 0)) / 3,
      ((positions[base + 1] ?? 0) + (positions[base + 4] ?? 0) + (positions[base + 7] ?? 0)) / 3,
      ((positions[base + 2] ?? 0) + (positions[base + 5] ?? 0) + (positions[base + 8] ?? 0)) / 3,
    );
  }
}
