import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import { MODIFIER_STACK_KIND_PHYSICS_SHATTER } from '@/modifier/stack/kinds/shatter/modifier_stack_kind_physics_shatter.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { PHYSICS_SHATTER_BAKE_STALE } from '@/modifier/stack/kinds/shatter/physics_shatter_bake_state.js';
import { expectStackConvex, stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Returns the visible compiled pieces of a fixture.
 *
 * @param instances Compiled brushes.
 * @param sourceId Authored brush id.
 * @returns Pieces the modifier made.
 */
function piecesOf(instances: readonly SolidBrushInstance[], sourceId: string): SolidBrushInstance[] {
  return instances.filter((instance) => instance.visible && instance.id !== sourceId);
}

describe('physics shatter modifier', () => {
  it('is installed and replaces the captured brush with convex pieces of the same total volume', () => {
    expect(modifierStackKindFind(MODIFIER_STACK_KIND_PHYSICS_SHATTER)?.label).toBe('Physics Shatter');
    const fixture = stackFixture([{ kind: MODIFIER_STACK_KIND_PHYSICS_SHATTER, parameters: { crackSize: 0.3 } }]);
    const result = fixture.compile();
    const pieces = piecesOf(result.instances, fixture.source.id);
    expect(pieces.length).toBeGreaterThan(10);
    expect(result.instances.find((instance) => instance.id === fixture.source.id)?.visible).toBe(false);
    for (const piece of pieces) {
      expectStackConvex(piece);
      expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
    }
    const volume = pieces.reduce((sum, piece) => sum + physicsShatterBrushVolume(piece.getModelSpaceBrush()), 0);
    expect(volume).toBeCloseTo(physicsShatterBrushVolume(fixture.source.getModelSpaceBrush()), 6);
  });

  it('gives crack faces the Inside Texture and keeps the source texture on original faces', () => {
    const fixture = stackFixture([
      { kind: MODIFIER_STACK_KIND_PHYSICS_SHATTER, parameters: { crackSize: 0.4, insideTexture: 'stone_inside' } },
    ]);
    fixture.source.setAllFacesTextureId('wall_paint');
    const pieces = piecesOf(fixture.compile().instances, fixture.source.id);
    const sourcePlanes = fixture.source.getModelSpacePlanes();
    let cracks = 0;
    let originals = 0;
    for (const piece of pieces) {
      piece.getModelSpacePlanes().forEach((plane, faceIndex) => {
        const onSource = sourcePlanes.some((candidate) => candidate.isAlignedWith(plane));
        const surfaceIndex = piece.brush.faces[faceIndex]?.surfaceIndex ?? faceIndex;
        expect(piece.getFaceSurface(surfaceIndex).textureId).toBe(onSource ? 'wall_paint' : 'stone_inside');
        if (onSource) originals++;
        else cracks++;
      });
    }
    expect(cracks).toBeGreaterThan(0);
    expect(originals).toBeGreaterThan(0);
  });

  it('keeps the same pieces for the same seed and changes them with another seed', () => {
    const hulls = (seed: number): number[][] => {
      const fixture = stackFixture([
        { kind: MODIFIER_STACK_KIND_PHYSICS_SHATTER, parameters: { crackSize: 0.3, seed } },
      ]);
      return piecesOf(fixture.compile().instances, fixture.source.id).map((piece) =>
        piece.getModelSpaceBrush().vertices.flatMap((vertex) => vertex.toArray()),
      );
    };
    expect(hulls(4)).toEqual(hulls(4));
    expect(hulls(5)).not.toEqual(hulls(4));
  });

  it('exposes the last fracture, its input hash and the blast settings for the simulation', () => {
    const parameters = { crackSize: 0.4, directionX: 1, directionY: 0, directionZ: 0, radius: 2 };
    const fixture = stackFixture([{ kind: MODIFIER_STACK_KIND_PHYSICS_SHATTER, parameters }]);
    fixture.compile();
    const step = (fixture.volume.userData['modifierStack'] as { modifiers: { id: string }[] } | undefined)
      ?.modifiers[0];
    const run = physicsShatterLastRunOf(fixture.volume.uuid, step?.id ?? '');
    expect(run).toBeDefined();
    expect(run?.inputHash).toMatch(/^[0-9a-f]{16}$/);
    expect(run?.status).toBe('unsimulated');
    expect(run?.blast.direction.toArray()).toEqual([1, 0, 0]);
    expect(run?.blast.radius).toBe(2);
    expect(run?.fracture.pieces.length).toBeGreaterThan(5);
  });

  it('reports stale rubble when the stored bake was made from other inputs', () => {
    const parameters = { bake: 'AAAA', bakeHash: '0123456789abcdef' };
    const fixture = stackFixture([{ kind: MODIFIER_STACK_KIND_PHYSICS_SHATTER, parameters }]);
    fixture.compile();
    expect(modifierStackStatusRead(fixture.volume)?.steps[0]?.error).toContain(PHYSICS_SHATTER_BAKE_STALE);
  });

  it('keeps the bake text and hash through normalization and drops malformed ones', () => {
    const kind = modifierStackKindFind(MODIFIER_STACK_KIND_PHYSICS_SHATTER);
    const long = 'QUJD'.repeat(5000);
    const kept = kind?.normalizeParameters({ bake: long, bakeHash: '0123456789abcdef' });
    expect(kept?.['bake']).toBe(long);
    expect(kept?.['bakeHash']).toBe('0123456789abcdef');
    const dropped = kind?.normalizeParameters({ bake: '<script>', bakeHash: 'nope' });
    expect(dropped?.['bake']).toBe('');
    expect(dropped?.['bakeHash']).toBe('');
  });

  it('draws the blast arrow with its tip on the impact point', () => {
    const kind = modifierStackKindFind(MODIFIER_STACK_KIND_PHYSICS_SHATTER);
    const volume = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    volume.position.set(3, 0, 0);
    volume.scale.setScalar(4);
    volume.updateMatrixWorld(true);
    const parameters = kind?.normalizeParameters({
      impactX: 0.5,
      impactY: 1,
      impactZ: 0,
      directionX: 0,
      directionZ: -1,
    });
    const [arrow] = kind?.helpers(volume, parameters ?? {}) ?? [];
    if (!arrow) throw new Error('Expected the blast arrow');
    volume.add(arrow);
    volume.updateMatrixWorld(true);
    const tip = new THREE.Vector3(0, -0.42, 0).applyMatrix4(arrow.matrixWorld);
    expect(tip.distanceTo(new THREE.Vector3(3.5, 1, 0))).toBeLessThan(1e-6);
    const tail = new THREE.Vector3(0, 0.42, 0).applyMatrix4(arrow.matrixWorld);
    expect(tip.clone().sub(tail).normalize().z).toBeCloseTo(-1, 6);
  });
});
