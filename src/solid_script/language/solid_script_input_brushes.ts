import * as THREE from 'three';
import { SOLID_SCRIPT_GEOMETRY_EPSILON } from './solid_script_geometry.js';
import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import type { SolidScriptReceived, SolidScriptShape, SolidScriptShapeSolid } from './solid_script_shape.js';
import {
  solidScriptUvPolicyFromRun,
  solidScriptUvPolicyTextures,
  solidScriptUvPolicyWrite,
} from './solid_script_uv_policy.js';

/**
 * Builds the shapes of an Input Brushes line: each received brush, as it is
 * after Clip and other writes, moved by the blocks around the line. Brushes
 * stay tagged as received so the host can pass them on, and a Clip plane is
 * stored so the host can cut the received units the same way.
 *
 * @param run Running Input Brushes line.
 * @returns Shapes.
 */
export function solidScriptInputBrushesBuild(run: SolidScriptBlockRun): SolidScriptShape[] {
  run.fields();
  const textures = solidScriptInputBrushesTextures(run);
  const matrix = run.matrix();
  const turn = new THREE.Matrix3().getNormalMatrix(matrix);
  const use = run.use();
  const latest = run.receivedLatest();
  const built = use.solids.flatMap((corners, index) =>
    solidScriptInputBrushesOne(
      run,
      latest[index],
      corners,
      index,
      matrix,
      turn,
      textures,
      use.textures?.[index],
      use.modes?.[index],
    ),
  );
  run.inputsBuilt(built);
  solidScriptInputBrushesInto(run, built);
  return built;
}

/**
 * Builds one received brush, with its textures and pass record.
 *
 * @param run Running line.
 * @param leaf Latest received leaf at this index, when it exists.
 * @param corners Corners as the modifier passed them in.
 * @param index Brush index.
 * @param matrix Script-space move.
 * @param turn Normal matrix of that move.
 * @param textures Copied or world.
 * @param faces Received face textures, when any.
 * @returns Shapes.
 */
function solidScriptInputBrushesOne(
  run: SolidScriptBlockRun,
  leaf: SolidScriptGeometryLeaf | undefined,
  corners: readonly (readonly [number, number, number])[],
  index: number,
  matrix: THREE.Matrix4,
  turn: THREE.Matrix3,
  textures: 'copied' | 'world',
  faces:
    | readonly {
        point: readonly [number, number, number];
        normal: readonly [number, number, number];
        texture: string;
      }[]
    | undefined,
  mode: SolidScriptShapeSolid['mode'],
): SolidScriptShape[] {
  const faceTextures = faces?.map((face) => ({
    point: new THREE.Vector3(...face.point).applyMatrix4(matrix),
    normal: new THREE.Vector3(...face.normal).applyMatrix3(turn).normalize(),
    texture: face.texture,
  }));
  const received = solidScriptInputBrushesReceived(run, index, matrix, textures, leaf);
  return run
    .solid(solidScriptInputBrushesPoints(leaf, corners))
    .map((shape) => solidScriptInputBrushesSolid(shape, faceTextures, received, mode));
}

/**
 * Writes the built brushes Into the named variable, when Into is set.
 *
 * @param run Running line.
 * @param built Shapes.
 */
function solidScriptInputBrushesInto(run: SolidScriptBlockRun, built: readonly SolidScriptShape[]): void {
  const into = run.text('into').trim();
  if (into !== '')
    run.variableSet(
      into,
      built.flatMap((shape) => (shape.kind === 'solid' ? [run.elements.brush(shape)] : [])),
    );
}

/**
 * Reads Textures and stops when it is not an allowed word.
 *
 * @param run Running line.
 * @returns Lower-case textures word.
 */
function solidScriptInputBrushesTextures(run: SolidScriptBlockRun): 'copied' | 'world' {
  return solidScriptUvPolicyTextures(run, true) ?? 'copied';
}

/**
 * Corners of one received brush, after writes, or the corners as they arrived.
 *
 * @param leaf Latest received leaf at this index, when it exists.
 * @param corners Corners as the modifier passed them in.
 * @returns Points in script space.
 */
function solidScriptInputBrushesPoints(
  leaf: SolidScriptGeometryLeaf | undefined,
  corners: readonly (readonly [number, number, number])[],
): THREE.Vector3[] {
  if (leaf && solidScriptInputBrushesChanged(leaf, corners)) return leaf.points.map((point) => point.clone());
  return corners.map(([x, y, z]) => new THREE.Vector3(x, y, z));
}

/**
 * Tells whether a received leaf was rewritten, such as by Clip.
 *
 * @param leaf Latest received leaf at this index, when it exists.
 * @param corners Corners as the modifier passed them in.
 * @returns True when the points no longer match.
 */
function solidScriptInputBrushesChanged(
  leaf: SolidScriptGeometryLeaf | undefined,
  corners: readonly (readonly [number, number, number])[],
): boolean {
  if (!leaf) return false;
  if (leaf.kind !== 'solid' || leaf.points.length !== corners.length) return true;
  const epsilon = SOLID_SCRIPT_GEOMETRY_EPSILON * SOLID_SCRIPT_GEOMETRY_EPSILON;
  return leaf.points.some((point, index) => {
    const [x, y, z] = corners[index] ?? [0, 0, 0];
    return point.distanceToSquared(new THREE.Vector3(x, y, z)) > epsilon;
  });
}

/**
 * Received-pass record for an Input Brushes solid, including a Clip plane.
 *
 * @param run Running line.
 * @param index Brush index.
 * @param matrix Script-space move.
 * @param textures Copied or world.
 * @param leaf Latest received leaf, when it exists.
 * @returns Record.
 */
function solidScriptInputBrushesReceived(
  run: SolidScriptBlockRun,
  index: number,
  matrix: THREE.Matrix4,
  textures: 'copied' | 'world',
  leaf: SolidScriptGeometryLeaf | undefined,
): SolidScriptReceived {
  const policy = solidScriptUvPolicyFromRun(run, { readable: true });
  const clip = solidScriptInputBrushesClip(leaf);
  return {
    index,
    matrix,
    textures: policy.textures ?? textures,
    readable: policy.readable !== false,
    shiftU: policy.shiftU ?? 0,
    shiftV: policy.shiftV ?? 0,
    ...(clip ? { clip } : {}),
  };
}

/**
 * Script-space Clip plane stored on a received leaf, when Clip rewrote it.
 *
 * @param leaf Latest received leaf, when it exists.
 * @returns Plane, or none.
 */
function solidScriptInputBrushesClip(leaf: SolidScriptGeometryLeaf | undefined): SolidScriptReceived['clip'] {
  const clip = leaf && leaf.kind === 'solid' ? leaf.clippedBy : undefined;
  return clip ? { normal: [clip.normal.x, clip.normal.y, clip.normal.z], constant: clip.constant } : undefined;
}

/**
 * Attaches textures and a received-pass record to a built solid.
 *
 * @param shape Built shape.
 * @param faceTextures Received face textures, when any.
 * @param received Pass record, or none when the brush was rewritten.
 * @returns Shape.
 */
function solidScriptInputBrushesSolid(
  shape: SolidScriptShape,
  faceTextures: SolidScriptShapeSolid['faceTextures'],
  received: SolidScriptReceived | undefined,
  mode: SolidScriptShapeSolid['mode'],
): SolidScriptShape {
  if (shape.kind !== 'solid') return shape;
  const withTextures = {
    ...shape,
    ...(faceTextures ? { faceTextures } : {}),
    ...(received ? { received } : {}),
    ...(mode ? { mode } : {}),
  };
  return received
    ? solidScriptUvPolicyWrite(withTextures, {
        textures: received.textures,
        ...(received.readable !== undefined ? { readable: received.readable } : {}),
        shiftU: received.shiftU ?? 0,
        shiftV: received.shiftV ?? 0,
      })
    : withTextures;
}
