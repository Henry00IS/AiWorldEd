import * as THREE from 'three';
import {
  FaceTextureAlign,
  FaceTextureMapping,
  createDefaultFaceTextureMapping
} from './face_texture_mapping.js';
import { getFaceTextureMaps } from './face_texture_storage.js';

/**
 * Orthonormal U/V axes for planar projection in world space.
 */
export interface ProjectionBasis {
  uAxis: THREE.Vector3;
  vAxis: THREE.Vector3;
  normal: THREE.Vector3;
}

const scratchNormal = new THREE.Vector3();
const scratchU = new THREE.Vector3();
const scratchV = new THREE.Vector3();
const scratchWorld = new THREE.Vector3();
const scratchLocal = new THREE.Vector3();

/**
 * Resolves the projection normal for a face from its geometric normal and align mode.
 * @param faceNormal Unit face normal in world space.
 * @param align Align preset.
 * @returns Unit projection normal.
 */
export function resolveProjectionNormal(
  faceNormal: THREE.Vector3,
  align: FaceTextureAlign
): THREE.Vector3 {
  if (align === 'floor') return new THREE.Vector3(0, 1, 0);
  if (align === 'ceiling') return new THREE.Vector3(0, -1, 0);
  if (align === 'wall') return resolveWallNormal(faceNormal);
  if (align === 'face') return faceNormal.clone().normalize();
  return resolveAutoNormal(faceNormal);
}

/**
 * Picks the dominant world axis of a face normal (auto align).
 * @param faceNormal Face normal in world space.
 * @returns Unit axis normal.
 */
function resolveAutoNormal(faceNormal: THREE.Vector3): THREE.Vector3 {
  const ax = Math.abs(faceNormal.x);
  const ay = Math.abs(faceNormal.y);
  const az = Math.abs(faceNormal.z);
  if (ay >= ax && ay >= az) {
    return new THREE.Vector3(0, faceNormal.y >= 0 ? 1 : -1, 0);
  }
  if (ax >= az) {
    return new THREE.Vector3(faceNormal.x >= 0 ? 1 : -1, 0, 0);
  }
  return new THREE.Vector3(0, 0, faceNormal.z >= 0 ? 1 : -1);
}

/**
 * Picks a horizontal projection normal for wall alignment.
 * @param faceNormal Face normal in world space.
 * @returns Unit wall normal (world X or Z).
 */
function resolveWallNormal(faceNormal: THREE.Vector3): THREE.Vector3 {
  if (Math.abs(faceNormal.x) >= Math.abs(faceNormal.z)) {
    return new THREE.Vector3(faceNormal.x >= 0 ? 1 : -1, 0, 0);
  }
  return new THREE.Vector3(0, 0, faceNormal.z >= 0 ? 1 : -1);
}

/**
 * Builds U/V axes on the plane of the projection normal with optional rotation.
 * @param projectionNormal Unit projection normal.
 * @param rotationDeg Rotation around the normal in degrees.
 * @returns Projection basis.
 */
export function buildProjectionBasis(
  projectionNormal: THREE.Vector3,
  rotationDeg: number
): ProjectionBasis {
  const normal = projectionNormal.clone().normalize();
  const uAxis = pickStableUAxis(normal);
  const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();
  uAxis.crossVectors(vAxis, normal).normalize();
  applyRotationAroundNormal(uAxis, vAxis, normal, rotationDeg);
  return { uAxis, vAxis, normal };
}

/**
 * Chooses a stable U reference axis that is not parallel to the normal.
 * @param normal Projection normal.
 * @returns Unit U seed before orthonormalization.
 */
function pickStableUAxis(normal: THREE.Vector3): THREE.Vector3 {
  const absY = Math.abs(normal.y);
  if (absY > 0.9) {
    return new THREE.Vector3(1, 0, 0);
  }
  return new THREE.Vector3(0, 1, 0);
}

/**
 * Rotates U and V around the normal by the given degrees.
 * @param uAxis U axis (modified in place).
 * @param vAxis V axis (modified in place).
 * @param normal Rotation axis.
 * @param rotationDeg Degrees.
 */
function applyRotationAroundNormal(
  uAxis: THREE.Vector3,
  vAxis: THREE.Vector3,
  normal: THREE.Vector3,
  rotationDeg: number
): void {
  if (Math.abs(rotationDeg) < 1e-8) return;
  const radians = THREE.MathUtils.degToRad(rotationDeg);
  const quat = new THREE.Quaternion().setFromAxisAngle(normal, radians);
  uAxis.applyQuaternion(quat);
  vAxis.applyQuaternion(quat);
}

/**
 * Projects a world position into UV using a basis and mapping params.
 * @param worldPos World-space vertex position.
 * @param basis Projection basis.
 * @param mapping Scale and offset.
 * @returns UV pair.
 */
export function projectWorldPositionToUv(
  worldPos: THREE.Vector3,
  basis: ProjectionBasis,
  mapping: FaceTextureMapping
): { u: number; v: number } {
  const scaleU = mapping.scaleU === 0 ? 1 : mapping.scaleU;
  const scaleV = mapping.scaleV === 0 ? 1 : mapping.scaleV;
  const u = (worldPos.dot(basis.uAxis) - mapping.offsetU) / scaleU;
  const v = (worldPos.dot(basis.vAxis) - mapping.offsetV) / scaleV;
  return { u, v };
}

/**
 * Ensures the geometry has a writable UV attribute matching vertex count.
 * @param geometry Buffer geometry to prepare.
 * @returns The UV attribute.
 */
export function ensureUvAttribute(
  geometry: THREE.BufferGeometry
): THREE.BufferAttribute {
  const position = geometry.getAttribute('position');
  const vertexCount = position.count;
  const existing = geometry.getAttribute('uv');
  if (existing && existing.count === vertexCount) {
    return existing as THREE.BufferAttribute;
  }
  const uvArray = new Float32Array(vertexCount * 2);
  const attribute = new THREE.BufferAttribute(uvArray, 2);
  geometry.setAttribute('uv', attribute);
  return attribute;
}

/**
 * Computes the average world-space normal of the given triangle indices.
 * @param mesh Mesh providing geometry and world matrix.
 * @param triangleIndices Triangle indices to average.
 * @returns Unit world normal (defaults to +Y when empty).
 */
export function computeRegionWorldNormal(
  mesh: THREE.Mesh,
  triangleIndices: number[]
): THREE.Vector3 {
  mesh.updateMatrixWorld(true);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const accumulator = new THREE.Vector3();
  triangleIndices.forEach((faceIndex) => {
    const local = computeLocalTriangleNormal(mesh.geometry, faceIndex);
    local.applyMatrix3(normalMatrix).normalize();
    accumulator.add(local);
  });
  if (accumulator.lengthSq() < 1e-12) return new THREE.Vector3(0, 1, 0);
  return accumulator.normalize();
}

/**
 * Computes a local-space triangle normal from geometry.
 * @param geometry Mesh geometry.
 * @param faceIndex Triangle index.
 * @returns Local normal (not normalized if degenerate).
 */
function computeLocalTriangleNormal(
  geometry: THREE.BufferGeometry,
  faceIndex: number
): THREE.Vector3 {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const ia = index ? index.getX(faceIndex * 3) : faceIndex * 3;
  const ib = index ? index.getX(faceIndex * 3 + 1) : faceIndex * 3 + 1;
  const ic = index ? index.getX(faceIndex * 3 + 2) : faceIndex * 3 + 2;
  const a = scratchLocal.fromBufferAttribute(position, ia).clone();
  const b = new THREE.Vector3().fromBufferAttribute(position, ib);
  const c = new THREE.Vector3().fromBufferAttribute(position, ic);
  return new THREE.Vector3()
    .subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a))
    .normalize();
}

/**
 * Bakes planar UVs for one coplanar triangle region on a mesh.
 * @param mesh Target mesh.
 * @param triangleIndices Region triangles.
 * @param mapping Texture mapping parameters.
 */
export function bakeFaceUVs(
  mesh: THREE.Mesh,
  triangleIndices: number[],
  mapping: FaceTextureMapping
): void {
  mesh.updateMatrixWorld(true);
  const faceNormal = computeRegionWorldNormal(mesh, triangleIndices);
  const projectionNormal = resolveProjectionNormal(faceNormal, mapping.align);
  const basis = buildProjectionBasis(projectionNormal, mapping.rotationDeg);
  const uv = ensureUvAttribute(mesh.geometry);
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const written = new Set<number>();
  triangleIndices.forEach((faceIndex) => {
    writeTriangleUvs(
      mesh,
      faceIndex,
      index,
      position,
      uv,
      basis,
      mapping,
      written
    );
  });
  uv.needsUpdate = true;
}

/**
 * Writes UV for the three vertices of one triangle.
 * @param mesh Mesh for world transform.
 * @param faceIndex Triangle index.
 * @param index Optional index buffer.
 * @param position Position attribute.
 * @param uv UV attribute.
 * @param basis Projection basis.
 * @param mapping Mapping params.
 * @param written Set of vertex indices already written this bake.
 */
function writeTriangleUvs(
  mesh: THREE.Mesh,
  faceIndex: number,
  index: THREE.BufferAttribute | null,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  uv: THREE.BufferAttribute,
  basis: ProjectionBasis,
  mapping: FaceTextureMapping,
  written: Set<number>
): void {
  for (let corner = 0; corner < 3; corner++) {
    const vertexIndex = index
      ? index.getX(faceIndex * 3 + corner)
      : faceIndex * 3 + corner;
    if (written.has(vertexIndex)) continue;
    written.add(vertexIndex);
    scratchLocal.fromBufferAttribute(position, vertexIndex);
    scratchWorld.copy(scratchLocal).applyMatrix4(mesh.matrixWorld);
    const coords = projectWorldPositionToUv(scratchWorld, basis, mapping);
    uv.setXY(vertexIndex, coords.u, coords.v);
  }
}

/**
 * Bakes default auto-mapped UVs for every triangle on a mesh.
 * @param mesh Target mesh.
 * @param mapping Optional mapping override (defaults to auto 1 m).
 */
export function bakeAllFacesDefaultUVs(
  mesh: THREE.Mesh,
  mapping: FaceTextureMapping = createDefaultFaceTextureMapping()
): void {
  const triangleCount = countTriangles(mesh.geometry);
  const allIndices: number[] = [];
  for (let i = 0; i < triangleCount; i++) allIndices.push(i);
  const regions = splitIntoCoplanarRegions(mesh, allIndices);
  regions.forEach((region) => {
    bakeFaceUVs(mesh, region, mapping);
  });
}

/**
 * Counts triangles in a buffer geometry.
 * @param geometry Geometry to inspect.
 * @returns Triangle count.
 */
export function countTriangles(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return Math.floor(index.count / 3);
  const position = geometry.getAttribute('position');
  return position ? Math.floor(position.count / 3) : 0;
}

/**
 * Splits every triangle on a mesh into coplanar regions.
 * @param mesh Mesh to analyze.
 * @returns Arrays of coplanar triangle indices.
 */
export function splitMeshIntoCoplanarRegions(mesh: THREE.Mesh): number[][] {
  const triangleCount = countTriangles(mesh.geometry);
  const allIndices: number[] = [];
  for (let i = 0; i < triangleCount; i++) allIndices.push(i);
  return splitIntoCoplanarRegions(mesh, allIndices);
}

/**
 * Splits triangle indices into coplanar regions using normals and plane tests.
 * @param mesh Mesh geometry owner.
 * @param triangleIndices Triangles to group.
 * @returns Arrays of coplanar triangle indices.
 */
export function splitIntoCoplanarRegions(
  mesh: THREE.Mesh,
  triangleIndices: number[]
): number[][] {
  const remaining = new Set(triangleIndices);
  const regions: number[][] = [];
  const sorted = triangleIndices.slice().sort((a, b) => a - b);
  sorted.forEach((seed) => {
    if (!remaining.has(seed)) return;
    const region = [seed];
    remaining.delete(seed);
    const seedNormal = computeLocalTriangleNormal(mesh.geometry, seed);
    const seedPoint = getTriangleCentroid(mesh.geometry, seed);
    triangleIndices.forEach((candidate) => {
      if (!remaining.has(candidate)) return;
      if (!isCoplanar(mesh.geometry, candidate, seedNormal, seedPoint)) return;
      region.push(candidate);
      remaining.delete(candidate);
    });
    regions.push(region.sort((a, b) => a - b));
  });
  return regions;
}

/**
 * Returns whether a triangle shares the seed plane.
 * @param geometry Geometry.
 * @param faceIndex Candidate triangle.
 * @param seedNormal Seed normal.
 * @param seedPoint Point on seed plane.
 * @returns True when coplanar with matching normal.
 */
function isCoplanar(
  geometry: THREE.BufferGeometry,
  faceIndex: number,
  seedNormal: THREE.Vector3,
  seedPoint: THREE.Vector3
): boolean {
  const normal = computeLocalTriangleNormal(geometry, faceIndex);
  if (Math.abs(normal.dot(seedNormal)) < 0.995) return false;
  const centroid = getTriangleCentroid(geometry, faceIndex);
  return Math.abs(centroid.sub(seedPoint).dot(seedNormal)) <= 1e-3;
}

/**
 * Computes the centroid of a triangle in local space.
 * @param geometry Geometry.
 * @param faceIndex Triangle index.
 * @returns Local centroid.
 */
function getTriangleCentroid(
  geometry: THREE.BufferGeometry,
  faceIndex: number
): THREE.Vector3 {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const ia = index ? index.getX(faceIndex * 3) : faceIndex * 3;
  const ib = index ? index.getX(faceIndex * 3 + 1) : faceIndex * 3 + 1;
  const ic = index ? index.getX(faceIndex * 3 + 2) : faceIndex * 3 + 2;
  const a = new THREE.Vector3().fromBufferAttribute(position, ia);
  const b = new THREE.Vector3().fromBufferAttribute(position, ib);
  const c = new THREE.Vector3().fromBufferAttribute(position, ic);
  return a.add(b).add(c).multiplyScalar(1 / 3);
}

/**
 * Re-bakes all stored face texture maps on a mesh; fills gaps with defaults.
 * @param mesh Target mesh.
 */
export function rebakeStoredFaceTextureMaps(mesh: THREE.Mesh): void {
  const entries = getFaceTextureMaps(mesh);
  if (entries.length === 0) {
    bakeAllFacesDefaultUVs(mesh);
    return;
  }
  entries.forEach((entry) => {
    bakeFaceUVs(mesh, entry.triangleIndices, entry.mapping);
  });
}

/**
 * Builds a lookup from triangle index to mapping for CSG export.
 * @param mesh Source mesh.
 * @returns Map of triangle index → mapping (defaults filled for unmapped).
 */
export function buildTriangleMappingLookup(
  mesh: THREE.Mesh
): Map<number, FaceTextureMapping> {
  const lookup = new Map<number, FaceTextureMapping>();
  const entries = getFaceTextureMaps(mesh);
  entries.forEach((entry) => {
    entry.triangleIndices.forEach((index) => {
      lookup.set(index, entry.mapping);
    });
  });
  return lookup;
}

// Silence unused scratch warnings in some bundlers by referencing once.
void scratchNormal;
void scratchU;
void scratchV;
