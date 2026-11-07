import { Matrix4 } from 'three';
import { generatorAroundPivot, generatorAxis } from '../../modifier_generator_math.js';
import type { GeneratorContext, GeneratorKind } from '../../modifier_generator_types.js';

/**
 * Reflects across one plane in the chosen basis. @param index Placement index.
 * @param context Settings.
 */
function mirrorTransform(index: number, context: GeneratorContext): Matrix4 {
  if (index === 0) return new Matrix4();
  const axis = generatorAxis(context.settings.parameters['axis']);
  const scale = axis.clone().multiplyScalar(-2).addScalar(1);
  const reflection = new Matrix4().makeScale(scale.x, scale.y, scale.z);
  const pivot = axis.multiplyScalar(Number(context.settings.parameters['planeOffset']));
  return generatorAroundPivot(reflection, pivot);
}
/** Mirrored convex copies have outward winding and optional readable copied UVs. */
const kind: GeneratorKind = {
  id: 'mirror',
  label: 'Mirror Volume',
  count: 2,
  fields: [
    { key: 'axis', label: 'Plane normal axis', type: 'choice', default: 'x', choices: ['x', 'y', 'z'] },
    { key: 'planeOffset', label: 'Plane offset metres', type: 'number', default: 0 },
    {
      key: 'readable',
      label: 'Keep text readable',
      type: 'boolean',
      default: true,
      visible: (settings) => settings.uv === 'copied',
    },
  ],
  transform: mirrorTransform,
};
export default kind;
