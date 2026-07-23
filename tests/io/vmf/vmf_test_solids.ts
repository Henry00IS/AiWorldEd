/**
 * Shared VMF solid snippets with correct Hammer outward plane winding.
 */

/**
 * Builds a VMF document with one axis-aligned world solid.
 * @param min Inclusive minimum corner in Source inches (Z-up).
 * @param max Inclusive maximum corner in Source inches (Z-up).
 * @param material Material applied to every side.
 * @param solidId Solid id keyvalue.
 * @returns Complete minimal VMF text.
 */
export function buildAxisAlignedWorldSolidVmf(
  min: { x: number; y: number; z: number },
  max: { x: number; y: number; z: number },
  material: string = 'DEV/DEV_MEASUREGENERIC01',
  solidId: number = 42
): string {
  const sides = buildAxisAlignedSideBlocks(min, max, material);
  return `
world
{
	"id" "1"
	"classname" "worldspawn"
	"skyname" "sky_test"
	solid
	{
		"id" "${solidId}"
${sides}
	}
}
`;
}

/**
 * Builds six side blocks for an axis-aligned Source box.
 * @param min Inclusive minimum corner.
 * @param max Inclusive maximum corner.
 * @param material Material name for every side.
 * @returns Indented VMF side text.
 */
export function buildAxisAlignedSideBlocks(
  min: { x: number; y: number; z: number },
  max: { x: number; y: number; z: number },
  material: string
): string {
  const { x: x0, y: y0, z: z0 } = min;
  const { x: x1, y: y1, z: z1 } = max;
  const planes = [
    `(${x0} ${y0} ${z1}) (${x0} ${y1} ${z1}) (${x1} ${y1} ${z1})`,
    `(${x0} ${y0} ${z0}) (${x1} ${y0} ${z0}) (${x1} ${y1} ${z0})`,
    `(${x0} ${y0} ${z1}) (${x1} ${y0} ${z1}) (${x1} ${y0} ${z0})`,
    `(${x1} ${y1} ${z0}) (${x1} ${y0} ${z0}) (${x1} ${y0} ${z1})`,
    `(${x0} ${y1} ${z0}) (${x1} ${y1} ${z0}) (${x1} ${y1} ${z1})`,
    `(${x0} ${y1} ${z1}) (${x0} ${y0} ${z1}) (${x0} ${y0} ${z0})`
  ];
  const uAxes = [
    '[1 0 0 0] 0.25',
    '[1 0 0 0] 0.25',
    '[1 0 0 0] 0.25',
    '[0 1 0 0] 0.25',
    '[1 0 0 0] 0.25',
    '[0 1 0 0] 0.25'
  ];
  const vAxes = [
    '[0 -1 0 0] 0.25',
    '[0 -1 0 0] 0.25',
    '[0 0 -1 0] 0.25',
    '[0 0 -1 0] 0.25',
    '[0 0 -1 0] 0.25',
    '[0 0 -1 0] 0.25'
  ];
  return planes
    .map((plane, index) => {
      const id = index + 1;
      return `		side
		{
			"id" "${id}"
			"plane" "${plane}"
			"material" "${material}"
			"uaxis" "${uAxes[index]}"
			"vaxis" "${vAxes[index]}"
			"rotation" "0"
			"lightmapscale" "16"
			"smoothing_groups" "0"
		}`;
    })
    .join('\n');
}
