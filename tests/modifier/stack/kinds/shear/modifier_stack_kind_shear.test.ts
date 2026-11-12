import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import {
  MODIFIER_STACK_SHEAR_SAME_AXIS,
  modifierStackShearFactor,
  modifierStackShearMatrix,
} from '@/modifier/stack/kinds/shear/modifier_stack_kind_shear.js';
import { expectStackConvex, stackFixture, stackResultBounds } from '../../modifier_stack_fixture.js';

/**
 * Returns the model-space vertices of a compiled brush.
 *
 * @param instance Compiled brush.
 * @returns Vertices.
 */
function modelVertices(instance: SolidBrushInstance): THREE.Vector3[] {
  return instance.getModelSpaceBrush().vertices;
}

/**
 * Returns the mean X of the vertices at the top or bottom of a brush.
 *
 * @param instance Compiled brush.
 * @param top True for the top face.
 * @returns Mean X.
 */
function rimX(instance: SolidBrushInstance, top: boolean): number {
  const vertices = modelVertices(instance);
  const height = top ? Math.max(...vertices.map((v) => v.y)) : Math.min(...vertices.map((v) => v.y));
  const rim = vertices.filter((vertex) => Math.abs(vertex.y - height) < 1e-6);
  return rim.reduce((sum, vertex) => sum + vertex.x, 0) / rim.length;
}

/**
 * Asserts a compiled brush is convex and passes generated-brush validation.
 *
 * @param instance Compiled brush.
 */
function expectValid(instance: SolidBrushInstance): void {
  expectStackConvex(instance);
  expect(SolidBrushValidator.validateGenerated(instance.brush).valid).toBe(true);
}

describe('shear modifier', () => {
  it('leans an authored brush in place, keeping its id, mesh and convexity', () => {
    const fixture = stackFixture([{ kind: 'shear', parameters: { mode: 'angle', angle: 45 } }]);
    const result = fixture.compile();
    expect(result.instances).toHaveLength(1);
    const sheared = result.instances[0];
    if (!sheared) throw new Error('Expected the sheared brush');
    expect(sheared).not.toBe(fixture.source);
    expect(sheared.id).toBe(fixture.source.id);
    expect(sheared.mesh).toBe(fixture.source.mesh);
    expect(rimX(sheared, true)).toBeCloseTo(0.5);
    expect(rimX(sheared, false)).toBeCloseTo(-0.5);
    expectValid(sheared);
    expect(fixture.source.brush.vertices.every((vertex) => Math.abs(vertex.x) <= 0.5 + 1e-9)).toBe(true);
  });

  it('reads the amount as a factor or as the tangent of an angle', () => {
    expect(modifierStackShearFactor({ mode: 'factor', factor: 0.25 })).toBeCloseTo(0.25);
    expect(modifierStackShearFactor({ mode: 'angle', angle: 30 })).toBeCloseTo(Math.tan(Math.PI / 6));
    expect(modifierStackShearFactor({ mode: 'angle', angle: 89.9 })).toBeCloseTo(Math.tan((85 * Math.PI) / 180));
    const fixture = stackFixture([{ kind: 'shear', parameters: { mode: 'factor', factor: 2, axis: 'z' } }]);
    const sheared = fixture.compile().instances[0];
    if (!sheared) throw new Error('Expected the sheared brush');
    const top = modelVertices(sheared).filter((vertex) => vertex.y > 0.4);
    expect(Math.min(...top.map((vertex) => vertex.z))).toBeCloseTo(0.5);
  });

  it('keeps the pivot fixed and leaves other axes alone', () => {
    const matrix = modifierStackShearMatrix('x', 'y', 0.5, new THREE.Vector3(3, 2, 1));
    expect(new THREE.Vector3(7, 2, 9).applyMatrix4(matrix).toArray()).toEqual([7, 2, 9]);
    expect(new THREE.Vector3(0, 4, 0).applyMatrix4(matrix).toArray()).toEqual([1, 4, 0]);
  });

  it('passes the input through and explains why when both axes match', () => {
    const fixture = stackFixture([{ kind: 'shear', parameters: { axis: 'y', along: 'y' } }]);
    expect(fixture.compile().instances[0]).toBe(fixture.source);
    expect(modifierStackStatusRead(fixture.volume)?.steps[0]?.error).toBe(MODIFIER_STACK_SHEAR_SAME_AXIS);
  });

  it('moves textures with the shape, or keeps them world aligned', () => {
    const point = new THREE.Vector3(0.5, 0.5, 0.5);
    for (const uv of ['copied', 'world']) {
      const fixture = stackFixture([{ kind: 'shear', parameters: { mode: 'factor', factor: 1, uv } }]);
      const sheared = fixture.compile().instances[0];
      if (!sheared) throw new Error('Expected the sheared brush');
      const face = sheared.brush.planes.findIndex((plane) => plane.normal.z > 0.99);
      const moved = sheared.getFaceSurface(face).uv.project(point.clone().add(new THREE.Vector3(0.5, 0, 0)));
      const before = fixture.source.getFaceSurface(face).uv.project(point);
      const fixed = fixture.source.getFaceSurface(face).uv.project(point.clone().add(new THREE.Vector3(0.5, 0, 0)));
      expect(moved.u).toBeCloseTo(uv === 'copied' ? before.u : fixed.u);
      expect(moved.v).toBeCloseTo(uv === 'copied' ? before.v : fixed.v);
    }
  });

  it('shears copies about the whole input or about each piece', () => {
    const steps = (pivot: string) => [
      { kind: 'linear', parameters: { mode: 'fixed', count: 2, offsetX: 4 } },
      { kind: 'shear', parameters: { axis: 'y', along: 'x', mode: 'factor', factor: 1, pivot } },
    ];
    const centreY = (instance: SolidBrushInstance) => {
      const ys = modelVertices(instance).map((vertex) => vertex.y);
      return (Math.max(...ys) + Math.min(...ys)) / 2;
    };
    const whole = stackFixture(steps('whole')).compile().instances;
    expect(whole.map(centreY)).toEqual([expect.closeTo(-2), expect.closeTo(2)]);
    const piece = stackFixture(steps('piece')).compile().instances;
    expect(piece.map(centreY)).toEqual([expect.closeTo(0), expect.closeTo(0)]);
    for (const instance of [...whole, ...piece]) expectValid(instance);
  });

  it('feeds sheared brushes to later array copies and bevels', () => {
    const fixture = stackFixture([
      { kind: 'shear', parameters: { mode: 'factor', factor: 1 } },
      { kind: 'linear', parameters: { mode: 'fixed', count: 2, offsetZ: 3 } },
      'bevel',
    ]);
    const instances = fixture.compile().instances;
    expect(instances).toHaveLength(2);
    for (const instance of instances) {
      expect(rimX(instance, true) - rimX(instance, false)).toBeCloseTo(1, 1);
      expect(instance.brush.faces.length).toBeGreaterThan(6);
      expectValid(instance);
    }
  });

  it('shears the chamfer of a bevel placed before it', () => {
    const fixture = stackFixture(['bevel', { kind: 'shear', parameters: { mode: 'factor', factor: 1 } }]);
    const sheared = fixture.compile().instances[0];
    if (!sheared) throw new Error('Expected the sheared brush');
    expect(sheared.brush.faces.length).toBeGreaterThan(6);
    expect(rimX(sheared, true)).toBeGreaterThan(0.3);
    expectValid(sheared);
  });

  it('reuses its result while nothing changes and refreshes the brush when the angle does', () => {
    const fixture = stackFixture([{ kind: 'shear', parameters: { angle: 10 } }]);
    const first = fixture.compile();
    expect(first.extraDirtyBrushIds).toContain(fixture.source.id);
    const again = fixture.compile();
    expect(again.reusedVolumes).toBe(1);
    expect(again.instances[0]).toBe(first.instances[0]);
    expect(again.extraDirtyBrushIds).not.toContain(fixture.source.id);
    const settings = ModifierVolume.read(fixture.volume);
    const step = settings.modifiers[0];
    if (!step) throw new Error('Expected the shear step');
    ModifierVolume.write(fixture.volume, {
      ...settings,
      modifiers: [{ ...step, parameters: { ...step.parameters, angle: 30 } }],
    });
    const changed = fixture.compile();
    expect(changed.instances[0]).not.toBe(first.instances[0]);
    expect(changed.extraDirtyBrushIds).toContain(fixture.source.id);
    ModifierVolume.write(fixture.volume, { ...settings, modifiers: [{ ...step, enabled: false }] });
    const muted = fixture.compile();
    expect(muted.instances[0]).toBe(fixture.source);
    expect(muted.extraDirtyBrushIds).toContain(fixture.source.id);
  });

  it('bakes the lean into the authored brush and restores it on undo', () => {
    const fixture = stackFixture([{ kind: 'shear', parameters: { mode: 'factor', factor: 1 } }]);
    fixture.refresh();
    const bake = new CommandModifierVolumeBake(fixture.volume);
    bake.execute();
    expect(rimX(fixture.source, true)).toBeCloseTo(0.5);
    expectValid(fixture.source);
    bake.undo();
    expect(rimX(fixture.source, true)).toBeCloseTo(0);
  });

  it('shows the lean in the compiled solid and drops it when muted', () => {
    const fixture = stackFixture([{ kind: 'shear', parameters: { mode: 'factor', factor: 1 } }]);
    fixture.refresh();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(1);
    const settings = ModifierVolume.read(fixture.volume);
    ModifierVolume.write(fixture.volume, {
      modifiers: settings.modifiers.map((entry) => ({ ...entry, enabled: false })),
    });
    fixture.refresh();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(0.5);
  });

  it('offers a Shear Volume template with a shear modifier', () => {
    const volume = modifierVolumeTemplateCreate('shear');
    expect(volume.name).toContain('Shear Volume');
    expect(ModifierVolume.read(volume).modifiers.map((entry) => entry.kind)).toEqual(['shear']);
  });
});
