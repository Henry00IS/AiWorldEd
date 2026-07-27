import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CadRulerLineBatch } from '../../src/rulers/cad_ruler_line_batch.js';
import type { CadLineSegment } from '../../src/rulers/cad_dimension_geometry.js';

describe('CadRulerLineBatch', () => {
  let batch: CadRulerLineBatch;

  beforeEach(() => {
    batch = new CadRulerLineBatch('test_batch');
  });

  it('should start empty and hidden', () => {
    expect(batch.getSegmentCount()).toBe(0);
    expect(batch.isVisible()).toBe(false);
  });

  it('should upload segments and become visible', () => {
    const color = new THREE.Color(0xffffff);
    const segments: CadLineSegment[] = [
      { ax: 0, ay: 0, az: 0, bx: 1, by: 0, bz: 0, colorA: color, colorB: color },
      { ax: 0, ay: 0, az: 0, bx: 0, by: 1, bz: 0, colorA: color, colorB: color },
    ];
    batch.setSegments(segments);
    expect(batch.getSegmentCount()).toBe(2);
    expect(batch.isVisible()).toBe(true);
  });

  it('should clear segments and hide', () => {
    const color = new THREE.Color(0xffffff);
    batch.setSegments([{ ax: 0, ay: 0, az: 0, bx: 1, by: 0, bz: 0, colorA: color, colorB: color }]);
    batch.clear();
    expect(batch.getSegmentCount()).toBe(0);
    expect(batch.isVisible()).toBe(false);
  });

  it('should mark the root as a CAD ruler helper', () => {
    expect(batch.getObject().userData['isCadRuler']).toBe(true);
  });

  it('should grow capacity for large segment uploads without throwing', () => {
    const color = new THREE.Color(0xffffff);
    const segments: CadLineSegment[] = [];
    for (let index = 0; index < 200; index += 1) {
      segments.push({
        ax: index,
        ay: 0,
        az: 0,
        bx: index + 1,
        by: 0,
        bz: 0,
        colorA: color,
        colorB: color,
      });
    }
    expect(() => batch.setSegments(segments)).not.toThrow();
    expect(batch.getSegmentCount()).toBe(200);
  });

  it('should dispose without throwing', () => {
    expect(() => batch.dispose()).not.toThrow();
  });

  it('disables depth testing and hides occluded pass for orthographic 2D', () => {
    const color = new THREE.Color(0xffffff);
    batch.setSegments([{ ax: 0, ay: 0, az: 0, bx: 1, by: 0, bz: 0, colorA: color, colorB: color }]);
    expect(batch.isDepthOcclusionEnabled()).toBe(true);
    expect(batch.getFrontMaterial().depthTest).toBe(true);
    expect(batch.isOccludedPassVisible()).toBe(true);
    batch.setDepthOcclusionEnabled(false);
    expect(batch.isDepthOcclusionEnabled()).toBe(false);
    expect(batch.getFrontMaterial().depthTest).toBe(false);
    expect(batch.getFrontMaterial().depthFunc).toBe(THREE.AlwaysDepth);
    expect(batch.getOccludedMaterial().depthTest).toBe(false);
    expect(batch.isOccludedPassVisible()).toBe(false);
    batch.setDepthOcclusionEnabled(true);
    expect(batch.getFrontMaterial().depthTest).toBe(true);
    expect(batch.getFrontMaterial().depthFunc).toBe(THREE.LessEqualDepth);
    expect(batch.getOccludedMaterial().depthFunc).toBe(THREE.GreaterDepth);
    expect(batch.isOccludedPassVisible()).toBe(true);
  });
});
