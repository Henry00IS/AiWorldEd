import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VmfSolidImporter } from '../../../src/io/vmf/vmf_solid_importer.js';
import { SolidCsgCompiler } from '../../../src/solid/algorithm/solid_csg_compiler.js';
import { BrushMembership } from '../../../src/solid/algorithm/brush_membership.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import { SolidBrushValidator } from '../../../src/solid/brush/solid_brush_validator.js';
import { buildAxisAlignedWorldSolidVmf } from './vmf_test_solids.js';
import { buildAxisAlignedSideBlocks } from './vmf_test_solids.js';

/**
 * Builds a VMF with a large outer box and a smaller inner box.
 * @returns VMF text.
 */
function buildNestedBoxVmf(): string {
  const outer = buildAxisAlignedSideBlocks(
    { x: -128, y: -128, z: -128 },
    { x: 128, y: 128, z: 128 },
    'DEV/OUTER'
  );
  const inner = buildAxisAlignedSideBlocks(
    { x: -32, y: -32, z: -32 },
    { x: 32, y: 32, z: 32 },
    'DEV/INNER'
  );
  return `
world
{
	"id" "1"
	"classname" "worldspawn"
	solid
	{
		"id" "1"
${outer}
	}
	solid
	{
		"id" "2"
${inner}
	}
}
`;
}

/**
 * Returns membership of a point under ordered brush operations.
 * @param point Sample point in model space.
 * @param brushes Brush instances.
 * @returns True when inside the composed solid.
 */
function isInsideSolid(
  point: THREE.Vector3,
  brushes: ReturnType<
    import('../../../src/solid/model/solid_model.js').SolidModel['getBrushes']
  >
): boolean {
  let inside = false;
  for (const instance of brushes) {
    const modelBrush = instance.getModelSpaceBrush();
    const inBrush = BrushMembership.isInsidePlanes(point, modelBrush.planes);
    if (instance.operation === SolidOperation.Additive) {
      inside = inside || inBrush;
    } else if (instance.operation === SolidOperation.Subtractive) {
      inside = inside && !inBrush;
    } else {
      inside = inside && inBrush;
    }
  }
  return inside;
}

/**
 * CSG and duplication behavior for VMF-imported brushes.
 */
describe('VMF import CSG and duplicate', () => {
  it('subtracts an imported brush from another creating a cavity', () => {
    const result = new VmfSolidImporter().importFromText(buildNestedBoxVmf(), {
      rebuild: true
    });
    expect(result.importedBrushCount).toBe(2);
    const brushes = result.model.getBrushes();
    for (const brush of brushes) {
      const validation = SolidBrushValidator.validate(brush.brush);
      expect(validation.valid, validation.errors.join('; ')).toBe(true);
    }
    brushes[1].operation = SolidOperation.Subtractive;
    result.model.markDirty();
    result.model.rebuild(true);
    const origin = new THREE.Vector3(0, 0, 0);
    const shell = new THREE.Vector3(2, 0, 0);
    expect(isInsideSolid(origin, brushes)).toBe(false);
    expect(isInsideSolid(shell, brushes)).toBe(true);
    const polygons = new SolidCsgCompiler().compile(brushes);
    expect(polygons.length).toBeGreaterThan(6);
    const position = result.model.getResultMesh().geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
  });

  it('duplicates an imported brush with matching hull geometry not a unit box', () => {
    const result = new VmfSolidImporter().importFromText(
      buildAxisAlignedWorldSolidVmf(
        { x: 1568, y: 1792, z: -64 },
        { x: 1728, y: 1920, z: 0 },
        'DEV/A',
        99
      ),
      { rebuild: false }
    );
    const source = result.model.getBrushes()[0];
    const sourceBounds = source.brush.computeLocalBounds();
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    const sourceWorldCenter = source.position.clone();
    expect(sourceWorldCenter.length()).toBeGreaterThan(1);
    const clone = result.model.duplicateBrush(source.id);
    expect(clone).not.toBeNull();
    const cloneBounds = clone!.brush.computeLocalBounds();
    const cloneSize = cloneBounds.getSize(new THREE.Vector3());
    expect(cloneSize.x).toBeCloseTo(sourceSize.x, 4);
    expect(cloneSize.y).toBeCloseTo(sourceSize.y, 4);
    expect(cloneSize.z).toBeCloseTo(sourceSize.z, 4);
    expect(clone!.brush.faces.length).toBe(source.brush.faces.length);
    expect(clone!.brush.vertices.length).toBe(source.brush.vertices.length);
    expect(clone!.position.x).toBeCloseTo(sourceWorldCenter.x, 4);
    expect(clone!.position.y).toBeCloseTo(sourceWorldCenter.y, 4);
    expect(clone!.position.z).toBeCloseTo(sourceWorldCenter.z, 4);
    const previewBounds = new THREE.Box3().setFromObject(clone!.mesh!);
    const previewSize = previewBounds.getSize(new THREE.Vector3());
    expect(previewSize.x).toBeCloseTo(sourceSize.x, 3);
    expect(previewSize.y).toBeCloseTo(sourceSize.y, 3);
    expect(previewSize.z).toBeCloseTo(sourceSize.z, 3);
    const previewCenter = previewBounds.getCenter(new THREE.Vector3());
    expect(previewCenter.x).toBeCloseTo(sourceWorldCenter.x, 2);
    expect(previewCenter.z).toBeCloseTo(sourceWorldCenter.z, 2);
  });

  it('places imported brush position at the world center of the solid', () => {
    const result = new VmfSolidImporter().importFromText(
      buildAxisAlignedWorldSolidVmf(
        { x: -64, y: -64, z: 0 },
        { x: 64, y: 64, z: 128 }
      ),
      { rebuild: false }
    );
    const brush = result.model.getBrushes()[0];
    expect(brush.position.x).toBeCloseTo(0, 4);
    expect(brush.position.y).toBeCloseTo(2, 4);
    expect(brush.position.z).toBeCloseTo(0, 4);
    const localCenter = brush.brush
      .computeLocalBounds()
      .getCenter(new THREE.Vector3());
    expect(localCenter.length()).toBeLessThan(1e-4);
  });
});
