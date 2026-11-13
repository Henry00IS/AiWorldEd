import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SolidBrushEdgeBatch, SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY } from '@/solid/model/solid_brush_edge_batch.js';
import { modifierStackDerivedByRoot } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { stackFixture } from '../modifier/stack/modifier_stack_fixture.js';

/**
 * Collects every batch vertex of a solid as a rounded position key.
 *
 * @param solidRoot Solid model root.
 * @returns Rounded "x,y,z" keys in solid space.
 */
function batchVertexKeys(solidRoot: THREE.Object3D): Set<string> {
  const keys = new Set<string>();
  for (const child of solidRoot.children) {
    if (!(child instanceof THREE.LineSegments) || child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] !== true)
      continue;
    const position = child.geometry.getAttribute('position');
    for (let index = 0; index < (position?.count ?? 0); index += 1) {
      keys.add(vertexKey(new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index))));
    }
  }
  return keys;
}

/**
 * Rounds a position into a lookup key.
 *
 * @param vertex Position.
 * @returns Rounded key.
 */
function vertexKey(vertex: THREE.Vector3): string {
  return [vertex.x, vertex.y, vertex.z].map((value) => (Math.round(value * 1000) / 1000 + 0).toString()).join(',');
}

/**
 * Lists the solid-space corner keys of one brush.
 *
 * @param brush Brush instance.
 * @returns Rounded corner keys.
 */
function brushCornerKeys(brush: SolidBrushInstance): string[] {
  return brush.getModelSpaceBrush().vertices.map((vertex) => vertexKey(vertex));
}

describe('SolidBrushEdgeBatch with modifier-derived brushes', () => {
  beforeEach(() => {
    SolidBrushEdgeBatch.endLivePoseTracking();
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(null, []);
  });

  it('draws the wireframe of every brush an array modifier derives', () => {
    const { model } = stackFixture(['linear']);
    model.rebuild(true);
    const derived = [...(modifierStackDerivedByRoot.get(model.root)?.values() ?? [])];
    expect(derived.length).toBeGreaterThan(0);
    const keys = batchVertexKeys(model.root);
    for (const brush of derived) {
      for (const corner of brushCornerKeys(brush)) expect(keys.has(corner)).toBe(true);
    }
  });

  it('keeps the batch culling bounds around every derived brush', () => {
    const { model } = stackFixture(['linear']);
    model.rebuild(true);
    const derived = [...(modifierStackDerivedByRoot.get(model.root)?.values() ?? [])];
    expect(derived.length).toBeGreaterThan(0);
    const batches = model.root.children.filter(
      (child): child is THREE.LineSegments =>
        child instanceof THREE.LineSegments && child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true,
    );
    for (const brush of derived) {
      const corners = brush.getModelSpaceBrush().vertices;
      const covered = batches.some((batch) =>
        corners.every((corner) => (batch.geometry.boundingSphere?.distanceToPoint(corner) ?? Infinity) <= 1e-4),
      );
      expect(covered).toBe(true);
    }
  });

  it('drops the derived wireframes again once the modifier volume is gone', () => {
    const { model, source, volume } = stackFixture(['linear']);
    model.rebuild(true);
    const derived = [...(modifierStackDerivedByRoot.get(model.root)?.values() ?? [])];
    volume.removeFromParent();
    model.markDirty();
    model.rebuild(true);
    const keys = batchVertexKeys(model.root);
    const authored = new Set(brushCornerKeys(source));
    expect([...keys].every((key) => authored.has(key))).toBe(true);
    const stale = derived.flatMap((brush) => brushCornerKeys(brush)).filter((key) => !authored.has(key));
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.some((key) => keys.has(key))).toBe(false);
  });

  it('leaves the wireframe of a hidden derived brush out', () => {
    const { model } = stackFixture(['linear']);
    model.rebuild(true);
    const derived = [...(modifierStackDerivedByRoot.get(model.root)?.values() ?? [])];
    const hidden = derived[derived.length - 1];
    expect(hidden).toBeTruthy();
    if (!hidden) return;
    const before = batchVertexCount(model.root);
    hidden.visible = false;
    SolidBrushEdgeBatch.rebuildForSolidRoot(model.root);
    expect(batchVertexCount(model.root)).toBe(before - boxEdgeVertexCount);
  });
});

/** Line vertices of one box wireframe: twelve edges with two ends each. */
const boxEdgeVertexCount = 24;

/**
 * Counts every batch line vertex of a solid.
 *
 * @param solidRoot Solid model root.
 * @returns Vertex count.
 */
function batchVertexCount(solidRoot: THREE.Object3D): number {
  return solidRoot.children
    .filter(
      (child) => child instanceof THREE.LineSegments && child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true,
    )
    .reduce((sum, child) => sum + ((child as THREE.LineSegments).geometry.getAttribute('position')?.count ?? 0), 0);
}
