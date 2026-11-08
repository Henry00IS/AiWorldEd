import type { CurvePreset } from './curve_preset.js';
import { curvePresetGrid, curvePresetStack, type CurvePresetStackBlock } from './curve_preset_stack.js';

/** Rounded stone corners of the cairn. */
const CURVE_PRESET_CAIRN_STONE = { section: 'square', cornerSize: 0.5, cornerSides: 3 } as const;

/** Cairn stones bottom to top: height range, widest radius and turn. */
const CURVE_PRESET_CAIRN_STONES: readonly (readonly [number, number, number, number])[] = [
  [0, 0.24, 0.8, 0],
  [0.24, 0.44, 0.66, 35],
  [0.44, 0.62, 0.56, -20],
  [0.62, 0.78, 0.46, 60],
  [0.78, 0.9, 0.36, 15],
  [0.9, 1, 0.26, 50],
];

/**
 * Builds the cairn stones, each swelling to its widest at mid height and
 * narrowing toward its top, turned on the stone below.
 *
 * @returns Blocks bottom to top.
 */
function curvePresetCairnBlocks(): CurvePresetStackBlock[] {
  return CURVE_PRESET_CAIRN_STONES.flatMap(([from, to, radius, rotation]): CurvePresetStackBlock[] => {
    const middle = curvePresetGrid((from + to) / 2);
    const narrow = curvePresetGrid(radius * 0.8);
    return [
      { ...CURVE_PRESET_CAIRN_STONE, from, to: middle, radius: narrow, top: radius, rotation },
      { ...CURVE_PRESET_CAIRN_STONE, from: middle, to, radius, top: narrow, rotation },
    ];
  });
}

/** Rounded floor plate corners of the turning-floor tower. */
const CURVE_PRESET_FLOOR_PLATE = { section: 'square', cornerSize: 0.4, cornerSides: 3 } as const;

/** Extra turn of each floor over the one below it, ramping up and down again. */
const CURVE_PRESET_FLOOR_TURNS = [0, 4, 8, 10, 12, 14, 16, 18, 18, 18, 18, 16, 14, 12, 10, 8];

/**
 * Builds the sixteen floors of the turning-floor tower: a thin balcony slab
 * under a recessed storey, both turned by the floor's accumulated angle.
 *
 * @returns Blocks bottom to top, above a round podium.
 */
function curvePresetFloorTowerBlocks(): CurvePresetStackBlock[] {
  let rotation = 0;
  const floors = CURVE_PRESET_FLOOR_TURNS.flatMap((turn, floor): CurvePresetStackBlock[] => {
    rotation += turn;
    const from = curvePresetGrid(0.04 + floor * 0.06);
    return [
      { ...CURVE_PRESET_FLOOR_PLATE, from, to: curvePresetGrid(from + 0.01), radius: 0.68, rotation },
      {
        ...CURVE_PRESET_FLOOR_PLATE,
        from: curvePresetGrid(from + 0.01),
        to: curvePresetGrid(from + 0.06),
        radius: 0.6,
        rotation,
      },
    ];
  });
  return [{ from: 0, to: 0.04, radius: 0.78 }, ...floors];
}

/**
 * Builds the nine five-storey cubes of the turning tower, a tall lobby cube
 * first, each turned 11.25 degrees further with a slim gap showing the core.
 *
 * @returns Blocks bottom to top.
 */
function curvePresetTurningTowerBlocks(): CurvePresetStackBlock[] {
  return Array.from({ length: 9 }, (_, index) => ({
    section: 'square' as const,
    from: index === 0 ? 0 : curvePresetGrid(0.13 + (index - 1) * 0.11),
    to: index === 0 ? 0.12 : curvePresetGrid(0.23 + (index - 1) * 0.11),
    radius: 0.66,
    rotation: index * 11.25,
  }));
}

/**
 * Stacks whose blocks or tiers are each turned by their own segment rotation
 * about the axis.
 */
export const CURVE_PRESETS_ROTATED_STACKS: readonly CurvePreset[] = [
  {
    id: 'block_stack',
    label: 'Block stack',
    tooltip:
      'Toy blocks on a pole, each turned its own way. Letter blocks go back to Plat (1594) and Locke (1693). Use for nurseries, toy shops and playful puzzle props; a tall thin volume keeps the blocks cubic.',
    markers: { bottom: 0.03, top: 0.98 },
    group: 'Props · stacked blocks',
    ...curvePresetStack(
      [
        { from: 0, to: 0.03, radius: 0.8 },
        { section: 'square', from: 0.05, to: 0.22, radius: 0.66 },
        { section: 'square', from: 0.24, to: 0.41, radius: 0.66, rotation: 30 },
        { section: 'square', from: 0.43, to: 0.6, radius: 0.66, rotation: 10 },
        { section: 'square', from: 0.62, to: 0.79, radius: 0.66, rotation: 45 },
        { section: 'square', from: 0.81, to: 0.98, radius: 0.66, rotation: 20 },
        { from: 0.98, to: 1, radius: 0.16, top: 0.1 },
      ],
      0.12,
    ),
  },
  {
    id: 'stone_cairn',
    label: 'Stone cairn',
    tooltip:
      'Rounded stones piled smaller toward the top, each turned on the one below. Cairns have marked summits, paths and graves since prehistory. Use as trail waypoints, shrine markers or puzzle hints outdoors.',
    markers: { bottom: 0.24, top: 0.9 },
    group: 'Props · stacked blocks',
    ...curvePresetStack(curvePresetCairnBlocks(), 0),
  },
  {
    id: 'turning_tower',
    label: 'Turning tower',
    tooltip:
      "Nine cubes, each turned a little further around a core to 90° at the top, after Calatrava's Turning Torso (Malmö, 2005). Use as a landmark skyscraper, wizard tower or sci-fi spire.",
    markers: { bottom: 0.12, top: 0.9 },
    group: 'Architecture · rotated tiers',
    ...curvePresetStack(curvePresetTurningTowerBlocks(), 0.5),
  },
  {
    id: 'turning_floor_tower',
    label: 'Turning floor tower',
    tooltip:
      'Rounded floors with wrap-around balconies, each turned up to 18° more, about 200° in all, after the Absolute World towers (Mississauga, 2012). Set Depth / width near 0.6 for oval floors. Use for skylines.',
    markers: { bottom: 0.04, top: 0.94 },
    group: 'Architecture · rotated tiers',
    ...curvePresetStack(curvePresetFloorTowerBlocks(), 0),
  },
  {
    id: 'diagonal_pinnacle',
    label: 'Diagonal pinnacle',
    tooltip:
      'A square buttress pinnacle whose upper stage and spire are set diagonally, as in English Decorated and Perpendicular Gothic. Use on church buttresses, parapet corners, gate piers and tomb canopies.',
    markers: { bottom: 0.1, top: 0.5 },
    group: 'Architecture · rotated tiers',
    ...curvePresetStack(
      [
        { section: 'square', from: 0, to: 0.1, radius: 0.72 },
        { section: 'square', from: 0.1, to: 0.46, radius: 0.56 },
        { section: 'square', from: 0.46, to: 0.5, radius: 0.64 },
        { section: 'square', from: 0.5, to: 0.64, radius: 0.48, rotation: 45 },
        { section: 'square', from: 0.64, to: 0.97, radius: 0.48, top: 0.05, rotation: 45 },
        { from: 0.97, to: 1, radius: 0.1, top: 0 },
      ],
      0,
    ),
  },
];
