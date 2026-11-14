import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandTextureSolidBrushAssign } from '@/texture/commands/command_texture_solid_brush_assign.js';

/**
 * Builds a textured tall box with a differently textured lower box against one
 * side, so the release seam pass adds vertices and the result has several
 * material draw ranges.
 *
 * @param model Model to fill.
 * @returns The lower box brush.
 */
function addTexturedStep(model: SolidModel): ReturnType<SolidModel['addBoxBrush']> {
  const tall = model.addBoxBrush(2, SolidOperation.Additive);
  const step = model.addBoxBrush(1, SolidOperation.Additive);
  step.position.set(2, -0.5, 0);
  step.scale.set(2, 1, 1);
  step.pushTransformToMesh();
  new CommandTextureSolidBrushAssign([tall.mesh!], 'folder/tall_wall.png').execute();
  new CommandTextureSolidBrushAssign([step.mesh!], 'folder/step_wall.png').execute();
  return step;
}

/**
 * Counts the vertices the renderer would draw through the material ranges.
 *
 * @param geometry Result geometry.
 * @returns Vertices covered by the draw ranges, clamped to the buffers.
 */
function drawnVertexCount(geometry: THREE.BufferGeometry): number {
  const vertexCount = geometry.getAttribute('position').count;
  let drawn = 0;
  for (const group of geometry.groups) {
    drawn += Math.max(0, Math.min(vertexCount, group.start + group.count) - group.start);
  }
  return drawn;
}

describe('Solid result draw ranges on drag release', () => {
  it('match the new layout before the next frame when the release seam pass adds vertices', () => {
    const model = new SolidModel('SeamReleaseRanges');
    const step = addTexturedStep(model);
    model.markDirty();
    model.rebuild(true);
    const geometry = (): THREE.BufferGeometry => model.getResultMesh().geometry;
    expect(geometry().groups.length).toBeGreaterThan(1);
    step.mesh!.position.z = 0.3;
    step.mesh!.updateMatrixWorld(true);
    model.prepareLiveBrushEdit([step.mesh!], { positionLock: true, stretchLock: true });
    model.rebuildLive();
    const liveCount = geometry().getAttribute('position').count;
    expect(drawnVertexCount(geometry())).toBe(liveCount);
    model.finalizeAfterInteractiveEdit();
    const releasedCount = geometry().getAttribute('position').count;
    expect(releasedCount).toBeGreaterThan(liveCount);
    expect(drawnVertexCount(geometry())).toBe(releasedCount);
  });
});
