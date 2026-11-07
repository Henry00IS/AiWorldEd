import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { cloneFaceTextureMapping, type FaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import {
  stackUvFaceKey,
  stackUvFaceTriangles,
  stackUvFixtureMirror,
  stackUvTriangleCorners,
} from '../../modifier/stack/modifier_stack_uv_fixture.js';

/**
 * Returns the stored result mapping of the region holding a triangle, shifted
 * and rotated so writing it back visibly changes the face.
 *
 * @param model Solid model.
 * @param triangleIndex Result triangle inside the region.
 * @returns Edited copy of that region's mapping.
 */
function editedRegionMapping(model: SolidModel, triangleIndex: number): FaceTextureMapping {
  const entry = getFaceTextureMaps(model.getResultMesh()).find((map) => map.triangleIndices.includes(triangleIndex));
  const mapping = cloneFaceTextureMapping(entry!.mapping);
  mapping.uv = mapping.uv.multiplyMatrix4(new THREE.Matrix4().makeRotationZ(0.3).setPosition(0.25, 0.1, 0));
  return mapping;
}

describe('solid authored UV write-back with modifier copies', () => {
  it('writing a mapping through mirrored copy triangles leaves the source brush untouched', () => {
    const fixture = stackUvFixtureMirror();
    const copies = stackUvFaceTriangles(fixture.model, fixture.source.id, 0, true);
    const before = stackUvFaceKey(fixture.source);
    fixture.model.syncAuthoredMappingForTriangles(copies, editedRegionMapping(fixture.model, copies[0]!));
    expect(stackUvFaceKey(fixture.source)).toBe(before);
  });

  it('a UV edit on the source face updates its mirrored copy immediately', () => {
    const fixture = stackUvFixtureMirror();
    const authored = stackUvFaceTriangles(fixture.model, fixture.source.id, 0, false);
    const copiesBefore = stackUvTriangleCorners(
      fixture.model,
      stackUvFaceTriangles(fixture.model, fixture.source.id, 0, true),
    );
    const before = stackUvFaceKey(fixture.source);
    fixture.model.syncAuthoredMappingForTriangles(authored, editedRegionMapping(fixture.model, authored[0]!));
    expect(stackUvFaceKey(fixture.source)).not.toBe(before);
    const copiesNow = stackUvFaceTriangles(fixture.model, fixture.source.id, 0, true);
    const immediate = stackUvTriangleCorners(fixture.model, copiesNow);
    fixture.model.markDirty();
    fixture.model.rebuild(true);
    const rebuilt = stackUvTriangleCorners(
      fixture.model,
      stackUvFaceTriangles(fixture.model, fixture.source.id, 0, true),
    );
    expect(immediate).not.toEqual(copiesBefore);
    expect(immediate).toEqual(rebuilt);
  });
});
