import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  solidScriptExampleIf,
  solidScriptExampleInput,
  solidScriptExampleNote,
  solidScriptExamplePoint,
  solidScriptExamplePolyhedron,
  solidScriptExampleRepeat,
  solidScriptExampleSet,
} from './solid_script_example_lines.js';

/** Sides Input of the round shapes. */
const SOLID_SCRIPT_EXAMPLE_SIDES = solidScriptExampleInput('sides', 'count', '16', {
  label: 'Sides',
  min: '3',
  max: '64',
});

/**
 * Lines that add one ring of corners around the middle.
 *
 * @param scale Ring size compared to the widest ring, as field text.
 * @param z Height of the ring, as field text.
 * @returns Lines.
 */
function solidScriptExampleRing(scale: string, z: string): SolidScriptLine[] {
  return solidScriptExampleRepeat('i', '0', '[=[sides] - 1]', [
    solidScriptExampleSet('angle', '[=([i] + 0.5) * 360 / [sides]]'),
    solidScriptExamplePoint(
      `[=cos([angle]) * [width] / 2 * ${scale}], [=-sin([angle]) * [depth] / 2 * ${scale}], ${z}`,
    ),
  ]);
}

/**
 * Lines that add a ring, or a single point where the ring has shrunk to
 * nothing, such as the tip of a cone.
 *
 * @param scale Ring size compared to the widest ring, as field text.
 * @param z Height of the ring, as field text.
 * @returns Lines.
 */
function solidScriptExampleRingOrTip(scale: string, z: string): SolidScriptLine[] {
  return solidScriptExampleIf(
    `${scale} <= 0.000000001`,
    [solidScriptExamplePoint(`0, 0, ${z}`)],
    solidScriptExampleRing(scale, z),
  );
}

/** Port of the Cylinder generator. */
export const SOLID_SCRIPT_EXAMPLE_CYLINDER: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Cylinder: a ring of corners at the bottom and one at the top, wrapped into one solid.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  SOLID_SCRIPT_EXAMPLE_SIDES,
  ...solidScriptExamplePolyhedron([
    ...solidScriptExampleRing('1', '[=-[height] / 2]'),
    ...solidScriptExampleRing('1', '[=[height] / 2]'),
  ]),
];

/** Port of the Cone generator. */
export const SOLID_SCRIPT_EXAMPLE_CONE: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Cone: a ring at the bottom and a smaller ring, or a tip, at the top.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  SOLID_SCRIPT_EXAMPLE_SIDES,
  solidScriptExampleInput('topRadius', 'number', '0', { label: 'Top Radius', min: '0', max: '1' }),
  ...solidScriptExamplePolyhedron([
    ...solidScriptExampleRing('1', '[=-[height] / 2]'),
    ...solidScriptExampleRingOrTip('[topRadius]', '[=[height] / 2]'),
  ]),
];

/** Port of the Sphere generator. */
export const SOLID_SCRIPT_EXAMPLE_SPHERE: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Sphere: rings from the bottom pole to the top pole, each sized by how far round it is.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  SOLID_SCRIPT_EXAMPLE_SIDES,
  solidScriptExampleInput('coverage', 'choice', 'full', { label: 'Shape', choices: 'full, dome' }),
  solidScriptExampleInput('rings', 'count', '8', { label: 'Rings', min: '2', max: '32' }),
  solidScriptExampleSet('from', '-90'),
  solidScriptExampleSet('equator', '0'),
  solidScriptExampleSet('rise', '[=[height] / 2]'),
  ...solidScriptExampleIf('[coverage] == "dome"', [
    solidScriptExampleSet('from', '0'),
    solidScriptExampleSet('equator', '[=-[height] / 2]'),
    solidScriptExampleSet('rise', '[height]'),
  ]),
  ...solidScriptExamplePolyhedron(
    solidScriptExampleRepeat('ring', '0', '[rings]', [
      solidScriptExampleSet('latitude', '[=[from] + (90 - [from]) * [ring] / [rings]]'),
      ...solidScriptExampleRingOrTip('[=cos([latitude])]', '[=[equator] + [rise] * sin([latitude])]'),
    ]),
  ),
];

/** Port of the Capsule generator. */
export const SOLID_SCRIPT_EXAMPLE_CAPSULE: readonly SolidScriptLine[] = [
  solidScriptExampleNote('Capsule: a round end at the bottom and at the top, joined by straight sides.'),
  ...SOLID_SCRIPT_EXAMPLE_BOX_INPUTS,
  SOLID_SCRIPT_EXAMPLE_SIDES,
  solidScriptExampleInput('capRings', 'count', '4', { label: 'Cap Rings', min: '1', max: '16' }),
  solidScriptExampleSet('cap', '[=min([width] / 2, [height] / 2)]'),
  ...solidScriptExamplePolyhedron(
    solidScriptExampleRepeat('end', '0', '1', [
      solidScriptExampleSet('middle', '[=-[height] / 2 + [cap] + [end] * ([height] - 2 * [cap])]'),
      ...solidScriptExampleRepeat('ring', '0', '[capRings]', [
        solidScriptExampleSet('latitude', '[=-90 + 90 * [end] + 90 * [ring] / [capRings]]'),
        ...solidScriptExampleRingOrTip('[=cos([latitude])]', '[=[middle] + [cap] * sin([latitude])]'),
      ]),
    ]),
  ),
];
