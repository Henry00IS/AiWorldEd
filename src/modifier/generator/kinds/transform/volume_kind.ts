import { Matrix4 } from 'three';
import { generatorRigidStep, generatorVector, generatorVectorFields } from '../../modifier_generator_math.js';
import type { GeneratorContext, GeneratorKind, GeneratorSettings } from '../../modifier_generator_types.js';

/**
 * Shows pivot controls only when rotation is active. @param settings Normalized
 * settings.
 */
function rotationActive(settings: GeneratorSettings): boolean {
  return generatorVector(settings, 'rotation').lengthSq() > 1e-12;
}
/**
 * Composes a constant rigid step rather than bending a brush. @param index
 * Placement index. @param context Source snapshot.
 */
function transformArray(index: number, context: GeneratorContext): Matrix4 {
  const settings = context.settings;
  const step = generatorRigidStep(
    generatorVector(settings, 'offset'),
    generatorVector(settings, 'rotation'),
    generatorVector(settings, 'pivot'),
  );
  const result = new Matrix4();
  for (let iteration = 0; iteration < index; iteration++) result.multiply(step);
  return result;
}
/** Matrix powers allow arbitrary yaw, tilt, fans and rising rigid spirals. */
const kind: GeneratorKind = {
  id: 'transform',
  label: 'Transform Array Volume',
  fields: [
    ...generatorVectorFields('offset', 'Step metres', [0, 0.25, 0]),
    ...generatorVectorFields('rotation', 'Step rotation °', [0, 15, 0]),
    ...generatorVectorFields('pivot', 'Pivot offset', [0, 0, 0], rotationActive),
  ],
  transform: transformArray,
};
export default kind;
