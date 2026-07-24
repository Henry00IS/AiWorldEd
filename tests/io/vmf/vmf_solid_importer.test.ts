import { describe, it, expect } from 'vitest';
import { VmfSolidImporter } from '../../../src/io/vmf/vmf_solid_importer.js';
import { VmfParser } from '../../../src/io/vmf/vmf_parser.js';
import { SolidBrushValidator } from '../../../src/solid/brush/solid_brush_validator.js';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import {
  buildAxisAlignedSideBlocks,
  buildAxisAlignedWorldSolidVmf
} from './vmf_test_solids.js';

/**
 * Unit tests for full VMF → solid model import.
 */
describe('VmfSolidImporter', () => {
  it('imports world brushes into one solid model and skips triggers', () => {
    const good = buildAxisAlignedSideBlocks(
      { x: -32, y: -32, z: -32 },
      { x: 32, y: 32, z: 32 },
      'DEV/DEV_MEASUREGENERIC01'
    );
    const trigger = buildAxisAlignedSideBlocks(
      { x: 100, y: 100, z: 100 },
      { x: 164, y: 164, z: 132 },
      'TOOLS/TOOLSTRIGGER'
    );
    const source = `
world
{
	"id" "1"
	"classname" "worldspawn"
	"skyname" "sky_test"
	solid
	{
		"id" "10"
${good}
	}
	solid
	{
		"id" "11"
${trigger}
	}
}
`;
    const result = new VmfSolidImporter().importFromText(source);
    expect(result.skyName).toBe('sky_test');
    expect(result.importedBrushCount).toBe(1);
    expect(result.skippedBrushCount).toBe(1);
    expect(result.model.getBrushCount()).toBe(1);
    expect(SolidModel.isSolidModelObject(result.model.root)).toBe(true);
    const brush = result.model.getBrushes()[0];
    const validation = SolidBrushValidator.validate(brush.brush);
    expect(validation.valid).toBe(true);
    expect(brush.mesh).not.toBeNull();
    expect(brush.getSurfaceMapping(0).textureId).toBe('dev/dev_measuregeneric01');
  });

  it('imports entity solids when enabled', () => {
    const detailSides = buildAxisAlignedSideBlocks(
      { x: -16, y: -16, z: -16 },
      { x: 16, y: 16, z: 16 },
      'BRICK/BRICKWALL001A'
    );
    const text = `
world
{
	"id" "1"
	"classname" "worldspawn"
}
entity
{
	"id" "2"
	"classname" "func_detail"
	solid
	{
		"id" "200"
${detailSides}
	}
}
`;
    const withEntities = new VmfSolidImporter().importFromText(text, {
      includeEntitySolids: true
    });
    expect(withEntities.importedBrushCount).toBe(1);
    const withoutEntities = new VmfSolidImporter().importFromText(text, {
      includeEntitySolids: false
    });
    expect(withoutEntities.importedBrushCount).toBe(0);
  });

  it('builds a solid model from a single world solid helper', () => {
    const result = new VmfSolidImporter().importFromText(
      buildAxisAlignedWorldSolidVmf(
        { x: -64, y: -64, z: 0 },
        { x: 64, y: 64, z: 128 },
        'CONCRETE/CONCRETEWALL001A',
        7
      )
    );
    expect(result.importedBrushCount).toBe(1);
    expect(result.model.getBrushes()[0].name).toBe('Solid 7');
  });

  it('imports a representative multi-solid VMF map without throwing', () => {
    const source = buildRepresentativeVmfMap();
    const parsed = new VmfParser().parse(source);
    expect(parsed.solids.length).toBeGreaterThan(0);
    const result = new VmfSolidImporter().importFromText(source, {
      modelName: 'Representative VMF',
      rebuild: false
    });
    expect(result.model.root.name).toBe('Representative VMF');
    expect(result.importedBrushCount).toBeGreaterThan(0);
    const totalSolids =
      parsed.solids.length +
      parsed.entities.reduce((sum, entity) => sum + entity.solids.length, 0);
    expect(result.importedBrushCount + result.skippedBrushCount).toBe(
      totalSolids
    );
    const sampleCount = Math.min(12, result.model.getBrushCount());
    for (let index = 0; index < sampleCount; index++) {
      const brush = result.model.getBrushes()[index];
      const validation = SolidBrushValidator.validate(brush.brush);
      expect(validation.valid, validation.errors.join('; ')).toBe(true);
      expect(brush.brush.faces.length).toBeGreaterThanOrEqual(4);
      expect(brush.brush.vertices.length).toBeGreaterThanOrEqual(4);
    }
    // Full CSG of an entire HL2 room is heavy; ensure at least one result exists.
    expect(result.model.getResultMesh()).toBeTruthy();
  });
});

/**
 * Builds a self-contained VMF map with world, entity, and skipped brushes.
 * @returns VMF source text representing a small but varied map.
 */
function buildRepresentativeVmfMap(): string {
  const worldSolids = [
    createVmfSolidBlock(10, { x: -128, y: -128, z: 0 }, { x: -64, y: -64, z: 64 }, 'CONCRETE/CONCRETEWALL001A'),
    createVmfSolidBlock(11, { x: -48, y: -48, z: 0 }, { x: 48, y: 48, z: 96 }, 'BRICK/BRICKWALL001A'),
    createVmfSolidBlock(12, { x: 64, y: 64, z: 0 }, { x: 128, y: 128, z: 32 }, 'DEV/DEV_MEASUREGENERIC01'),
    createVmfSolidBlock(13, { x: 160, y: 160, z: 0 }, { x: 192, y: 192, z: 32 }, 'TOOLS/TOOLSTRIGGER')
  ].join('\n');
  const detailSolid = createVmfSolidBlock(20, { x: -24, y: 64, z: 0 }, { x: 24, y: 112, z: 48 }, 'METAL/METALWALL001A');
  return `world\n{\n\t"id" "1"\n\t"classname" "worldspawn"\n\t"skyname" "sky_representative"\n${worldSolids}\n}\nentity\n{\n\t"id" "2"\n\t"classname" "func_detail"\n${detailSolid}\n}`;
}

/**
 * Builds one complete indented VMF solid block from axis-aligned bounds.
 * @param id VMF solid identifier.
 * @param min Minimum Source coordinate.
 * @param max Maximum Source coordinate.
 * @param material Material assigned to every side.
 * @returns VMF solid block.
 */
function createVmfSolidBlock(
  id: number,
  min: { x: number; y: number; z: number },
  max: { x: number; y: number; z: number },
  material: string
): string {
  return `\tsolid\n\t{\n\t\t"id" "${id}"\n${buildAxisAlignedSideBlocks(min, max, material)}\n\t}`;
}

