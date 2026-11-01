import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { initializeMeshTextureUVs } from '@/texture/uv/face_texture_applier.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { rebakeStoredFaceTextureMaps } from '@/texture/uv/planar_uv_projector.js';
import type { ObjectEntry } from '@/io/scene/io_types.js';
import type { NodeCollaborationEntryData } from '@/collaboration/scene/node_collaboration_types.js';
import {
  NODE_UV_MAX_COMPONENTS,
  nodeUvApply,
  nodeUvEncode,
  nodeUvPose,
  nodeUvPoseOf,
} from '@/collaboration/scene/node_collaboration_uv.js';

/**
 * Builds a textured box primitive normalized through save and load.
 *
 * @returns Box mesh inside its own world group.
 */
function boxBuild(): THREE.Mesh {
  const world = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.name = 'Box';
  initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
  world.add(mesh);
  const loaded = new THREE.Group();
  new SceneDeserializer().deserialize(new SceneSerializer().serialize(world), loaded);
  return loaded.children[0] as THREE.Mesh;
}

/**
 * Returns the vertex UVs of a mesh.
 *
 * @param mesh Mesh.
 * @returns UV components.
 */
function uvs(mesh: THREE.Mesh): number[] {
  return Array.from(mesh.geometry.getAttribute('uv').array as ArrayLike<number>);
}

/**
 * Scales a box and bakes its UVs from the world face maps like Stretch Lock
 * off.
 *
 * @param mesh Box.
 * @param scale X scale.
 */
function stretchBake(mesh: THREE.Mesh, scale: number): void {
  mesh.scale.set(scale, 1, 1);
  mesh.updateWorldMatrix(true, false);
  rebakeStoredFaceTextureMaps(mesh);
}

/**
 * Builds a relayed primitive entry payload.
 *
 * @param uv Literal UVs, or undefined like older senders.
 * @returns Entry payload.
 */
function entryData(uv: number[] | undefined): NodeCollaborationEntryData {
  const data: NodeCollaborationEntryData = { entry: { type: 'mesh' } as ObjectEntry, locked: false, solid: null };
  if (uv !== undefined) data.uv = uv;
  return data;
}

describe('node_collaboration_uv', () => {
  it('encodes primitive UVs and skips entries that carry their own', () => {
    const box = boxBuild();
    expect(nodeUvEncode(box, { type: 'mesh' } as ObjectEntry)).toEqual(uvs(box));
    expect(nodeUvEncode(box, { type: 'mesh', geometryData: {} } as ObjectEntry)).toBeNull();
    expect(nodeUvEncode(new THREE.Group(), { type: 'group' } as ObjectEntry)).toBeNull();
  });

  it('rounds UVs to the shortest exact 32-bit text and caps dense meshes', () => {
    const box = boxBuild();
    stretchBake(box, 3);
    const encoded = nodeUvEncode(box, { type: 'mesh' } as ObjectEntry) ?? [];
    expect(Float32Array.from(encoded)).toEqual(box.geometry.getAttribute('uv').array);
    const dense = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 80, 80));
    expect(dense.geometry.getAttribute('uv').array.length).toBeGreaterThan(NODE_UV_MAX_COMPONENTS);
    expect(nodeUvEncode(dense, { type: 'mesh' } as ObjectEntry)).toBeNull();
  });

  it('applies literal UVs, splitting the layout like the sender did', () => {
    const sender = boxBuild();
    stretchBake(sender, 2);
    const receiver = boxBuild();
    receiver.scale.set(2, 1, 1);
    nodeUvApply(receiver, entryData(uvs(sender)));
    expect(uvs(receiver)).toEqual(uvs(sender));
  });

  it.for([
    ['a mismatched layout', [0, 0, 1, 1]],
    ['no literal UVs', undefined],
  ] as const)('bakes from the relayed face maps for %s', ([, uv]) => {
    const sender = boxBuild();
    stretchBake(sender, 2);
    const receiver = boxBuild();
    receiver.scale.set(2, 1, 1);
    nodeUvApply(receiver, entryData(uv === undefined ? undefined : [...uv]));
    uvs(receiver).forEach((value, index) => expect(value).toBeCloseTo(uvs(sender)[index] ?? NaN, 6));
  });

  it('leaves buffer meshes to the UVs of their geometry data', () => {
    const box = boxBuild();
    box.scale.set(2, 1, 1);
    const before = uvs(box);
    nodeUvApply(box, { ...entryData(undefined), entry: { type: 'mesh', geometryData: {} } as ObjectEntry });
    expect(uvs(box)).toEqual(before);
  });

  it('previews live poses with the dragger texture locks', () => {
    const sender = boxBuild();
    stretchBake(sender, 2);
    const unlocked = boxBuild();
    const before = nodeUvPoseOf(unlocked);
    unlocked.scale.set(2, 1, 1);
    nodeUvPose(unlocked, before, { positionLock: true, stretchLock: false });
    uvs(unlocked).forEach((value, index) => expect(value).toBeCloseTo(uvs(sender)[index] ?? NaN, 6));
    const locked = boxBuild();
    const original = uvs(locked);
    locked.scale.set(2, 1, 1);
    nodeUvPose(locked, before, { positionLock: true, stretchLock: true });
    nodeUvPose(locked, before, null);
    expect(uvs(locked)).toEqual(original);
  });

  it('follows Pos Lock for pure moves only', () => {
    const moved = boxBuild();
    const before = nodeUvPoseOf(moved);
    const original = uvs(moved);
    moved.position.x += 0.5;
    nodeUvPose(moved, before, { positionLock: true, stretchLock: false });
    expect(uvs(moved)).toEqual(original);
    nodeUvPose(moved, before, { positionLock: false, stretchLock: true });
    expect(uvs(moved)).not.toEqual(original);
  });
});
