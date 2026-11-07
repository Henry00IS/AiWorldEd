import { Matrix4, Vector3 } from 'three';
import { generatorVector, generatorVectorFields } from '../../modifier_generator_math.js';
import type { GeneratorContext, GeneratorKind, GeneratorSettings } from '../../modifier_generator_types.js';

/** Chooses a spacing section. @param mode Requested spacing mode. */
function visibleMode(mode: string): (settings: GeneratorSettings) => boolean {
  return (settings) => settings.parameters['mode'] === mode;
}
/**
 * Computes a translation from immutable source bounds. @param index Placement
 * index including source zero. @param context Source snapshot.
 */
function linearTransform(index: number, context: GeneratorContext): Matrix4 {
  const { settings, bounds } = context;
  const mode = settings.parameters['mode'];
  const vector = generatorVector(settings, mode === 'relative' ? 'relative' : mode === 'fit' ? 'endpoint' : 'offset');
  if (mode === 'relative') vector.multiply(bounds.getSize(new Vector3()));
  if (mode === 'fit') vector.divideScalar(Math.max(1, settings.count - 1));
  vector.multiplyScalar(index);
  return new Matrix4().makeTranslation(vector.x, vector.y, vector.z);
}
/** Linear duplication preserves each source brush and compound. */
const kind: GeneratorKind = {
  id: 'linear',
  label: 'Linear Array Volume',
  fields: [
    { key: 'mode', label: 'Spacing', type: 'choice', default: 'fixed', choices: ['fixed', 'relative', 'fit'] },
    ...generatorVectorFields('offset', 'Step metres', [2, 0, 0], visibleMode('fixed')),
    ...generatorVectorFields('relative', 'Bounds multiple', [1.5, 0, 0], visibleMode('relative')),
    ...generatorVectorFields('endpoint', 'End displacement', [8, 0, 0], visibleMode('fit')),
  ],
  transform: linearTransform,
};
export default kind;
