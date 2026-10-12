import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';

/** Positions, face loops, and corner UVs for one sphere. */
interface SphereAssembly {
  positions: number[];
  faces: number[][];
  cornerUvs: number[];
}

/**
 * Builds a Y-up UV sphere. Longitude samples are not duplicated at the seam,
 * and each pole is one vertex. Corner UVs still run from 0 to 1 around the
 * shell.
 *
 * @param radius Sphere radius.
 * @param widthSegments Longitude segments (minimum 3).
 * @param heightSegments Latitude segments (minimum 2).
 * @returns Mesh document for a closed sphere shell.
 */
export function createMeshDocumentSphere(
  radius: number = 0.5,
  widthSegments: number = 32,
  heightSegments: number = 16,
): MeshDocument {
  const segmentsX = Math.max(3, Math.floor(widthSegments));
  const segmentsY = Math.max(2, Math.floor(heightSegments));
  const assembly = assembleSphere(radius, segmentsX, segmentsY);
  return meshDocumentFromPolygonList(
    Float32Array.from(assembly.positions),
    assembly.faces,
    Float32Array.from(assembly.cornerUvs),
  );
}

/**
 * Fills poles, latitude rings, and the faces between them.
 *
 * @param radius Sphere radius.
 * @param segmentsX Longitude segments.
 * @param segmentsY Latitude segments.
 * @returns Assembly buffers.
 */
function assembleSphere(radius: number, segmentsX: number, segmentsY: number): SphereAssembly {
  const assembly = createEmptySphereAssembly();
  appendSphereVertices(assembly, radius, segmentsX, segmentsY);
  appendNorthCap(assembly, segmentsX, segmentsY);
  appendSphereQuads(assembly, segmentsX, segmentsY);
  appendSouthCap(assembly, segmentsX, segmentsY);
  return assembly;
}

/**
 * Creates empty sphere buffers.
 *
 * @returns Empty assembly.
 */
function createEmptySphereAssembly(): SphereAssembly {
  return { positions: [], faces: [], cornerUvs: [] };
}

/**
 * Appends one north pole, unique latitude rings, and one south pole.
 *
 * @param assembly Assembly to fill.
 * @param radius Sphere radius.
 * @param segmentsX Longitude segments.
 * @param segmentsY Latitude segments.
 */
function appendSphereVertices(assembly: SphereAssembly, radius: number, segmentsX: number, segmentsY: number): void {
  appendPole(assembly, radius, 0);
  for (let y = 1; y < segmentsY; y++) {
    appendLatitudeRing(assembly, radius, segmentsX, segmentsY, y);
  }
  appendPole(assembly, radius, Math.PI);
}

/**
 * Appends one pole vertex. Poles have no azimuth, so one vertex is enough.
 *
 * @param assembly Assembly to fill.
 * @param radius Sphere radius.
 * @param polar Polar angle, 0 at +Y and pi at -Y.
 */
function appendPole(assembly: SphereAssembly, radius: number, polar: number): void {
  assembly.positions.push(0, radius * Math.cos(polar), 0);
}

/**
 * Appends one latitude ring without repeating the seam vertex.
 *
 * @param assembly Assembly to fill.
 * @param radius Sphere radius.
 * @param segmentsX Longitude segments.
 * @param segmentsY Latitude segments.
 * @param y Latitude index from 1 through segmentsY - 1.
 */
function appendLatitudeRing(
  assembly: SphereAssembly,
  radius: number,
  segmentsX: number,
  segmentsY: number,
  y: number,
): void {
  const polar = (y / segmentsY) * Math.PI;
  const sinPolar = Math.sin(polar);
  const yPosition = radius * Math.cos(polar);
  for (let x = 0; x < segmentsX; x++) {
    const azimuth = (x / segmentsX) * Math.PI * 2;
    assembly.positions.push(radius * sinPolar * Math.cos(azimuth), yPosition, radius * sinPolar * Math.sin(azimuth));
  }
}

/**
 * Appends the north fan. Each triangle keeps the old a, d, c winding.
 *
 * @param assembly Assembly to fill.
 * @param segmentsX Longitude segments.
 * @param segmentsY Latitude segments.
 */
function appendNorthCap(assembly: SphereAssembly, segmentsX: number, segmentsY: number): void {
  for (let x = 0; x < segmentsX; x++) {
    appendNorthSector(assembly, segmentsX, segmentsY, x);
  }
}

/**
 * Appends one north-pole triangle and its corner UVs.
 *
 * @param assembly Assembly to fill.
 * @param segmentsX Longitude segments.
 * @param segmentsY Latitude segments.
 * @param x Longitude index.
 */
function appendNorthSector(assembly: SphereAssembly, segmentsX: number, segmentsY: number, x: number): void {
  const next = (x + 1) % segmentsX;
  assembly.faces.push([0, latitudeIndex(segmentsX, 1, next), latitudeIndex(segmentsX, 1, x)]);
  pushCornerUv(assembly, x / segmentsX, latitudeV(segmentsY, 0));
  pushCornerUv(assembly, (x + 1) / segmentsX, latitudeV(segmentsY, 1));
  pushCornerUv(assembly, x / segmentsX, latitudeV(segmentsY, 1));
}

/**
 * Appends quads between consecutive latitude rings.
 *
 * @param assembly Assembly to fill.
 * @param segmentsX Longitude segments.
 * @param segmentsY Latitude segments.
 */
function appendSphereQuads(assembly: SphereAssembly, segmentsX: number, segmentsY: number): void {
  for (let y = 1; y < segmentsY - 1; y++) {
    for (let x = 0; x < segmentsX; x++) {
      appendSphereQuad(assembly, segmentsX, segmentsY, y, x);
    }
  }
}

/**
 * Appends one outward quad. Corner order matches triangles a,b,d and a,d,c.
 *
 * @param assembly Assembly to fill.
 * @param segmentsX Longitude segments.
 * @param segmentsY Latitude segments.
 * @param y Northern latitude index of the quad.
 * @param x Longitude index.
 */
function appendSphereQuad(assembly: SphereAssembly, segmentsX: number, segmentsY: number, y: number, x: number): void {
  const next = (x + 1) % segmentsX;
  assembly.faces.push([
    latitudeIndex(segmentsX, y, x),
    latitudeIndex(segmentsX, y, next),
    latitudeIndex(segmentsX, y + 1, next),
    latitudeIndex(segmentsX, y + 1, x),
  ]);
  appendQuadUvs(assembly, segmentsX, segmentsY, y, x);
}

/**
 * Writes the four corner UVs of one quad, with U wrapping to 1 on the seam.
 *
 * @param assembly Assembly to fill.
 * @param segmentsX Longitude segments.
 * @param segmentsY Latitude segments.
 * @param y Northern latitude index.
 * @param x Longitude index.
 */
function appendQuadUvs(assembly: SphereAssembly, segmentsX: number, segmentsY: number, y: number, x: number): void {
  const u0 = x / segmentsX;
  const u1 = (x + 1) / segmentsX;
  const v0 = latitudeV(segmentsY, y);
  const v1 = latitudeV(segmentsY, y + 1);
  pushCornerUv(assembly, u0, v0);
  pushCornerUv(assembly, u1, v0);
  pushCornerUv(assembly, u1, v1);
  pushCornerUv(assembly, u0, v1);
}

/**
 * Appends the south fan. Each triangle keeps the old a, b, d winding.
 *
 * @param assembly Assembly to fill.
 * @param segmentsX Longitude segments.
 * @param segmentsY Latitude segments.
 */
function appendSouthCap(assembly: SphereAssembly, segmentsX: number, segmentsY: number): void {
  for (let x = 0; x < segmentsX; x++) {
    appendSouthSector(assembly, segmentsX, segmentsY, x);
  }
}

/**
 * Appends one south-pole triangle and its corner UVs.
 *
 * @param assembly Assembly to fill.
 * @param segmentsX Longitude segments.
 * @param segmentsY Latitude segments.
 * @param x Longitude index.
 */
function appendSouthSector(assembly: SphereAssembly, segmentsX: number, segmentsY: number, x: number): void {
  const next = (x + 1) % segmentsX;
  const south = latitudeIndex(segmentsX, segmentsY, 0);
  assembly.faces.push([
    latitudeIndex(segmentsX, segmentsY - 1, x),
    latitudeIndex(segmentsX, segmentsY - 1, next),
    south,
  ]);
  pushCornerUv(assembly, x / segmentsX, latitudeV(segmentsY, segmentsY - 1));
  pushCornerUv(assembly, (x + 1) / segmentsX, latitudeV(segmentsY, segmentsY - 1));
  pushCornerUv(assembly, (x + 1) / segmentsX, latitudeV(segmentsY, segmentsY));
}

/**
 * Returns the vertex index of a latitude sample. Row 0 is the north pole and
 * row segmentsY is the south pole.
 *
 * @param segmentsX Longitude segments.
 * @param y Latitude index.
 * @param x Longitude index, ignored at the poles.
 * @returns Vertex index.
 */
function latitudeIndex(segmentsX: number, y: number, x: number): number {
  if (y <= 0) {
    return 0;
  }
  return 1 + (y - 1) * segmentsX + x;
}

/**
 * Returns the spherical V coordinate, 1 at the north pole and 0 at the south.
 *
 * @param segmentsY Latitude segments.
 * @param y Latitude index.
 * @returns V coordinate.
 */
function latitudeV(segmentsY: number, y: number): number {
  return 1 - y / segmentsY;
}

/**
 * Appends one corner UV pair.
 *
 * @param assembly Assembly to fill.
 * @param u U coordinate.
 * @param v V coordinate.
 */
function pushCornerUv(assembly: SphereAssembly, u: number, v: number): void {
  assembly.cornerUvs.push(u, v);
}
