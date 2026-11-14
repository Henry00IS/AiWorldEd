import * as THREE from 'three';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackChoices,
  modifierStackNumber,
  modifierStackWhen,
} from '@/modifier/stack/modifier_stack_fields.js';
import { modifierStackFrame } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { MODIFIER_VOLUME_BEVEL_EDGE_KEY } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { pathCreate, pathDecode, pathEncode, pathFallback, type Path } from '@/path/model/path_model.js';
import { PathSampler } from '@/path/model/path_sampler.js';
import { ModifierStackKindArray, type ModifierStackArrayPlacement } from './modifier_stack_kind_array.js';

/** Path a new Path Array starts with: a gentle bend along the ground. */
export const MODIFIER_STACK_PATH_DEFAULT = pathEncode(
  pathCreate(
    [
      [0, 0, 0],
      [3, 0, 0],
      [5, 0, 2],
      [5, 0, 5],
    ],
    { smooth: true },
  ),
);

/** Guide color of the path, apart from the volume box and mirror guides. */
const MODIFIER_STACK_PATH_GUIDE_COLOR = 0x3fd0ff;

/**
 * Repeats the working set along a 3D path. The path starts at the input: its
 * first point is where the input sits, and each copy moves (and, when
 * following, turns) by how the path moves and turns from its start.
 */
export class ModifierStackKindArrayPath extends ModifierStackKindArray {
  readonly id = 'path';
  readonly label = 'Path Array';
  readonly description =
    'Repeats the input along a 3D path for fences, rails, lamp rows, winding walls and stepping stones.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    {
      key: 'path',
      label: 'Path',
      type: 'path',
      default: MODIFIER_STACK_PATH_DEFAULT,
      hint: 'Points of the path, relative to the input. The guide starts at the centre of the volume.',
    },
    {
      key: 'spacing',
      label: 'Spacing',
      type: 'choice',
      default: 'spread',
      choices: modifierStackChoices([
        ['spread', 'Spread Over Path'],
        ['distance', 'Fixed Distance'],
      ]),
      hint: 'Spread Over Path fits every copy between the path ends. Fixed Distance places one copy every Distance along the path.',
    },
    {
      key: 'distance',
      label: 'Distance',
      type: 'number',
      default: 1,
      min: 0.01,
      max: 10000,
      step: 0.25,
      visible: modifierStackWhen('spacing', 'distance'),
      hint: 'Path length between neighbouring copies.',
    },
    {
      key: 'follow',
      label: 'Follow Path',
      type: 'boolean',
      default: true,
      hint: 'Turns each copy with the path. Off keeps every copy facing like the input.',
    },
  ];

  /**
   * Returns the header summary: count and path length.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    const length = new PathSampler(this.pathOf(parameters)).length;
    return `×${this.countOf(parameters)} · ${length.toFixed(1)} m`;
  }

  /**
   * Draws the path as a guide line with a dot on every control point.
   *
   * @param volume Owning volume.
   * @param parameters Normalized parameters.
   * @returns Guide objects in the volume's local space.
   */
  override helpers(volume: THREE.Object3D, parameters: Record<string, unknown>): THREE.Object3D[] {
    const path = this.pathOf(parameters);
    const start = path.points[0]!;
    const toLocal = volume.matrixWorld.clone().invert().multiply(modifierStackFrame(volume, parameters['space']));
    toLocal.multiply(new THREE.Matrix4().makeTranslation(-start.x, -start.y, -start.z));
    const sampler = new PathSampler(path);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(sampler.samples.map((point) => point.clone().applyMatrix4(toLocal))),
      new THREE.LineBasicMaterial({ color: MODIFIER_STACK_PATH_GUIDE_COLOR, depthTest: false }),
    );
    const dots = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(
        path.points.map((point) => new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(toLocal)),
      ),
      new THREE.PointsMaterial({
        color: MODIFIER_STACK_PATH_GUIDE_COLOR,
        size: 7,
        sizeAttenuation: false,
        depthTest: false,
      }),
    );
    for (const helper of [line, dots]) {
      helper.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
      helper.renderOrder = 10;
      helper.raycast = () => undefined;
    }
    return [line, dots];
  }

  /**
   * Carries the input from the path start to the distance of copy N, turning
   * about the input centre when following.
   *
   * @param index Copy index.
   * @param placement Shared placement data.
   * @returns Placement-space transform.
   */
  protected copyTransform(index: number, placement: ModifierStackArrayPlacement): THREE.Matrix4 {
    const path = this.pathOf(placement.parameters);
    const sampler = new PathSampler(pathFromStart(path));
    const distance = this.distanceOf(index, placement, sampler, path.closed);
    const carry = sampler.carryTo(distance, placement.parameters['follow'] !== false);
    const pivot = placement.bounds.isEmpty() ? new THREE.Vector3() : placement.bounds.getCenter(new THREE.Vector3());
    return new THREE.Matrix4()
      .makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(carry)
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  }

  /**
   * Returns how far along the path copy N sits. Copies past the end of an open
   * path, such as an end cap, continue straight on.
   *
   * @param index Copy index.
   * @param placement Shared placement data.
   * @param sampler Path sampler.
   * @param closed True when the path loops.
   * @returns Distance along the path.
   */
  private distanceOf(
    index: number,
    placement: ModifierStackArrayPlacement,
    sampler: PathSampler,
    closed: boolean,
  ): number {
    if (placement.parameters['spacing'] === 'distance')
      return index * modifierStackNumber(placement.parameters['distance'], 1, 0.01, 10000);
    const slots = closed ? placement.count : Math.max(1, placement.count - 1);
    return (sampler.length * index) / slots;
  }

  /**
   * Decodes the stored path.
   *
   * @param parameters Normalized parameters.
   * @returns Path.
   */
  private pathOf(parameters: Record<string, unknown>): Path {
    return pathDecode(parameters['path']) ?? pathFallback();
  }
}

/**
 * Moves a path so its first point is the origin.
 *
 * @param path Path.
 * @returns Shifted copy.
 */
function pathFromStart(path: Path): Path {
  const start = path.points[0]!;
  return {
    ...path,
    points: path.points.map((point) => ({ x: point.x - start.x, y: point.y - start.y, z: point.z - start.z })),
  };
}
