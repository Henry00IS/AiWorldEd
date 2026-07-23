import { describe, it, expect } from 'vitest';
import { VmfParser } from '../../../src/io/vmf/vmf_parser.js';
import {
  buildAxisAlignedSideBlocks,
  buildAxisAlignedWorldSolidVmf
} from './vmf_test_solids.js';

/**
 * Unit tests for the VMF text parser.
 */
describe('VmfParser', () => {
  it('parses version info, skyname, world solid, and entity solid', () => {
    const worldSolid = buildAxisAlignedSideBlocks(
      { x: -32, y: -32, z: -32 },
      { x: 32, y: 32, z: 32 },
      'DEV/DEV_MEASUREGENERIC01'
    );
    const entitySolid = buildAxisAlignedSideBlocks(
      { x: 0, y: 0, z: 0 },
      { x: 64, y: 64, z: 64 },
      'TOOLS/TOOLSNODRAW'
    );
    const source = `
versioninfo
{
	"editorversion" "400"
	"editorbuild" "3934"
	"mapversion" "1"
	"formatversion" "100"
	"prefab" "0"
}
viewsettings
{
	"bSnapToGrid" "1"
	"bShowGrid" "1"
	"bShowLogicalGrid" "0"
	"nGridSpacing" "8"
	"bShow3DGrid" "0"
}
world
{
	"id" "1"
	"mapversion" "1"
	"classname" "worldspawn"
	"skyname" "sky_day01_01"
	solid
	{
		"id" "100"
${worldSolid}
	}
}
entity
{
	"id" "2"
	"classname" "func_detail"
	solid
	{
		"id" "200"
${entitySolid}
	}
}
`;
    const world = new VmfParser().parse(source);
    expect(world.versionInfoEditorVersion).toBe(400);
    expect(world.versionInfoFormatVersion).toBe(100);
    expect(world.skyName).toBe('sky_day01_01');
    expect(world.solids).toHaveLength(1);
    expect(world.solids[0].id).toBe(100);
    expect(world.solids[0].sides).toHaveLength(6);
    expect(world.entities).toHaveLength(1);
    expect(world.entities[0].className).toBe('func_detail');
    expect(world.entities[0].solids).toHaveLength(1);
    expect(world.entities[0].solids[0].sides).toHaveLength(6);
  });

  it('parses plane points and UV axes from the first side', () => {
    const world = new VmfParser().parse(
      buildAxisAlignedWorldSolidVmf(
        { x: -32, y: -32, z: -32 },
        { x: 32, y: 32, z: 32 }
      )
    );
    const side = world.solids[0].sides[0];
    expect(side.plane.p1).toEqual({ x: -32, y: -32, z: 32 });
    expect(side.plane.p2).toEqual({ x: -32, y: 32, z: 32 });
    expect(side.plane.p3).toEqual({ x: 32, y: 32, z: 32 });
    expect(side.material).toBe('DEV/DEV_MEASUREGENERIC01');
    expect(side.uAxis).toEqual({
      x: 1,
      y: 0,
      z: 0,
      translation: 0,
      scale: 0.25
    });
    expect(side.vAxis.scale).toBe(0.25);
  });

  it('parses the example-map style first solid planes without crashing', () => {
    const snippet = `
world
{
	"id" "1"
	"classname" "worldspawn"
	solid
	{
		"id" "132654"
		side
		{
			"id" "35399"
			"plane" "(1568 1792 0) (1728 1792 0) (1728 1792 -64)"
			"material" "CONCRETE/CONCRETEFLOOR013A_C17"
			"uaxis" "[1 0 0 -208] 0.25"
			"vaxis" "[0 0 -1 0] 0.25"
			"rotation" "0"
			"lightmapscale" "8"
			"smoothing_groups" "0"
		}
		side
		{
			"id" "35400"
			"plane" "(1728 1920 -64) (1728 1792 -64) (1728 1792 0)"
			"material" "CONCRETE/CONCRETEFLOOR013A_C17"
			"uaxis" "[0 1 0 -256] 0.25"
			"vaxis" "[0 0 -1 0] 0.25"
			"rotation" "0"
			"lightmapscale" "8"
			"smoothing_groups" "0"
		}
		side
		{
			"id" "35401"
			"plane" "(1568 1920 0) (1568 1792 0) (1568 1792 -64)"
			"material" "TOOLS/TOOLSNODRAW"
			"uaxis" "[0 1 0 0] 0.25"
			"vaxis" "[0 0 -1 0] 0.25"
			"rotation" "0"
			"lightmapscale" "16"
			"smoothing_groups" "0"
		}
		side
		{
			"id" "35402"
			"plane" "(1568 1920 -64) (1728 1920 -64) (1728 1920 0)"
			"material" "CONCRETE/CONCRETEFLOOR013A_C17"
			"uaxis" "[1 0 0 -208] 0.25"
			"vaxis" "[0 0 -1 0] 0.25"
			"rotation" "0"
			"lightmapscale" "8"
			"smoothing_groups" "0"
		}
		side
		{
			"id" "35403"
			"plane" "(1568 1792 -64) (1728 1792 -64) (1728 1920 -64)"
			"material" "CONCRETE/CONCRETEFLOOR013A_C17"
			"uaxis" "[1 0 0 -208] 0.25"
			"vaxis" "[0 -1 0 256] 0.25"
			"rotation" "0"
			"lightmapscale" "8"
			"smoothing_groups" "0"
		}
		side
		{
			"id" "35404"
			"plane" "(1568 1792 0) (1568 1920 0) (1728 1920 0)"
			"material" "CONCRETE/CONCRETEFLOOR013A_C17"
			"uaxis" "[1 0 0 -288] 0.25"
			"vaxis" "[0 -1 0 256] 0.25"
			"rotation" "0"
			"lightmapscale" "8"
			"smoothing_groups" "0"
		}
	}
}
`;
    const world = new VmfParser().parse(snippet);
    expect(world.solids).toHaveLength(1);
    expect(world.solids[0].sides).toHaveLength(6);
    expect(world.solids[0].sides[0].uAxis.translation).toBe(-208);
  });
});
