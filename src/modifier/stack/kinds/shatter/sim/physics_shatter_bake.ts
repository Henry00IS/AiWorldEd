import * as THREE from 'three';
import type { PhysicsShatterPieceTransform } from '@/modifier/stack/kinds/shatter/physics_shatter_transform.js';

/**
 * Bake format version, the first byte of every bake; other versions decode as
 * no bake.
 */
export const PHYSICS_SHATTER_BAKE_VERSION = 1;

/** Header bytes: version and piece count. */
const PHYSICS_SHATTER_BAKE_HEADER_BYTES = 3;

/** Bytes per piece: final position x y z and rotation x y z w as 32-bit floats. */
const PHYSICS_SHATTER_BAKE_PIECE_BYTES = 28;

/** Most pieces a bake can describe. */
export const PHYSICS_SHATTER_BAKE_MAX_PIECES = 0xffff;

/**
 * Encodes the final pose of every piece, in fracture piece order, as base64
 * text: a version byte, the piece count, then position and rotation per piece.
 * The pose is the transform x' = R·(x − c) + c + t, stored as t and R.
 *
 * @param transforms Transform per piece, in piece order.
 * @returns Base64 bake text.
 */
export function physicsShatterBakeEncode(transforms: readonly PhysicsShatterPieceTransform[]): string {
  if (transforms.length > PHYSICS_SHATTER_BAKE_MAX_PIECES) throw new Error('Too many pieces to bake.');
  const view = new DataView(new ArrayBuffer(physicsShatterBakeByteLength(transforms.length)));
  view.setUint8(0, PHYSICS_SHATTER_BAKE_VERSION);
  view.setUint16(1, transforms.length, true);
  transforms.forEach((transform, index) => physicsShatterBakePieceWrite(view, index, transform));
  return physicsShatterBakeBase64FromBytes(new Uint8Array(view.buffer));
}

/**
 * Decodes bake text into one transform per piece.
 *
 * @param bake Base64 bake text.
 * @param pieceCount Number of pieces the current fracture has.
 * @returns Transforms, or null for another version, another piece count or
 *   malformed text.
 */
export function physicsShatterBakeDecode(bake: string, pieceCount: number): PhysicsShatterPieceTransform[] | null {
  const bytes = physicsShatterBakeBytesFromBase64(bake);
  if (!bytes || bytes.length !== physicsShatterBakeByteLength(pieceCount)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(0) !== PHYSICS_SHATTER_BAKE_VERSION || view.getUint16(1, true) !== pieceCount) return null;
  const transforms: PhysicsShatterPieceTransform[] = [];
  for (let index = 0; index < pieceCount; index++) {
    const transform = physicsShatterBakePieceRead(view, index);
    if (!transform) return null;
    transforms.push(transform);
  }
  return transforms;
}

/**
 * Returns the byte length of a bake.
 *
 * @param pieceCount Piece count.
 * @returns Bytes before base64.
 */
function physicsShatterBakeByteLength(pieceCount: number): number {
  return PHYSICS_SHATTER_BAKE_HEADER_BYTES + pieceCount * PHYSICS_SHATTER_BAKE_PIECE_BYTES;
}

/**
 * Writes one piece's pose.
 *
 * @param view Bake bytes.
 * @param index Piece index.
 * @param transform Piece transform.
 */
function physicsShatterBakePieceWrite(view: DataView, index: number, transform: PhysicsShatterPieceTransform): void {
  const rotation = transform.rotation.clone().normalize();
  const values = [transform.translation.x, transform.translation.y, transform.translation.z];
  values.push(rotation.x, rotation.y, rotation.z, rotation.w);
  const offset = PHYSICS_SHATTER_BAKE_HEADER_BYTES + index * PHYSICS_SHATTER_BAKE_PIECE_BYTES;
  values.forEach((value, slot) => view.setFloat32(offset + slot * 4, value, true));
}

/**
 * Reads one piece's pose.
 *
 * @param view Bake bytes.
 * @param index Piece index.
 * @returns Transform, or null when the values are not finite or the rotation is
 *   empty.
 */
function physicsShatterBakePieceRead(view: DataView, index: number): PhysicsShatterPieceTransform | null {
  const offset = PHYSICS_SHATTER_BAKE_HEADER_BYTES + index * PHYSICS_SHATTER_BAKE_PIECE_BYTES;
  const values = Array.from({ length: 7 }, (_unused, slot) => view.getFloat32(offset + slot * 4, true));
  if (!values.every(Number.isFinite)) return null;
  const [tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, rw = 1] = values;
  const rotation = new THREE.Quaternion(rx, ry, rz, rw);
  if (rotation.lengthSq() < 1e-6) return null;
  return { translation: new THREE.Vector3(tx, ty, tz), rotation: rotation.normalize() };
}

/**
 * Turns bytes into base64 text.
 *
 * @param bytes Bytes.
 * @returns Base64 text.
 */
function physicsShatterBakeBase64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let start = 0; start < bytes.length; start += chunk) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunk));
  }
  return btoa(binary);
}

/**
 * Turns base64 text into bytes.
 *
 * @param text Base64 text.
 * @returns Bytes, or null when the text is not base64.
 */
function physicsShatterBakeBytesFromBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}
