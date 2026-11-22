import { GENERATOR_ICOSPHERE_SUBDIVISIONS, generatorIcosphere } from '@/generator/icosphere/generator_icosphere.js';
import type { SolidScriptBlockArguments } from '@/solid_script/language/solid_script_block_arguments.js';
import type { SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';

/**
 * Builds an Icosphere Mesh from its fields: a mesh of even triangles with every
 * corner Radius from the origin.
 *
 * @param args Block fields.
 * @returns Mesh.
 */
export function solidScriptIcosphere(args: SolidScriptBlockArguments): SolidScriptShapeMesh {
  const radius = args.number('radius', 1);
  if (!(radius > 0)) throw args.error('radius', 'must be greater than 0', radius);
  const subdivisions = args.number('subdivisions', 1);
  const { min, max } = GENERATOR_ICOSPHERE_SUBDIVISIONS;
  if (!Number.isInteger(subdivisions) || subdivisions < min || subdivisions > max)
    throw new Error(`Subdivisions must be a whole number from ${min} to ${max}, not ${subdivisions}`);
  const shape = generatorIcosphere(subdivisions);
  return {
    kind: 'mesh',
    label: 'icosphere_mesh',
    points: shape.points.map((point) => point.multiplyScalar(radius)),
    faces: shape.faces.map((face) => [...face]),
    uvs: shape.faces.map(() => null),
  };
}
