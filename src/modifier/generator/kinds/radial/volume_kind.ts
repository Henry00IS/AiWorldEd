import { Matrix4, Vector3 } from 'three';
import {
  generatorAroundPivot,
  generatorAxis,
  generatorVector,
  generatorVectorFields,
} from '../../modifier_generator_math.js';
import type { GeneratorContext, GeneratorKind, GeneratorSettings } from '../../modifier_generator_types.js';

/**
 * Computes angle without duplicating a ring endpoint. @param index Placement
 * index. @param settings Normalized settings.
 */
export function radialAngle(index: number, settings: GeneratorSettings): number {
  const mode = settings.parameters['mode'];
  const step =
    mode === 'step'
      ? Number(settings.parameters['step'])
      : mode === 'arc'
        ? Number(settings.parameters['sweep']) / Math.max(1, settings.count - 1)
        : 360 / settings.count;
  return ((Number(settings.parameters['start']) + index * step) * Math.PI) / 180;
}
/**
 * Applies an outward radius shift before rotation. @param context Source bounds
 * and settings. @param pivot Pivot. @param axis Rotation axis.
 */
function radialRadiusOffset(context: GeneratorContext, pivot: Vector3, axis: Vector3): Vector3 {
  const radial = context.bounds.getCenter(new Vector3()).sub(pivot);
  radial.addScaledVector(axis, -radial.dot(axis));
  if (radial.lengthSq() < 1e-12) radial.copy(axis.y === 1 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0));
  return radial.normalize().multiplyScalar(Number(context.settings.parameters['radiusOffset']));
}
/**
 * Moves intact source operands around an axis. @param index Placement index.
 *
 * @param context Source snapshot.
 */
function radialTransform(index: number, context: GeneratorContext): Matrix4 {
  const { settings } = context;
  const pivot = generatorVector(settings, 'pivot');
  const axis = generatorAxis(settings.parameters['axis']);
  const rotation = new Matrix4().makeRotationAxis(axis, radialAngle(index, settings));
  const offset = radialRadiusOffset(context, pivot, axis);
  const result = generatorAroundPivot(rotation, pivot).multiply(
    new Matrix4().makeTranslation(offset.x, offset.y, offset.z),
  );
  if (settings.parameters['rotateCopies'] !== false) return result;
  const center = context.bounds.getCenter(new Vector3());
  const delta = center.clone().applyMatrix4(result).sub(center);
  return new Matrix4().makeTranslation(delta.x, delta.y, delta.z);
}
/**
 * Circular corridors, colonnades and wedge floors, including exact 15-degree
 * steps.
 */
const kind: GeneratorKind = {
  id: 'radial',
  label: 'Radial Array Volume',
  fields: [
    { key: 'mode', label: 'Distribution', type: 'choice', default: 'ring', choices: ['ring', 'arc', 'step'] },
    { key: 'axis', label: 'Axis', type: 'choice', default: 'y', choices: ['x', 'y', 'z'] },
    ...generatorVectorFields('pivot', 'Pivot offset'),
    { key: 'start', label: 'Copy angle offset °', type: 'number', default: 0, min: -3600, max: 3600 },
    {
      key: 'sweep',
      label: 'Sweep °',
      type: 'number',
      default: 90,
      min: -360,
      max: 360,
      visible: (settings) => settings.parameters['mode'] === 'arc',
    },
    {
      key: 'step',
      label: 'Step °',
      type: 'number',
      default: 15,
      min: -360,
      max: 360,
      visible: (settings) => settings.parameters['mode'] === 'step',
    },
    { key: 'radiusOffset', label: 'Radius offset metres', type: 'number', default: 0 },
    { key: 'rotateCopies', label: 'Rotate copies', type: 'boolean', default: true },
  ],
  transform: radialTransform,
};
export default kind;
