import * as THREE from 'three';
import { solidScriptBodyHull, type SolidScriptBody } from './solid_script_body.js';
import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import { solidScriptInputBrushName, type SolidScriptUseSolid } from './solid_script_system.js';
import type { SolidScriptReceived, SolidScriptShape, SolidScriptShapeSolid } from './solid_script_shape.js';
import { solidScriptUvPolicyTextures, solidScriptUvPolicyWrite } from './solid_script_uv_policy.js';

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
  const modes = run.receivedModes();
  const built = use.solids.flatMap((solid, index) =>
    solidScriptInputBrushesOne(
      run,
      latest[index],
      solid,
      index,
      matrix,
      turn,
      textures,
      use.textures?.[index],
      solidScriptInputBrushesMode(latest[index], modes[index], use.modes?.[index]),
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
 * @param solid Brush as the modifier passed it in.
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
  solid: SolidScriptUseSolid,
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
  const received = solidScriptInputBrushesReceived(index, matrix, textures, leaf);
  const faceUvs = leaf && leaf.kind === 'solid' ? leaf.faceUvs : undefined;
  return run
    .solid(solidScriptInputBrushesBody(leaf, solid, solidScriptInputBrushName(index)), faceUvs)
    .map((shape) => solidScriptInputBrushesSolid(shape, faceTextures, received, mode));
}

/**
 * Mode of a received brush after Set or other writes, or the Mode it arrived
 * with.
 *
 * @param leaf Latest incoming leaf at this index, when it exists.
 * @param written Mode of the last Input Brushes solid, after later writes.
 * @param incoming Mode the modifier passed in.
 * @returns Mode to store on the solid.
 */
function solidScriptInputBrushesMode(
  leaf: SolidScriptGeometryLeaf | undefined,
  written: SolidScriptShapeSolid['mode'],
  incoming: SolidScriptShapeSolid['mode'],
): SolidScriptShapeSolid['mode'] {
  if (written) return written;
  if (leaf && leaf.kind === 'solid' && leaf.mode) return leaf.mode;
  return incoming;
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
 * Corners and faces of one received brush, after writes, or as it arrived. A
 * brush a write turned into a mesh is wrapped again.
 *
 * @param leaf Latest received leaf at this index, when it exists.
 * @param solid Brush as the modifier passed it in.
 * @param label Brush name, for the message.
 * @returns Body in script space.
 */
function solidScriptInputBrushesBody(
  leaf: SolidScriptGeometryLeaf | undefined,
  solid: SolidScriptUseSolid,
  label: string,
): SolidScriptBody {
  if (leaf?.kind === 'mesh') return solidScriptBodyHull(leaf.points, label);
  if (leaf) return { points: leaf.points.map((point) => point.clone()), faces: leaf.faces.map((loop) => [...loop]) };
  return {
    points: solid.corners.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    faces: solid.faces.map((loop) => [...loop]),
  };
}

/**
 * Received-pass record for an Input Brushes solid, including a Clip plane.
 * Readable Text and the UV shift start at their defaults; Transform UVs changes
 * them.
 *
 * @param index Brush index.
 * @param matrix Script-space move.
 * @param textures Copied or world.
 * @param leaf Latest received leaf, when it exists.
 * @returns Record.
 */
function solidScriptInputBrushesReceived(
  index: number,
  matrix: THREE.Matrix4,
  textures: 'copied' | 'world',
  leaf: SolidScriptGeometryLeaf | undefined,
): SolidScriptReceived {
  const clip = solidScriptInputBrushesClip(leaf);
  return { index, matrix, textures, readable: true, shiftU: 0, shiftV: 0, ...(clip ? { clip } : {}) };
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
