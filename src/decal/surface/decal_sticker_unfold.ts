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
  /** Centroid of the sheet's first triangle. */
  anchor: THREE.Vector3;
  /** Map from model space onto the flattened image plane, once placed. */
  layout: THREE.Matrix4 | null;
  /** Sheets sharing an edge with this one, with a point on that edge. */
  neighbours: { sheet: number; hinge: THREE.Vector3 }[];
}

/**
 * Lays a decal image across a surface like a sticker: the soup is split into
 * flat sheets, the sheet the projector aims at is turned to face the projector,
 * and every other sheet is folded flat about the edge it shares with an already
 * placed sheet. Image coordinates then keep true lengths along the surface
 * instead of stretching on steep faces.
 */
export class DecalStickerUnfold {
  /** Rounding step of sheet plane keys: normals and offsets within it match. */
  static readonly planeStep = 1e-3;

  private readonly topology = new DecalSoupTopology();
  private readonly scratch = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly pivot = new THREE.Matrix4();

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
    const { sheets, sheetOfTriangle } = this.sheetsCollect(positions, triangleCount);
    this.neighboursLink(sheets, sheetOfTriangle, positions, triangleCount);
    const seed = this.seedTriangle(positions, frame, triangleCount);
    this.sheetsPlace(sheets, sheetOfTriangle[seed] ?? 0, this.triangleCentre(positions, seed), frame);
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
        sheets.push({ normal, anchor: this.triangleCentre(positions, triangle), layout: null, neighbours: [] });
      }
      sheetOfTriangle[triangle] = sheet;
    }
    return { sheets, sheetOfTriangle };
  }

  /**
   * Links sheets whose triangles share a welded edge.
   *
   * @param sheets Sheets.
   * @param sheetOfTriangle Sheet of every triangle.
   * @param positions Model-space positions.
   * @param triangleCount Number of triangles.
   */
  private neighboursLink(
    sheets: DecalStickerSheet[],
    sheetOfTriangle: Int32Array,
    positions: Float32Array,
    triangleCount: number,
  ): void {
    const firstSheetOfEdge = new Map<string, number>();
    const linked = new Set<string>();
    const vertexOf = this.topology.vertexOfCorner;
    for (let corner = 0; corner < triangleCount * 3; corner++) {
      const next = corner - (corner % 3) + ((corner + 1) % 3);
      const first = vertexOf[corner] ?? 0;
      const second = vertexOf[next] ?? 0;
      const edge = first < second ? `${first},${second}` : `${second},${first}`;
      const sheet = sheetOfTriangle[Math.floor(corner / 3)] ?? 0;
      const other = firstSheetOfEdge.get(edge);
      if (other === undefined) firstSheetOfEdge.set(edge, sheet);
      if (other === undefined || other === sheet || linked.has(`${other},${sheet}`)) continue;
      linked.add(`${other},${sheet}`).add(`${sheet},${other}`);
      const hinge = new THREE.Vector3().fromArray(positions, corner * 3);
      sheets[other]?.neighbours.push({ sheet, hinge });
      sheets[sheet]?.neighbours.push({ sheet: other, hinge });
    }
  }

  /**
   * Picks the triangle the projector aims at: facing it and nearest the middle
   * of the image.
   *
   * @param positions Model-space positions.
   * @param frame Projector frame.
   * @param triangleCount Number of triangles.
   * @returns Triangle index.
   */
  private seedTriangle(positions: Float32Array, frame: DecalStickerFrame, triangleCount: number): number {
    let best = 0;
    let bestScore = Infinity;
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const facing = -this.scratch.fromArray(this.topology.faceNormals, triangle * 3).dot(frame.travelDirection);
      const centre = this.triangleCentre(positions, triangle).applyMatrix4(frame.modelToProjector);
      const score = centre.x * centre.x + centre.z * centre.z + (facing > 0.2 ? 0 : 10);
      if (score < bestScore) {
        bestScore = score;
        best = triangle;
      }
    }
    return best;
  }

  /**
   * Places every sheet: the seed faces the projector, its neighbours fold flat
   * about shared edges outward, and unreached islands face the projector on
   * their own.
   *
   * @param sheets Sheets.
   * @param seed Seed sheet.
   * @param seedCentre Point on the seed sheet that stays in place.
   * @param frame Projector frame.
   */
  private sheetsPlace(
    sheets: DecalStickerSheet[],
    seed: number,
    seedCentre: THREE.Vector3,
    frame: DecalStickerFrame,
  ): void {
    const facingProjector = frame.travelDirection.clone().negate();
    const order = [seed, ...sheets.keys()];
    for (const start of order) {
      const startSheet = sheets[start];
      if (!startSheet || startSheet.layout) continue;
      const fixed = start === seed ? seedCentre : startSheet.anchor;
      startSheet.layout = this.hingeTurn(startSheet.normal, facingProjector, fixed);
      this.sheetsSpread(sheets, start);
    }
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
