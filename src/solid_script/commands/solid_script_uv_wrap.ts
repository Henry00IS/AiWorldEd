import * as THREE from 'three';
import { generatorRevolveRing, type GeneratorRevolveFrame } from '@/generator/revolve/generator_revolve_brush.js';
import { GeneratorRevolvePerimeterLayout } from '@/generator/revolve/generator_revolve_perimeter.js';
import type { GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';
import {
  generatorRevolveSurfaces,
  generatorRevolveUvLayout,
  type GeneratorRevolveWrap,
} from '@/generator/revolve/generator_revolve_surface.js';
import { modifierStackRevolveWrap } from '@/modifier/stack/kinds/generator/modifier_stack_generator_revolve_wrap.js';
import type { SolidScriptShapeSolid } from '@/solid_script/language/solid_script_shape.js';
import {
  solidScriptUvSpacePoints,
  solidScriptUvSpaceSurfaces,
  type SolidScriptUvSpaceLookup,
} from './solid_script_uv_space.js';

/** Corners closer in height than this, in repeats, share a ring. */
const SOLID_SCRIPT_UV_WRAP_LEVEL = 1e-4;

/** Upright, the way the built-in round generators stand. */
const SOLID_SCRIPT_UV_WRAP_UP = new THREE.Vector3(0, 1, 0);

/**
 * A round shape measured the way the built-in round generators measure theirs:
 * its axis upright, one unit per texture repeat.
 */
export interface SolidScriptUvWrapSpace {
  /** From script space into this space. */
  matrix: THREE.Matrix4;
  /** Side count and depth of its rings. */
  frame: GeneratorRevolveFrame;
  /** Its rings from the bottom up, as the generators list them. */
  stations: GeneratorRevolveStation[];
  /** Whole repeats around the widest ring, and square tiles along the shape. */
  wrap: GeneratorRevolveWrap;
}

/**
 * Builds the matrix into a wrap space: the center to the origin, the axis
 * upright, and one unit per repeat.
 *
 * @param axis Unit axis in script space.
 * @param center Point on the axis.
 * @param size Metres of one repeat.
 * @returns Matrix.
 */
export function solidScriptUvWrapMatrix(axis: THREE.Vector3, center: THREE.Vector3, size: number): THREE.Matrix4 {
  const turn = new THREE.Quaternion().setFromUnitVectors(axis, SOLID_SCRIPT_UV_WRAP_UP);
  return new THREE.Matrix4()
    .makeScale(1 / size, 1 / size, 1 / size)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
}

/**
 * Measures solids stacked on one axis as one round shape: its rings, side count
 * and depth, and the whole number of repeats that closes the seam.
 *
 * @param leaves Solids or meshes, in any order.
 * @param matrix From script space into the wrap space.
 * @returns Wrap space.
 */
export function solidScriptUvWrapSpace(
  leaves: readonly { points: THREE.Vector3[] }[],
  matrix: THREE.Matrix4,
): SolidScriptUvWrapSpace {
  const rings = solidScriptUvWrapLeafRings(leaves, matrix);
  const frame = solidScriptUvWrapFrame(rings.flat());
  const perimeter = new GeneratorRevolvePerimeterLayout(frame);
  const stations = solidScriptUvWrapStations(rings.flat().map((ring) => perimeter.stationOf(ring, 0)));
  const wrap = modifierStackRevolveWrap({ wrap: 'metre' }, stations, frame.sides, frame.aspect ?? 1);
  return { matrix, frame, stations, wrap };
}

/**
 * Maps the faces of one solid the way the built-in round generators wrap
 * theirs: whole repeats around, along the surface from the bottom ring up, and
 * flat ends centred on the axis.
 *
 * @param leaf Solid.
 * @param space Wrap space of the shape it belongs to.
 * @returns Mapping of a face, or null when it gets none.
 */
export function solidScriptUvWrapSurfaces(
  leaf: SolidScriptShapeSolid,
  space: SolidScriptUvWrapSpace,
): SolidScriptUvSpaceLookup {
  const layout = generatorRevolveUvLayout(space.stations, space.frame.sides, space.wrap, space.frame.aspect);
  return solidScriptUvSpaceSurfaces(leaf, space.matrix, (brush) =>
    generatorRevolveSurfaces(brush, space.frame, layout),
  );
}

/**
 * Metres of one repeat that closes the seam around the widest ring, and that
 * ring's radius, for projections that place each corner on their own.
 *
 * @param space Wrap space.
 * @param size Metres of one repeat as asked.
 * @returns Whole-repeat size and the widest radius, both in metres.
 */
export function solidScriptUvWrapWhole(space: SolidScriptUvWrapSpace, size: number): { size: number; radius: number } {
  const radius = Math.max(0, ...space.stations.map((station) => station.radius)) * size;
  if (!(radius > 0)) return { size, radius: 1 };
  return { size: (2 * Math.PI * radius) / Math.max(1, space.wrap.around), radius };
}

/**
 * Lists each solid's rings from the bottom up, solids in order of their lowest
 * corner, so a ledge where two solids meet keeps the lower solid's ring first.
 *
 * @param leaves Solids.
 * @param matrix From script space into the wrap space.
 * @returns Rings per solid.
 */
function solidScriptUvWrapLeafRings(
  leaves: readonly { points: THREE.Vector3[] }[],
  matrix: THREE.Matrix4,
): THREE.Vector3[][][] {
  const rings = leaves.map((leaf) => solidScriptUvWrapRings(solidScriptUvSpacePoints(leaf, matrix)));
  return rings.sort((left, right) => (left[0]?.[0]?.y ?? 0) - (right[0]?.[0]?.y ?? 0));
}

/**
 * Groups corners of one solid into rings by height, from the bottom up.
 *
 * @param points Corners in the wrap space.
 * @returns Rings.
 */
function solidScriptUvWrapRings(points: readonly THREE.Vector3[]): THREE.Vector3[][] {
  const rings: THREE.Vector3[][] = [];
  for (const point of [...points].sort((left, right) => left.y - right.y)) {
    const last = rings[rings.length - 1];
    if (last && Math.abs((last[0]?.y ?? 0) - point.y) <= SOLID_SCRIPT_UV_WRAP_LEVEL) last.push(point);
    else rings.push([point]);
  }
  return rings;
}

/**
 * Reads the side count and depth of the rings from the one with most corners.
 *
 * @param rings Rings.
 * @returns Frame on the axis.
 */
function solidScriptUvWrapFrame(rings: readonly THREE.Vector3[][]): GeneratorRevolveFrame {
  const widest = rings.reduce<THREE.Vector3[]>((best, ring) => (ring.length > best.length ? ring : best), []);
  const sides = Math.max(3, widest.length);
  const unit = generatorRevolveRing({ center: new THREE.Vector3(), sides }, { height: 0, radius: 1 });
  const ratio = (ring: readonly THREE.Vector3[]) => {
    const box = new THREE.Box3().setFromPoints([...ring]);
    return (box.max.z - box.min.z) / (box.max.x - box.min.x);
  };
  const aspect = ratio(widest) / ratio(unit);
  return { center: new THREE.Vector3(), sides, aspect: Number.isFinite(aspect) && aspect > 0 ? aspect : 1 };
}

/**
 * Drops a station that repeats the one before it, where two solids share a
 * ring.
 *
 * @param stations Stations from the bottom up.
 * @returns Stations without repeats.
 */
function solidScriptUvWrapStations(stations: readonly GeneratorRevolveStation[]): GeneratorRevolveStation[] {
  return stations.filter((station, index) => {
    const before = stations[index - 1];
    return (
      !before ||
      Math.abs(before.height - station.height) > SOLID_SCRIPT_UV_WRAP_LEVEL ||
      Math.abs(before.radius - station.radius) > SOLID_SCRIPT_UV_WRAP_LEVEL
    );
  });
}
