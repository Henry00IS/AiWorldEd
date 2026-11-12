import * as THREE from 'three';

/** Minimum absolute scale accepted when building or decomposing a UV matrix. */
export const SURFACE_UV_MIN_SCALE = 1e-4;

/** Quantization step for decomposed rotation (degrees). */
const ROTATION_SNAP_STEP = 1e-4;

/** Quantization step for decomposed translation. */
const TRANSLATION_SNAP_STEP = 1 / 32768;

/**
 * Serializable 2×4 surface UV matrix. UVs are formed as: u = U.xyz · position +
 * U.w, v = V.xyz · position + V.w. For solid brushes, positions are
 * brush-local. For content meshes, positions are world-space at bake time.
 */
/** Scratch U row of a matrix product. */
const scratchRowU = new THREE.Vector4();
/** Scratch V row of a matrix product. */
const scratchRowV = new THREE.Vector4();

export class SurfaceUvMatrix {
  readonly u: THREE.Vector4;
  readonly v: THREE.Vector4;

  /**
   * Creates a surface UV matrix from U and V rows.
   *
   * @param u Row that produces the U coordinate.
   * @param v Row that produces the V coordinate.
   */
  constructor(u: THREE.Vector4, v: THREE.Vector4) {
    this.u = u.clone();
    this.v = v.clone();
    this.sanitizeIfInvalid();
  }

  /**
   * Identity UV matrix: u = x, v = y.
   *
   * @returns New identity matrix.
   */
  static identity(): SurfaceUvMatrix {
    return new SurfaceUvMatrix(new THREE.Vector4(1, 0, 0, 0), new THREE.Vector4(0, 1, 0, 0));
  }

  /**
   * Centered identity: u = x + 0.5, v = y + 0.5.
   *
   * @returns New centered matrix.
   */
  static centered(): SurfaceUvMatrix {
    return new SurfaceUvMatrix(new THREE.Vector4(1, 0, 0, 0.5), new THREE.Vector4(0, 1, 0, 0.5));
  }

  /**
   * Builds a UV matrix from translation, face normal, rotation, and tile scale.
   * Scale is UV units per world unit along each axis (1 / meters-per-tile).
   *
   * @param translation UV translation (added after scale/rotate).
   * @param faceNormal Unit face normal used to orient the plane basis.
   * @param rotationDeg Rotation of U/V around the face normal in degrees.
   * @param scaleU Signed UV scale along U (min |scale| SURFACE_UV_MIN_SCALE;
   *   negative mirrors U).
   * @param scaleV Signed UV scale along V (min |scale| SURFACE_UV_MIN_SCALE;
   *   negative mirrors V).
   * @returns New UV matrix.
   */
  static fromTrs(
    translation: THREE.Vector2,
    faceNormal: THREE.Vector3,
    rotationDeg: number,
    scaleU: number,
    scaleV: number,
  ): SurfaceUvMatrix {
    const safeScaleU = enforceMinScale(scaleU);
    const safeScaleV = enforceMinScale(scaleV);
    const basis = buildStableFaceBasis(faceNormal, rotationDeg);
    const u = new THREE.Vector4(
      basis.uAxis.x * safeScaleU,
      basis.uAxis.y * safeScaleU,
      basis.uAxis.z * safeScaleU,
      translation.x,
    );
    const v = new THREE.Vector4(
      basis.vAxis.x * safeScaleV,
      basis.vAxis.y * safeScaleV,
      basis.vAxis.z * safeScaleV,
      translation.y,
    );
    return new SurfaceUvMatrix(u, v);
  }

  /**
   * Builds a UV matrix from the first two rows of a 4×4 transform.
   *
   * @param matrix Source matrix (row 0 → U, row 1 → V).
   * @returns New UV matrix.
   */
  static fromMatrix4(matrix: THREE.Matrix4): SurfaceUvMatrix {
    const elements = matrix.elements;
    const u = new THREE.Vector4(elements[0], elements[4], elements[8], elements[12]);
    const v = new THREE.Vector4(elements[1], elements[5], elements[9], elements[13]);
    return new SurfaceUvMatrix(u, v);
  }

  /**
   * Restores a UV matrix from serialized row components.
   *
   * @param data Plain U/V rows.
   * @returns New UV matrix.
   */
  static fromSerialized(data: SurfaceUvMatrixSerialized): SurfaceUvMatrix {
    return new SurfaceUvMatrix(
      new THREE.Vector4(data.u[0], data.u[1], data.u[2], data.u[3]),
      new THREE.Vector4(data.v[0], data.v[1], data.v[2], data.v[3]),
    );
  }

  /**
   * Projects a position into UV coordinates.
   *
   * @param position Point in the space this matrix is defined for.
   * @returns UV pair.
   */
  project(position: THREE.Vector3): { u: number; v: number } {
    return {
      u: this.u.x * position.x + this.u.y * position.y + this.u.z * position.z + this.u.w,
      v: this.v.x * position.x + this.v.y * position.y + this.v.z * position.z + this.v.w,
    };
  }

  /**
   * Expands this UV matrix into a 4×4 transform (rows U, V, plane normal, 0).
   *
   * @returns Matrix suitable for homogeneous multiply.
   */
  toMatrix4(): THREE.Matrix4 {
    const normal = this.planeNormal();
    const matrix = new THREE.Matrix4();
    matrix.set(
      this.u.x,
      this.u.y,
      this.u.z,
      this.u.w,
      this.v.x,
      this.v.y,
      this.v.z,
      this.v.w,
      normal.x,
      normal.y,
      normal.z,
      0,
      0,
      0,
      0,
      1,
    );
    return matrix;
  }

  /**
   * Unit normal implied by U × V (falls back to +Y when degenerate). Negative U
   * or V scale flips this normal; use {@link planeNormalAlignedTo} when the
   * geometric face side must be preserved for TRS decompose.
   *
   * @returns Unit plane normal.
   */
  planeNormal(): THREE.Vector3 {
    const normal = new THREE.Vector3(
      this.u.y * this.v.z - this.u.z * this.v.y,
      this.u.z * this.v.x - this.u.x * this.v.z,
      this.u.x * this.v.y - this.u.y * this.v.x,
    );
    if (normal.lengthSq() < 1e-20) {
      return new THREE.Vector3(0, 1, 0);
    }
    return normal.normalize();
  }

  /**
   * Returns the UV plane normal oriented onto the same side as a preferred face
   * normal. Mirroring (negative scale) flips U×V; TRS extract must stay on the
   * authored face side so scale signs round-trip (Chisel UVMatrix Decompose
   * recovers signed scale against a stable orientation).
   *
   * @param preferredNormal Geometric face or projection normal.
   * @returns Unit normal for TRS decompose.
   */
  planeNormalAlignedTo(preferredNormal: THREE.Vector3): THREE.Vector3 {
    const preferred = preferredNormal.clone().normalize();
    if (preferred.lengthSq() < 1e-20) {
      return this.planeNormal();
    }
    const plane = this.planeNormal();
    if (plane.dot(preferred) < 0) {
      return plane.multiplyScalar(-1);
    }
    return plane;
  }

  /**
   * Decomposes this matrix into translation, rotation, and signed scale
   * relative to a face normal. Scale is UV units per world unit (inverse of
   * meters-per-tile). Negative scale mirrors that axis (Chisel UVMatrix sign
   * recovery: prefer rotation in (−90°, 90°] and put 180° flips into scale).
   *
   * @param faceNormal Face normal used for the plane orientation.
   * @returns Decomposed TRS parameters.
   */
  decompose(faceNormal: THREE.Vector3): SurfaceUvMatrixTrs {
    const uDirection = new THREE.Vector3(this.u.x, this.u.y, this.u.z);
    const vDirection = new THREE.Vector3(this.v.x, this.v.y, this.v.z);
    const magnitudes = measureRowMagnitudes(uDirection, vDirection);
    const fullRotationDeg = measureUAxisRotationDegrees(uDirection, faceNormal);
    const folded = foldRotationIntoSignedScale(fullRotationDeg, magnitudes.scaleU);
    const scaleV = signedScaleAgainstAxis(vDirection, faceNormal, folded.rotationDeg, 'v');
    return {
      translation: new THREE.Vector2(
        quantize(this.u.w, TRANSLATION_SNAP_STEP),
        quantize(this.v.w, TRANSLATION_SNAP_STEP),
      ),
      rotationDeg: quantize(folded.rotationDeg, ROTATION_SNAP_STEP),
      scaleU: enforceMinScale(folded.scaleU),
      scaleV: enforceMinScale(scaleV),
    };
  }

  /**
   * Multiplies this UV matrix on the right by a 4×4 transform: result = this *
   * other. Used when positions are first transformed then projected.
   *
   * @param other Right-hand transform applied to positions before projection.
   * @returns New UV matrix.
   */
  multiplyMatrix4(other: THREE.Matrix4): SurfaceUvMatrix {
    return new SurfaceUvMatrix(
      SurfaceUvMatrix.rowTimes(this.u, other, scratchRowU),
      SurfaceUvMatrix.rowTimes(this.v, other, scratchRowV),
    );
  }

  /**
   * Multiplies a row vector by a 4×4 matrix, summing in the same order as a
   * full matrix product so results are identical.
   *
   * @param row Row vector.
   * @param matrix Right-hand matrix.
   * @param target Receives the product.
   * @returns The target.
   */
  private static rowTimes(row: THREE.Vector4, matrix: THREE.Matrix4, target: THREE.Vector4): THREE.Vector4 {
    const b = matrix.elements;
    return target.set(
      row.x * (b[0] as number) + row.y * (b[1] as number) + row.z * (b[2] as number) + row.w * (b[3] as number),
      row.x * (b[4] as number) + row.y * (b[5] as number) + row.z * (b[6] as number) + row.w * (b[7] as number),
      row.x * (b[8] as number) + row.y * (b[9] as number) + row.z * (b[10] as number) + row.w * (b[11] as number),
      row.x * (b[12] as number) + row.y * (b[13] as number) + row.z * (b[14] as number) + row.w * (b[15] as number),
    );
  }

  /**
   * Returns an independent copy.
   *
   * @returns Cloned matrix.
   */
  clone(): SurfaceUvMatrix {
    return new SurfaceUvMatrix(this.u, this.v);
  }

  /**
   * Serializes U/V rows for persistence.
   *
   * @returns Plain arrays.
   */
  serialize(): SurfaceUvMatrixSerialized {
    return {
      u: [this.u.x, this.u.y, this.u.z, this.u.w],
      v: [this.v.x, this.v.y, this.v.z, this.v.w],
    };
  }

  /**
   * Equality within a small epsilon.
   *
   * @param other Matrix to compare.
   * @param epsilon Component tolerance.
   * @returns True when all components match.
   */
  equals(other: SurfaceUvMatrix, epsilon: number = 1e-6): boolean {
    return rowsClose(this.u, other.u, epsilon) && rowsClose(this.v, other.v, epsilon);
  }

  /** Resets to identity when any component is non-finite. */
  private sanitizeIfInvalid(): void {
    if (isFiniteRow(this.u) && isFiniteRow(this.v)) return;
    this.u.set(1, 0, 0, 0);
    this.v.set(0, 1, 0, 0);
  }
}

/** Decomposed translation / rotation / scale of a surface UV matrix. */
export interface SurfaceUvMatrixTrs {
  translation: THREE.Vector2;
  rotationDeg: number;
  /** Signed U matrix scale (negative mirrors U). */
  scaleU: number;
  /** Signed V matrix scale (negative mirrors V). */
  scaleV: number;
}

/** JSON-friendly U/V rows. */
export interface SurfaceUvMatrixSerialized {
  u: [number, number, number, number];
  v: [number, number, number, number];
}

/** Floor/ceiling threshold for U-seed selection (matches planar projector). */
const FLOOR_NORMAL_DOT = 0.9;

/**
 * Builds a stable face-plane U/V basis (walls: horizontal U, upward V).
 *
 * @param faceNormal Unit face normal.
 * @param rotationDeg Rotation around the normal in degrees.
 * @returns Unit U and V axes.
 */
function buildStableFaceBasis(
  faceNormal: THREE.Vector3,
  rotationDeg: number,
): { uAxis: THREE.Vector3; vAxis: THREE.Vector3 } {
  const normal = faceNormal.clone().normalize();
  if (normal.lengthSq() < 1e-20) {
    return { uAxis: new THREE.Vector3(1, 0, 0), vAxis: new THREE.Vector3(0, 0, 1) };
  }
  const uAxis = pickStableUAxis(normal);
  const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();
  uAxis.crossVectors(vAxis, normal).normalize();
  if (Math.abs(rotationDeg) > 1e-8) {
    const quat = new THREE.Quaternion().setFromAxisAngle(normal, THREE.MathUtils.degToRad(rotationDeg));
    uAxis.applyQuaternion(quat);
    vAxis.applyQuaternion(quat);
  }
  return { uAxis, vAxis };
}

/**
 * Chooses a stable U seed: world X on floors, wall-horizontal on walls.
 *
 * @param normal Projection normal.
 * @returns Unit U seed.
 */
function pickStableUAxis(normal: THREE.Vector3): THREE.Vector3 {
  if (Math.abs(normal.y) > FLOOR_NORMAL_DOT) {
    return new THREE.Vector3(1, 0, 0);
  }
  const horizontal = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal);
  if (horizontal.lengthSq() < 1e-12) {
    return new THREE.Vector3(1, 0, 0);
  }
  return horizontal.normalize();
}

/**
 * Enforces a non-zero minimum absolute scale while preserving sign.
 *
 * @param scale Input scale.
 * @returns Safe scale.
 */
function enforceMinScale(scale: number): number {
  if (!Number.isFinite(scale)) return SURFACE_UV_MIN_SCALE;
  if (Math.abs(scale) < SURFACE_UV_MIN_SCALE) {
    return scale < 0 ? -SURFACE_UV_MIN_SCALE : SURFACE_UV_MIN_SCALE;
  }
  return scale;
}

/**
 * Measures positive row magnitudes for U and V direction vectors.
 *
 * @param uDirection U row xyz.
 * @param vDirection V row xyz.
 * @returns Positive scales before sign recovery.
 */
function measureRowMagnitudes(
  uDirection: THREE.Vector3,
  vDirection: THREE.Vector3,
): { scaleU: number; scaleV: number } {
  return {
    scaleU: enforceMinScale(uDirection.length()),
    scaleV: enforceMinScale(vDirection.length()),
  };
}

/**
 * Measures full U-axis rotation relative to the unrotated face basis (−180°,
 * 180°].
 *
 * @param uDirection U row xyz.
 * @param faceNormal Face normal for the basis.
 * @returns Rotation degrees of the U direction.
 */
function measureUAxisRotationDegrees(uDirection: THREE.Vector3, faceNormal: THREE.Vector3): number {
  if (uDirection.lengthSq() < 1e-20) {
    return 0;
  }
  const reference = buildStableFaceBasis(faceNormal, 0);
  const uUnit = uDirection.clone().normalize();
  const cos = Math.max(-1, Math.min(1, uUnit.dot(reference.uAxis)));
  const sin = uUnit.dot(reference.vAxis);
  return THREE.MathUtils.radToDeg(Math.atan2(sin, cos));
}

/**
 * Folds 180° U flips into negative scale so rotation stays in (−90°, 90°],
 * matching Chisel UVMatrix intent to recover negative scale instead of
 * absorbing it into rotation.
 *
 * @param fullRotationDeg Full U-axis rotation (−180°, 180°].
 * @param positiveScaleU Positive U magnitude.
 * @returns Folded rotation and signed U scale.
 */
function foldRotationIntoSignedScale(
  fullRotationDeg: number,
  positiveScaleU: number,
): { rotationDeg: number; scaleU: number } {
  let rotationDeg = fullRotationDeg;
  let scaleU = positiveScaleU;
  if (rotationDeg > 90) {
    rotationDeg -= 180;
    scaleU = -scaleU;
  } else if (rotationDeg <= -90) {
    rotationDeg += 180;
    scaleU = -scaleU;
  }
  return { rotationDeg, scaleU };
}

/**
 * Returns signed scale for a row against the rotated face basis axis.
 *
 * @param direction Row xyz direction.
 * @param faceNormal Face normal for the basis.
 * @param rotationDeg Folded rotation degrees.
 * @param axis Which basis axis to test.
 * @returns Signed scale with magnitude of the direction.
 */
function signedScaleAgainstAxis(
  direction: THREE.Vector3,
  faceNormal: THREE.Vector3,
  rotationDeg: number,
  axis: 'u' | 'v',
): number {
  const magnitude = enforceMinScale(direction.length());
  if (direction.lengthSq() < 1e-20) {
    return magnitude;
  }
  const basis = buildStableFaceBasis(faceNormal, rotationDeg);
  const axisVector = axis === 'u' ? basis.uAxis : basis.vAxis;
  return direction.dot(axisVector) < 0 ? -magnitude : magnitude;
}

/**
 * Quantizes a value to a step size.
 *
 * @param value Input value.
 * @param step Quantization step.
 * @returns Quantized value.
 */
function quantize(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Returns whether a Vector4 has all finite components.
 *
 * @param row Row to test.
 * @returns True when finite.
 */
function isFiniteRow(row: THREE.Vector4): boolean {
  return Number.isFinite(row.x) && Number.isFinite(row.y) && Number.isFinite(row.z) && Number.isFinite(row.w);
}

/**
 * Compares two Vector4 rows within epsilon.
 *
 * @param a First row.
 * @param b Second row.
 * @param epsilon Tolerance.
 * @returns True when close.
 */
function rowsClose(a: THREE.Vector4, b: THREE.Vector4, epsilon: number): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.z - b.z) <= epsilon &&
    Math.abs(a.w - b.w) <= epsilon
  );
}
