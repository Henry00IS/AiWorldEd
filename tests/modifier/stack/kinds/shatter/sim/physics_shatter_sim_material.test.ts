import { describe, expect, it } from 'vitest';
import { PHYSICS_SHATTER_MATERIALS } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_materials.js';
import {
  PHYSICS_SHATTER_SIM_MATERIAL_CUSTOM,
  PHYSICS_SHATTER_SIM_MATERIAL_KEYS,
  PHYSICS_SHATTER_SIM_MATERIALS,
  physicsShatterSimMaterialRead,
} from '@/modifier/stack/kinds/shatter/sim/physics_shatter_sim_material.js';
import { PHYSICS_SHATTER_SIM_PARAMETER_KEYS } from '@/modifier/stack/kinds/shatter/physics_shatter_bake_key.js';
import { physicsShatterBakeEncode } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_bake.js';
import { simTestRun, simTestSetup } from './physics_shatter_sim_fixture.js';

describe('physics shatter material physics', () => {
  it('has physics for every material id and reads presets regardless of the Custom rows', () => {
    for (const material of PHYSICS_SHATTER_MATERIALS)
      expect(PHYSICS_SHATTER_SIM_MATERIALS[material], material).toBeTruthy();
    expect(physicsShatterSimMaterialRead('glass', { physicsDensity: 10 })).toEqual(PHYSICS_SHATTER_SIM_MATERIALS.glass);
    expect(PHYSICS_SHATTER_SIM_MATERIALS.concrete).toMatchObject({ density: 2400, friction: 0.78, blast: 0.65 });
  });

  it('reads Custom from its rows, clamped, with defaults for missing values, and stales the bake on change', () => {
    expect(physicsShatterSimMaterialRead('custom', {})).toEqual(PHYSICS_SHATTER_SIM_MATERIAL_CUSTOM);
    const read = physicsShatterSimMaterialRead('custom', { physicsFriction: 5, physicsBlast: 2, physicsTumble: 'x' });
    expect(read).toMatchObject({ friction: 2, blast: 2, tumble: 1 });
    for (const key of PHYSICS_SHATTER_SIM_MATERIAL_KEYS) expect(PHYSICS_SHATTER_SIM_PARAMETER_KEYS).toContain(key);
  });

  it('throws plaster and concrete less far than glass, deterministically', async () => {
    const spread = async (material: 'glass' | 'plaster' | 'concrete') => {
      const setup = { ...simTestSetup({ crackSize: 0.5 }), material: PHYSICS_SHATTER_SIM_MATERIALS[material] };
      const result = await simTestRun(setup);
      const again = await simTestRun({
        ...simTestSetup({ crackSize: 0.5 }),
        material: PHYSICS_SHATTER_SIM_MATERIALS[material],
      });
      expect(physicsShatterBakeEncode(again.transforms)).toBe(physicsShatterBakeEncode(result.transforms));
      const distance = result.transforms.reduce((sum, transform) => sum + Math.abs(transform.translation.z), 0);
      return { distance: distance / result.transforms.length, steps: result.steps };
    };
    const glass = await spread('glass');
    const plaster = await spread('plaster');
    const concrete = await spread('concrete');
    expect(plaster.distance).toBeLessThan(glass.distance);
    expect(concrete.distance).toBeLessThan(glass.distance);
  }, 60000);
});
