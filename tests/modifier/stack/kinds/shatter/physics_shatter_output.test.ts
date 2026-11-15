import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { physicsShatterFracture } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_fracture.js';
import { physicsShatterOutputUnit } from '@/modifier/stack/kinds/shatter/physics_shatter_output.js';
import { physicsShatterInsideRead } from '@/modifier/stack/kinds/shatter/physics_shatter_settings.js';
import { physicsShatterTestSettings, physicsShatterTestWall } from './fracture/physics_shatter_fixtures.js';

/**
 * Builds the smallest context the output builder reads.
 *
 * @returns Context with a volume, a step and a staging group.
 */
function outputContext(): ModifierStackContext {
  const step = {
    id: 'step',
    kind: 'physicsShatter',
    name: 'Physics Shatter',
    enabled: true,
    expanded: true,
    parameters: {},
  };
  return { volume: new THREE.Object3D(), step, staging: new THREE.Group() } as unknown as ModifierStackContext;
}

describe('physicsShatterOutputUnit', () => {
  it('moves a piece by its baked transform and carries original face textures along', () => {
    const wall = physicsShatterTestWall(2, 2, 0.3);
    const source = new SolidBrushInstance('wall', 'Wall', wall.clone(), SolidOperation.Additive);
    source.setAllFacesTextureId('bricks');
    const fracture = physicsShatterFracture([{ sourceBrushId: 'wall', brush: wall }], physicsShatterTestSettings());
    const piece = fracture.pieces[0];
    if (!piece) throw new Error('Expected a piece');
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.7);
    const translation = new THREE.Vector3(0.3, -1, 2);
    const job = {
      context: outputContext(),
      sources: [{ brush: source, localToFrame: new THREE.Matrix4(), origin: null }],
      frameToModel: new THREE.Matrix4(),
      inside: physicsShatterInsideRead({ insideTexture: 'rubble' }),
    };
    const unit = physicsShatterOutputUnit(piece, { rotation, translation }, job);
    const output = unit?.brushes[0];
    if (!output) throw new Error('Expected an output brush');
    expect(output.id).toContain('wall#');
    const expected = piece.brush.vertices.map((vertex) =>
      vertex.clone().sub(piece.centroid).applyQuaternion(rotation).add(piece.centroid).add(translation),
    );
    output.brush.vertices.forEach((vertex, index) =>
      expect(vertex.distanceTo(expected[index] ?? vertex)).toBeLessThan(1e-9),
    );
    piece.faces.forEach((origin, faceIndex) => {
      const before =
        piece.brush.vertices[
          piece.brush.getFaceVertexIndices(
            piece.brush.faces[faceIndex] ?? { firstEdge: 0, edgeCount: 0, surfaceIndex: 0 },
          )[0] ?? 0
        ] ?? new THREE.Vector3();
      const after = before.clone().sub(piece.centroid).applyQuaternion(rotation).add(piece.centroid).add(translation);
      const surface = output.getFaceSurface(faceIndex);
      if (origin.kind === 'original') {
        expect(surface.textureId).toBe('bricks');
        const authored = source.getFaceSurface(origin.sourceFaceIndex).uv.project(before);
        const moved = surface.uv.project(after);
        expect(moved.u).toBeCloseTo(authored.u, 9);
        expect(moved.v).toBeCloseTo(authored.v, 9);
      } else {
        expect(surface.textureId).toBe('rubble');
      }
    });
    expect(output.mesh?.parent).toBe(job.context.staging);
  });

  it('builds identity pieces where they were cut when nothing is baked', () => {
    const wall = physicsShatterTestWall(1, 1, 0.2);
    const source = new SolidBrushInstance('wall', 'Wall', wall.clone(), SolidOperation.Additive);
    const fracture = physicsShatterFracture(
      [{ sourceBrushId: 'wall', brush: wall }],
      physicsShatterTestSettings({ crackSize: 0.3 }),
    );
    const job = {
      context: outputContext(),
      sources: [{ brush: source, localToFrame: new THREE.Matrix4(), origin: null }],
      frameToModel: new THREE.Matrix4().makeTranslation(5, 0, 0),
      inside: physicsShatterInsideRead({}),
    };
    for (const piece of fracture.pieces) {
      const output = physicsShatterOutputUnit(piece, null, job)?.brushes[0];
      output?.brush.vertices.forEach((vertex, index) =>
        expect(
          vertex.distanceTo((piece.brush.vertices[index] ?? vertex).clone().add(new THREE.Vector3(5, 0, 0))),
        ).toBeLessThan(1e-9),
      );
    }
  });
});
