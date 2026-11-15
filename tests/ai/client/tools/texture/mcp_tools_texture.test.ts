import { describe, expect, it } from 'vitest';
import { editorApiFixtureCreate } from '../../helpers_editor_api.js';

type Face = {
  surfaceIndex: number;
  normal: { x: number; y: number; z: number };
  visible: boolean;
  textureId: string;
  scaleU: number;
  offsetU: number;
  rotationDeg: number;
};

/**
 * Builds one wall brush and returns its id.
 *
 * @returns Fixture and brush id.
 */
function wallCreate() {
  const fixture = editorApiFixtureCreate();
  const built = fixture.api.invokeTool('geometry_script_build', { source: 'cube([4, 0.2, 3]);' });
  expect(built.ok, built.message).toBe(true);
  const brushId = (built.data as { brushes: { brushId: string }[] }).brushes[0]?.brushId ?? '';
  return { ...fixture, brushId };
}

/**
 * Reads a brush's faces.
 *
 * @param api Editor API.
 * @param brushId Brush id.
 * @returns Faces.
 */
function facesOf(api: ReturnType<typeof editorApiFixtureCreate>['api'], brushId: string): Face[] {
  return (api.invokeTool('texture_face_list', { brushId }).data as { faces: Face[] }).faces;
}

describe('texture tools', () => {
  it('lists faces with normals and assigns a texture to one face with undo', () => {
    const { api, stack, brushId } = wallCreate();
    const faces = facesOf(api, brushId);
    expect(faces).toHaveLength(6);
    const front = faces.find((face) => face.normal.z < -0.9);
    expect(front?.visible).toBe(true);
    const before = front?.textureId;
    const assigned = api.invokeTool('texture_face_assign', {
      brushIds: [brushId],
      surfaceIndices: [front?.surfaceIndex],
      textureId: 'bricks.png',
    });
    expect(assigned.ok, assigned.message).toBe(true);
    const after = facesOf(api, brushId);
    expect(after.find((face) => face.surfaceIndex === front?.surfaceIndex)?.textureId).toBe('bricks.png');
    expect(after.filter((face) => face.textureId === 'bricks.png')).toHaveLength(1);
    stack.undo();
    expect(facesOf(api, brushId).find((face) => face.surfaceIndex === front?.surfaceIndex)?.textureId).toBe(before);
  });

  it('sets, scales, offsets, rotates and resets UVs', () => {
    const { api, brushId } = wallCreate();
    const surface = facesOf(api, brushId)[0]?.surfaceIndex;
    const target = { brushIds: [brushId], surfaceIndices: [surface] };
    const face = () => facesOf(api, brushId).find((entry) => entry.surfaceIndex === surface);
    expect(api.invokeTool('texture_uv_set', { ...target, scaleU: 2 }).ok).toBe(true);
    expect(face()?.scaleU).toBeCloseTo(2);
    expect(api.invokeTool('texture_uv_scale', { ...target, axis: 'u', factor: 2 }).ok).toBe(true);
    expect(face()?.scaleU).toBeCloseTo(4);
    const offsetBefore = face()?.offsetU ?? 0;
    expect(api.invokeTool('texture_uv_offset', { ...target, axis: 'u', delta: 0.5 }).ok).toBe(true);
    expect(face()?.offsetU).toBeCloseTo(offsetBefore + 0.5);
    expect(api.invokeTool('texture_uv_rotate', { ...target, degrees: 90 }).ok).toBe(true);
    expect(Math.abs(face()?.rotationDeg ?? 0)).toBeCloseTo(90);
    expect(api.invokeTool('texture_uv_reset', target).ok).toBe(true);
    expect(face()?.scaleU).toBeCloseTo(1);
    expect(api.invokeTool('texture_uv_set', target).ok).toBe(false);
  });

  it('lists textures and refuses unknown faces', () => {
    const { api, brushId } = wallCreate();
    expect(api.invokeTool('texture_list', {}).ok).toBe(true);
    const wrong = api.invokeTool('texture_face_assign', { brushIds: [brushId], surfaceIndices: [42], textureId: 'x' });
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toMatch(/no face 42/);
  });
});
