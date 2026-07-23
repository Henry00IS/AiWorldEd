import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VmfParser } from '../../../src/io/vmf/vmf_parser.js';
import { VmfBrushFromSides } from '../../../src/io/vmf/vmf_brush_from_sides.js';
import { VmfHalfSpaceHullBuilder } from '../../../src/io/vmf/vmf_half_space_hull.js';
import { SolidBrushValidator } from '../../../src/solid/brush/solid_brush_validator.js';
import { SolidBrushFactory } from '../../../src/solid/brush/solid_brush_factory.js';
import { SolidPlane } from '../../../src/solid/brush/solid_plane.js';
import { VMF_INCHES_TO_METERS } from '../../../src/io/vmf/vmf_coordinates.js';
import { buildAxisAlignedWorldSolidVmf } from './vmf_test_solids.js';

/**
 * Unit tests for half-space hull math and VMF brush construction.
 */
describe('VmfBrushFromSides / half-space hull', () => {
  it('builds a valid convex box from three-plane intersections', () => {
    const size = 2 + Math.random() * 3;
    const half = size * 0.5;
    const planes = [
      new SolidPlane(new THREE.Vector3(1, 0, 0), -half),
      new SolidPlane(new THREE.Vector3(-1, 0, 0), -half),
      new SolidPlane(new THREE.Vector3(0, 1, 0), -half),
      new SolidPlane(new THREE.Vector3(0, -1, 0), -half),
      new SolidPlane(new THREE.Vector3(0, 0, 1), -half),
      new SolidPlane(new THREE.Vector3(0, 0, -1), -half)
    ];
    const hull = new VmfHalfSpaceHullBuilder().build(planes);
    expect(hull).not.toBeNull();
    expect(hull!.vertices.length).toBe(8);
    expect(hull!.faceLoops.length).toBe(6);
    const brush = SolidBrushFactory.createFromFaceLoops(
      hull!.faceLoops.map((loop) => loop.vertices)
    );
    expect(brush).not.toBeNull();
    const validation = SolidBrushValidator.validate(brush!);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it('imports an axis-aligned Source box with correct editor bounds', () => {
    const min = { x: 1568, y: 1792, z: -64 };
    const max = { x: 1728, y: 1920, z: 0 };
    const world = new VmfParser().parse(
      buildAxisAlignedWorldSolidVmf(min, max)
    );
    const built = new VmfBrushFromSides().build(world.solids[0]);
    expect(built).not.toBeNull();
    const validation = SolidBrushValidator.validate(built!.brush);
    expect(validation.valid).toBe(true);
    expect(built!.brush.faces.length).toBe(6);
    expect(built!.brush.vertices.length).toBe(8);
    const s = VMF_INCHES_TO_METERS;
    const expectedCenter = new THREE.Vector3(
      ((min.x + max.x) * 0.5) * s,
      ((min.z + max.z) * 0.5) * s,
      ((min.y + max.y) * 0.5) * s
    );
    expect(built!.worldCenter.x).toBeCloseTo(expectedCenter.x, 4);
    expect(built!.worldCenter.y).toBeCloseTo(expectedCenter.y, 4);
    expect(built!.worldCenter.z).toBeCloseTo(expectedCenter.z, 4);
    const bounds = built!.brush.computeLocalBounds();
    const size = bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo((max.x - min.x) * s, 4);
    expect(size.y).toBeCloseTo((max.z - min.z) * s, 4);
    expect(size.z).toBeCloseTo((max.y - min.y) * s, 4);
    expect(bounds.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-4);
  });

  it('preserves face materials and UV mapping metadata', () => {
    const world = new VmfParser().parse(
      buildAxisAlignedWorldSolidVmf(
        { x: -32, y: -32, z: -32 },
        { x: 32, y: 32, z: 32 }
      )
    );
    const built = new VmfBrushFromSides().build(world.solids[0]);
    expect(built).not.toBeNull();
    expect(built!.faceMappings.length).toBe(built!.brush.faces.length);
    expect(built!.materials.every((name) => name.length > 0)).toBe(true);
    expect(built!.faceMappings[0].textureId).toBe('dev/dev_measuregeneric01');
    expect(built!.faceMappings[0].align).toBe('face');
    expect(built!.faceMappings[0].scaleU).toBeGreaterThan(0);
  });

  it('rejects solids with fewer than four sides', () => {
    const world = new VmfParser().parse(`
world
{
	"id" "1"
	"classname" "worldspawn"
	solid
	{
		"id" "1"
		side
		{
			"id" "1"
			"plane" "(0 0 0) (1 0 0) (1 1 0)"
			"material" "DEV/DEV"
			"uaxis" "[1 0 0 0] 0.25"
			"vaxis" "[0 -1 0 0] 0.25"
			"rotation" "0"
			"lightmapscale" "16"
			"smoothing_groups" "0"
		}
	}
}
`);
    const built = new VmfBrushFromSides().build(world.solids[0]);
    expect(built).toBeNull();
  });
});
