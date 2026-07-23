import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '../../src/solid/brush/solid_brush_factory.js';
import { SolidBrushPlaneClip } from '../../src/solid/brush/solid_brush_plane_clip.js';
import { SolidBrushValidator } from '../../src/solid/brush/solid_brush_validator.js';
import { SolidPlane } from '../../src/solid/brush/solid_plane.js';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { ClipSolidBrushCommand } from '../../src/commands/clip_solid_brush_command.js';
import { SolidBrushVisual } from '../../src/solid/model/solid_brush_visual.js';

/**
 * Unit tests for solid brush plane clipping used by the clip tool.
 */
describe('SolidBrushPlaneClip', () => {
  it('clips a unit box keeping the positive X half as a valid solid', () => {
    const brush = SolidBrushFactory.createCenteredBox(2, 2, 2);
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), 0);
    const clipped = SolidBrushPlaneClip.clipKeepInside(brush, plane);
    expect(clipped).not.toBeNull();
    const validation = SolidBrushValidator.validate(clipped!);
    expect(validation.valid, validation.errors.join('; ')).toBe(true);
    const bounds = clipped!.computeLocalBounds();
    expect(bounds.max.x).toBeCloseTo(0, 3);
    expect(bounds.min.x).toBeCloseTo(-1, 3);
  });

  it('clips a solid brush in a solid model via command', () => {
    const model = new SolidModel('ClipBrushModel');
    const instance = model.addBoxBrush(2, SolidOperation.Additive);
    expect(instance.mesh).toBeTruthy();
    expect(SolidBrushVisual.isBrushObject(instance.mesh!)).toBe(true);
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const command = new ClipSolidBrushCommand(
      model,
      instance.id,
      plane,
      false
    );
    command.execute();
    expect(command.didClip()).toBe(true);
    const updated = model.findBrush(instance.id);
    expect(updated).toBeTruthy();
    const validation = SolidBrushValidator.validate(updated!.brush);
    expect(validation.valid).toBe(true);
    const bounds = updated!.brush.computeLocalBounds();
    expect(bounds.max.x).toBeLessThanOrEqual(0.01);
  });
});
