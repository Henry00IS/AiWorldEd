/**
 * Upgrades choice values stored before choices were saved by their Title Case
 * names, such as an Arch Style saved as tunnel, which now reads Tunnel. Each
 * old value has exactly one new one, and no new value is an old one, so
 * upgrading is safe to repeat on values already in the current format.
 */

/** Old stored values and their new ones, by field key. */
type ModifierStackChoiceUpgrades = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** X, Y and Z axes, saved in lower case before. */
const MODIFIER_STACK_UPGRADE_AXES = { x: 'X', y: 'Y', z: 'Z' } as const;

/** Volume or World space of the copy and shape modifiers. */
const MODIFIER_STACK_UPGRADE_SPACE = { volume: 'Volume', world: 'World' } as const;

/** Whole input or each piece, as the copy modifiers measure their bounds. */
const MODIFIER_STACK_UPGRADE_BOUNDS = { whole: 'Whole Input', piece: 'Each Piece' } as const;

/** How the textures of copies follow them. */
const MODIFIER_STACK_UPGRADE_COPY_UV = { copied: 'Move With Copy', world: 'World Aligned' } as const;

/** Fields shared by the Linear, Radial and Transform arrays. */
const MODIFIER_STACK_UPGRADE_ARRAY = {
  bounds: MODIFIER_STACK_UPGRADE_BOUNDS,
  space: MODIFIER_STACK_UPGRADE_SPACE,
  uv: MODIFIER_STACK_UPGRADE_COPY_UV,
} as const;

/** Old stored choice values and their new ones, by modifier kind and field key. */
export const MODIFIER_STACK_CHOICE_UPGRADES: Readonly<Record<string, ModifierStackChoiceUpgrades>> = {
  arch: {
    style: { ring: 'Voussoir Ring', wall: 'Wall With Opening', tunnel: 'Tunnel' },
    span: { x: 'Along X', z: 'Along Z' },
    shape: { round: 'Round', fit: 'Stretch To Top' },
    start: { centre: 'Centre', left: 'Left', right: 'Right' },
  },
  blastHole: { style: { jagged: 'Jagged', bricks: 'Bricks' } },
  curvedStairs: { direction: { ccw: 'Counter Clockwise', cw: 'Clockwise' } },
  linear: {
    ...MODIFIER_STACK_UPGRADE_ARRAY,
    mode: { fixed: 'Fixed Step', relative: 'Relative To Size', fit: 'Fit Distance', both: 'Size × Plus Step' },
  },
  mirror: {
    axis: MODIFIER_STACK_UPGRADE_AXES,
    plane: { center: 'Volume Centre', min: 'Negative Side', max: 'Positive Side' },
    space: MODIFIER_STACK_UPGRADE_SPACE,
    uv: MODIFIER_STACK_UPGRADE_COPY_UV,
  },
  prism: { axis: { z: 'Along Z', x: 'Along X', y: 'Upright' } },
  radial: {
    ...MODIFIER_STACK_UPGRADE_ARRAY,
    axis: MODIFIER_STACK_UPGRADE_AXES,
    centreSide: { '-z': 'Back', '+z': 'Front', '-x': 'Left', '+x': 'Right', '-y': 'Down', '+y': 'Up' },
    mode: { ring: 'Full Ring', arc: 'Arc', step: 'Angle Step' },
    origin: { ring: 'On The Ring', centre: 'Around Pivot' },
  },
  shear: {
    along: MODIFIER_STACK_UPGRADE_AXES,
    axis: MODIFIER_STACK_UPGRADE_AXES,
    mode: { angle: 'Angle', factor: 'Factor' },
    pivot: { whole: 'Centre Of Whole Input', piece: 'Centre Of Each Piece', volume: 'Volume Centre' },
    space: MODIFIER_STACK_UPGRADE_SPACE,
    uv: { copied: 'Move With Shape', world: 'World Aligned' },
  },
  sphere: { coverage: { full: 'Full Sphere', dome: 'Dome' } },
  stairs: {
    direction: { '+x': 'Right', '-x': 'Left', '+z': 'Front', '-z': 'Back' },
    fill: { slab: 'Sloped Slab', solid: 'Solid To Floor', floating: 'Floating Treads' },
    sizing: { rise: 'Target Rise', count: 'Step Count' },
  },
  transform: MODIFIER_STACK_UPGRADE_ARRAY,
};

/**
 * Upgrades the old stored choice values of one modifier's parameters to their
 * current names; every other value is kept as it is.
 *
 * @param kind Modifier kind id.
 * @param parameters Stored parameters.
 * @returns The same parameters when nothing was old, else an upgraded copy.
 */
export function modifierStackChoicesUpgrade(
  kind: string,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  const upgrades = MODIFIER_STACK_CHOICE_UPGRADES[kind];
  if (!upgrades) return parameters;
  let upgraded = parameters;
  for (const [key, values] of Object.entries(upgrades)) {
    const stored = parameters[key];
    const next = typeof stored === 'string' && Object.hasOwn(values, stored) ? values[stored] : undefined;
    if (next !== undefined) upgraded = { ...upgraded, [key]: next };
  }
  return upgraded;
}
