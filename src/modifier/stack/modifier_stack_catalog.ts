import type { ModifierStackKind } from './kinds/modifier_stack_kind.js';
import { ModifierStackKindBevel } from './kinds/bevel/modifier_stack_kind_bevel.js';
import { ModifierStackKindArrayLinear } from './kinds/array/modifier_stack_kind_array_linear.js';
import { ModifierStackKindArrayRadial } from './kinds/array/modifier_stack_kind_array_radial.js';
import { ModifierStackKindArrayTransform } from './kinds/array/modifier_stack_kind_array_transform.js';
import { ModifierStackKindArrayMirror } from './kinds/array/modifier_stack_kind_array_mirror.js';
import { ModifierStackKindSmooth } from './kinds/smooth/modifier_stack_kind_smooth.js';
import { ModifierStackKindShear } from './kinds/shear/modifier_stack_kind_shear.js';
import { ModifierStackKindStairs } from './kinds/generator/modifier_stack_kind_stairs.js';
import { ModifierStackKindArch } from './kinds/generator/modifier_stack_kind_arch.js';
import { ModifierStackKindBlastHole } from './kinds/generator/modifier_stack_kind_blast_hole.js';
import { ModifierStackKindColumn } from './kinds/generator/modifier_stack_kind_column.js';
import { ModifierStackKindCylinder } from './kinds/generator/primitive/modifier_stack_kind_cylinder.js';
import { ModifierStackKindCone } from './kinds/generator/primitive/modifier_stack_kind_cone.js';
import { ModifierStackKindSphere } from './kinds/generator/primitive/modifier_stack_kind_sphere.js';
import { ModifierStackKindCapsule } from './kinds/generator/primitive/modifier_stack_kind_capsule.js';
import { ModifierStackKindTorus } from './kinds/generator/primitive/modifier_stack_kind_torus.js';
import { ModifierStackKindPipe } from './kinds/generator/primitive/modifier_stack_kind_pipe.js';
import { ModifierStackKindPyramid } from './kinds/generator/primitive/modifier_stack_kind_pyramid.js';
import { ModifierStackKindPrism } from './kinds/generator/primitive/modifier_stack_kind_prism.js';
import { ModifierStackKindIcosphere } from './kinds/generator/primitive/modifier_stack_kind_icosphere.js';
import { ModifierStackKindRhombicuboctahedron } from './kinds/generator/primitive/modifier_stack_kind_rhombicuboctahedron.js';
import { ModifierStackKindHollowBox } from './kinds/generator/primitive/modifier_stack_kind_hollow_box.js';
import { ModifierStackKindCurvedStairs } from './kinds/generator/primitive/modifier_stack_kind_curved_stairs.js';
import { ModifierStackKindSolidScript } from './kinds/generator/solid_script/modifier_stack_kind_solid_script.js';
import { ModifierStackKindSolidScriptModifier } from './kinds/generator/solid_script/modifier_stack_kind_solid_script_modifier.js';
import { ModifierStackKindPhysicsShatter } from './kinds/shatter/modifier_stack_kind_physics_shatter.js';
import { ModifierStackKindPath } from './kinds/generator/path/modifier_stack_kind_path.js';
import { physicsShatterBakeDecode } from './kinds/shatter/sim/physics_shatter_bake.js';

/** Every installed modifier kind, in add-menu order. */
export const modifierStackKinds: readonly ModifierStackKind[] = [
  new ModifierStackKindStairs(),
  new ModifierStackKindArch(),
  new ModifierStackKindBlastHole(),
  new ModifierStackKindColumn(),
  new ModifierStackKindCylinder(),
  new ModifierStackKindCone(),
  new ModifierStackKindSphere(),
  new ModifierStackKindCapsule(),
  new ModifierStackKindTorus(),
  new ModifierStackKindPipe(),
  new ModifierStackKindPyramid(),
  new ModifierStackKindPrism(),
  new ModifierStackKindRhombicuboctahedron(),
  new ModifierStackKindIcosphere(),
  new ModifierStackKindHollowBox(),
  new ModifierStackKindCurvedStairs(),
  new ModifierStackKindSolidScript(),
  new ModifierStackKindSolidScriptModifier(),
  new ModifierStackKindPath(),
  new ModifierStackKindArrayLinear(),
  new ModifierStackKindArrayRadial(),
  new ModifierStackKindArrayTransform(),
  new ModifierStackKindArrayMirror(),
  new ModifierStackKindShear(),
  new ModifierStackKindBevel(),
  new ModifierStackKindSmooth(),
  new ModifierStackKindPhysicsShatter(physicsShatterBakeDecode),
];

/**
 * Finds an installed kind.
 *
 * @param id Persisted kind id.
 * @returns Kind, or undefined when not installed.
 */
export function modifierStackKindFind(id: string): ModifierStackKind | undefined {
  return modifierStackKinds.find((kind) => kind.id === id);
}
