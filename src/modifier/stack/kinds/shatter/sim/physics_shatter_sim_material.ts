import type { PhysicsShatterMaterial } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_materials.js';

/** How the loose pieces of one material move once the blast frees them. */
export interface PhysicsShatterSimMaterial {
  /** Density in kilograms per cubic metre. */
  readonly density: number;
  /** Surface friction once the launch is over. */
  readonly friction: number;
  /** Bounciness. */
  readonly restitution: number;
  /** Linear damping per second. */
  readonly linearDamping: number;
  /** Angular damping per second. */
  readonly angularDamping: number;
  /** Multiplier on the blast launch speed. */
  readonly blast: number;
  /** Multiplier on the launch spin. */
  readonly tumble: number;
}

/** Physics of Custom unless its rows say otherwise. */
export const PHYSICS_SHATTER_SIM_MATERIAL_CUSTOM: PhysicsShatterSimMaterial = {
  density: 2000,
  friction: 0.7,
  restitution: 0.1,
  linearDamping: 0.3,
  angularDamping: 0.8,
  blast: 1,
  tumble: 1,
};

/** Physics per material preset. Ceramic is tile and porcelain. */
export const PHYSICS_SHATTER_SIM_MATERIALS: Readonly<Record<PhysicsShatterMaterial, PhysicsShatterSimMaterial>> = {
  glass: physicsShatterSimMaterialOf(2500, 0.3, 0.18, 0.15, 0.45, 1.35, 1.1),
  temperedGlass: physicsShatterSimMaterialOf(2500, 0.28, 0.08, 0.25, 1.0, 1.2, 0.2),
  stone: physicsShatterSimMaterialOf(2600, 0.75, 0.08, 0.5, 1.2, 0.7, 0.45),
  concrete: physicsShatterSimMaterialOf(2400, 0.78, 0.05, 0.55, 1.3, 0.65, 0.5),
  wood: physicsShatterSimMaterialOf(650, 0.45, 0.16, 0.3, 0.4, 1.15, 1.7),
  ceramic: physicsShatterSimMaterialOf(2200, 0.4, 0.22, 0.2, 0.55, 1.1, 0.95),
  plaster: physicsShatterSimMaterialOf(1000, 0.55, 0.03, 1.4, 2.2, 1.25, 0.35),
  brick: physicsShatterSimMaterialOf(1800, 0.7, 0.1, 0.45, 0.9, 0.85, 0.75),
  custom: PHYSICS_SHATTER_SIM_MATERIAL_CUSTOM,
};

/** Parameter key and range of each Custom physics row. */
export const PHYSICS_SHATTER_SIM_MATERIAL_ROWS: Readonly<
  Record<keyof PhysicsShatterSimMaterial, { key: string; min: number; max: number }>
> = {
  density: { key: 'physicsDensity', min: 50, max: 20000 },
  friction: { key: 'physicsFriction', min: 0, max: 2 },
  restitution: { key: 'physicsRestitution', min: 0, max: 1 },
  linearDamping: { key: 'physicsLinearDamping', min: 0, max: 10 },
  angularDamping: { key: 'physicsAngularDamping', min: 0, max: 10 },
  blast: { key: 'physicsBlast', min: 0, max: 5 },
  tumble: { key: 'physicsTumble', min: 0, max: 5 },
};

/** Parameter keys of the Custom physics rows, for the bake key. */
export const PHYSICS_SHATTER_SIM_MATERIAL_KEYS: readonly string[] = Object.values(
  PHYSICS_SHATTER_SIM_MATERIAL_ROWS,
).map((row) => row.key);

/**
 * Builds one table entry.
 *
 * @param density Density in kilograms per cubic metre.
 * @param friction Surface friction.
 * @param restitution Bounciness.
 * @param linearDamping Linear damping per second.
 * @param angularDamping Angular damping per second.
 * @param blast Launch speed multiplier.
 * @param tumble Spin multiplier.
 * @returns Material physics.
 */
function physicsShatterSimMaterialOf(
  density: number,
  friction: number,
  restitution: number,
  linearDamping: number,
  angularDamping: number,
  blast: number,
  tumble: number,
): PhysicsShatterSimMaterial {
  return { density, friction, restitution, linearDamping, angularDamping, blast, tumble };
}

/**
 * Returns the physics of a material: the preset's, or for Custom its rows, each
 * clamped to its range and the default when missing.
 *
 * @param material Material id of the last run.
 * @param parameters Stored modifier parameters.
 * @returns Material physics.
 */
export function physicsShatterSimMaterialRead(
  material: PhysicsShatterMaterial,
  parameters: Record<string, unknown>,
): PhysicsShatterSimMaterial {
  const preset = PHYSICS_SHATTER_SIM_MATERIALS[material] ?? PHYSICS_SHATTER_SIM_MATERIAL_CUSTOM;
  if (material !== 'custom') return preset;
  const read = (name: keyof PhysicsShatterSimMaterial): number => {
    const row = PHYSICS_SHATTER_SIM_MATERIAL_ROWS[name];
    const value = parameters[row.key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return preset[name];
    return Math.min(row.max, Math.max(row.min, value));
  };
  return physicsShatterSimMaterialOf(
    read('density'),
    read('friction'),
    read('restitution'),
    read('linearDamping'),
    read('angularDamping'),
    read('blast'),
    read('tumble'),
  );
}
