import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshDocumentFromPolygonList } from '@/mesh/convert/mesh_from_polygon_list.js';

/** Radius below which a cap ring is a single point and is omitted. */
const CYLINDER_CAP_RADIUS_EPSILON = 1e-8;

/** Positions, face loops, and corner UVs for one cylinder. */
interface CylinderAssembly {
  positions: number[];
  faces: number[][];
  cornerUvs: number[];
}

/**
 * Builds a Y-up cylinder mesh document. Side panels are outward quads. Rim
 * vertices are shared by the wall and the caps, so a closed cylinder has no
 * coincident copies.
 *
 * @param radiusTop Top radius.
 * @param radiusBottom Bottom radius.
 * @param height Cylinder height.
 * @param radialSegments Radial segments (minimum 3).
 * @param heightSegments Height segments (minimum 1).
 * @param openEnded When true, omits top and bottom caps.
 * @returns Mesh document for the cylinder.
 */
export function createMeshDocumentCylinder(
  radiusTop: number = 0.5,
  radiusBottom: number = 0.5,
  height: number = 1,
  radialSegments: number = 16,
  heightSegments: number = 1,
  openEnded: boolean = false,
): MeshDocument {
  const segments = Math.max(3, Math.floor(radialSegments));
  const stacks = Math.max(1, Math.floor(heightSegments));
  const assembly = assembleCylinder(radiusTop, radiusBottom, height, segments, stacks, openEnded);
  return meshDocumentFromPolygonList(
    Float32Array.from(assembly.positions),
    assembly.faces,
    Float32Array.from(assembly.cornerUvs),
  );
}

/**
 * Fills rings, side quads, and optional caps.
 *
 * @param radiusTop Top radius.
 * @param radiusBottom Bottom radius.
 * @param height Full height.
 * @param segments Radial segments.
 * @param stacks Height segments.
 * @param openEnded When true, omits caps.
 * @returns Assembly buffers.
 */
function assembleCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  stacks: number,
  openEnded: boolean,
): CylinderAssembly {
  const assembly = createEmptyCylinderAssembly();
  appendCylinderRings(assembly, radiusTop, radiusBottom, height, segments, stacks);
  appendCylinderSides(assembly, segments, stacks);
  appendCylinderCaps(assembly, radiusTop, radiusBottom, segments, stacks, openEnded);
  return assembly;
}

/**
 * Creates empty cylinder buffers.
 *
 * @returns Empty assembly.
 */
function createEmptyCylinderAssembly(): CylinderAssembly {
  return { positions: [], faces: [], cornerUvs: [] };
}

/**
 * Appends one unique vertex ring per height, without a duplicated seam vertex.
 *
 * @param assembly Assembly to fill.
 * @param radiusTop Top radius.
 * @param radiusBottom Bottom radius.
 * @param height Full height.
 * @param segments Radial segments.
 * @param stacks Height segments.
 */
function appendCylinderRings(
  assembly: CylinderAssembly,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  stacks: number,
): void {
  for (let stack = 0; stack <= stacks; stack++) {
    const t = stack / stacks;
    const y = -height * 0.5 + t * height;
    const radius = radiusBottom + (radiusTop - radiusBottom) * t;
    appendCylinderRing(assembly, radius, y, segments);
  }
}

/**
 * Appends one horizontal ring of distinct vertices.
 *
 * @param assembly Assembly to fill.
 * @param radius Ring radius.
 * @param y Ring height.
 * @param segments Radial segments.
 */
function appendCylinderRing(assembly: CylinderAssembly, radius: number, y: number, segments: number): void {
  for (let segment = 0; segment < segments; segment++) {
    const angle = (segment / segments) * Math.PI * 2;
    assembly.positions.push(radius * Math.cos(angle), y, radius * Math.sin(angle));
  }
}

/**
 * Appends one outward quad per side panel.
 *
 * @param assembly Assembly to fill.
 * @param segments Radial segments.
 * @param stacks Height segments.
 */
function appendCylinderSides(assembly: CylinderAssembly, segments: number, stacks: number): void {
  for (let stack = 0; stack < stacks; stack++) {
    for (let segment = 0; segment < segments; segment++) {
      appendCylinderSide(assembly, segments, stacks, stack, segment);
    }
  }
}

/**
 * Appends one outward side quad and its corner UVs.
 *
 * @param assembly Assembly to fill.
 * @param segments Radial segments.
 * @param stacks Height segments.
 * @param stack Lower ring index.
 * @param segment Radial index.
 */
function appendCylinderSide(
  assembly: CylinderAssembly,
  segments: number,
  stacks: number,
  stack: number,
  segment: number,
): void {
  assembly.faces.push(cylinderSideCorners(segments, stack, segment));
  appendSideCornerUvs(assembly, segments, stacks, stack, segment);
}

/**
 * Returns the outward corner loop of one side panel.
 *
 * @param segments Radial segments.
 * @param stack Lower ring index.
 * @param segment Radial index.
 * @returns Vertex indices in outward order.
 */
function cylinderSideCorners(segments: number, stack: number, segment: number): number[] {
  const next = (segment + 1) % segments;
  const lowerCurrent = stack * segments + segment;
  const lowerNext = stack * segments + next;
  const upperCurrent = lowerCurrent + segments;
  const upperNext = (stack + 1) * segments + next;
  return [lowerCurrent, upperCurrent, upperNext, lowerNext];
}

/**
 * Writes side UVs with U around the shell and V up the height.
 *
 * @param assembly Assembly to fill.
 * @param segments Radial segments.
 * @param stacks Height segments.
 * @param stack Lower ring index.
 * @param segment Radial index.
 */
function appendSideCornerUvs(
  assembly: CylinderAssembly,
  segments: number,
  stacks: number,
  stack: number,
  segment: number,
): void {
  const u0 = segment / segments;
  const u1 = (segment + 1) / segments;
  const v0 = stack / stacks;
  const v1 = (stack + 1) / stacks;
  pushCornerUv(assembly, u0, v0);
  pushCornerUv(assembly, u0, v1);
  pushCornerUv(assembly, u1, v1);
  pushCornerUv(assembly, u1, v0);
}

/**
 * Appends top and bottom caps when the cylinder is closed and the rim has area.
 *
 * @param assembly Assembly to fill.
 * @param radiusTop Top radius.
 * @param radiusBottom Bottom radius.
 * @param segments Radial segments.
 * @param stacks Height segments.
 * @param openEnded When true, omits caps.
 */
function appendCylinderCaps(
  assembly: CylinderAssembly,
  radiusTop: number,
  radiusBottom: number,
  segments: number,
  stacks: number,
  openEnded: boolean,
): void {
  if (openEnded) {
    return;
  }
  appendCylinderCap(assembly, stacks * segments, segments, radiusTop, true);
  appendCylinderCap(assembly, 0, segments, radiusBottom, false);
}

/**
 * Appends one cap that reuses a body ring.
 *
 * @param assembly Assembly to fill.
 * @param ringStart First vertex of the rim ring.
 * @param segments Radial segments.
 * @param radius Rim radius.
 * @param top When true, the cap faces +Y.
 */
function appendCylinderCap(
  assembly: CylinderAssembly,
  ringStart: number,
  segments: number,
  radius: number,
  top: boolean,
): void {
  if (radius <= CYLINDER_CAP_RADIUS_EPSILON) {
    return;
  }
  const loop = buildCapLoop(ringStart, segments, top);
  assembly.faces.push(loop);
  appendCapCornerUvs(assembly, loop, radius);
}

/**
 * Walks a rim so the cap normal points away from the cylinder.
 *
 * @param ringStart First vertex of the rim ring.
 * @param segments Radial segments.
 * @param top When true, walk so the normal is +Y.
 * @returns Rim vertex indices.
 */
function buildCapLoop(ringStart: number, segments: number, top: boolean): number[] {
  const loop: number[] = [];
  for (let segment = 0; segment < segments; segment++) {
    const offset = top ? (segments - segment) % segments : segment;
    loop.push(ringStart + offset);
  }
  return loop;
}

/**
 * Writes planar cap UVs from the rim XZ positions.
 *
 * @param assembly Assembly to fill.
 * @param loop Cap corner indices.
 * @param radius Rim radius used to center the projection.
 */
function appendCapCornerUvs(assembly: CylinderAssembly, loop: readonly number[], radius: number): void {
  const scale = 1 / (radius * 2);
  for (const index of loop) {
    appendOneCapUv(assembly, index, scale);
  }
}

/**
 * Writes one cap corner UV.
 *
 * @param assembly Assembly to fill.
 * @param index Vertex index.
 * @param scale XZ to UV scale.
 */
function appendOneCapUv(assembly: CylinderAssembly, index: number, scale: number): void {
  const x = assembly.positions[index * 3] ?? 0;
  const z = assembly.positions[index * 3 + 2] ?? 0;
  pushCornerUv(assembly, x * scale + 0.5, z * scale + 0.5);
}

/**
 * Appends one corner UV pair.
 *
 * @param assembly Assembly to fill.
 * @param u U coordinate.
 * @param v V coordinate.
 */
function pushCornerUv(assembly: CylinderAssembly, u: number, v: number): void {
  assembly.cornerUvs.push(u, v);
}
