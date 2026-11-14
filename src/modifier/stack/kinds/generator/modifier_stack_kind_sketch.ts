import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackChoices,
  modifierStackNumber,
  modifierStackWhen,
} from '@/modifier/stack/modifier_stack_fields.js';
import { modifierStackFrame, modifierStackVolumeBox } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { MODIFIER_VOLUME_BEVEL_EDGE_KEY } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { sketchDecode, sketchEncode, sketchShapeCreate, type Sketch } from '@/sketch/model/sketch_model.js';
import { sketchOutlines } from '@/sketch/model/sketch_regions.js';
import { sketchClipMinU, sketchConvexPieces } from '@/sketch/model/sketch_convex.js';
import { MODIFIER_STACK_GENERATOR_SMOOTH_FIELD } from './modifier_stack_generator_smooth.js';
import { ModifierStackKindGenerator } from './modifier_stack_kind_generator.js';
import { MODIFIER_STACK_SHAPE_EPSILON, modifierStackConvexFromLoops } from './modifier_stack_generator_shapes.js';

/** Sketch a new Sketch generator starts with: an L-shaped outline. */
export const MODIFIER_STACK_SKETCH_DEFAULT = sketchEncode({ shapes: [sketchShapeCreate('polygon')] });

/** Largest side count of a revolve. */
export const MODIFIER_STACK_SKETCH_MAX_SIDES = 64;

/** Guide color of the sketch outline. */
const MODIFIER_STACK_SKETCH_GUIDE_COLOR = 0x9cff57;

/**
 * Builds brushes from a 2D sketch. Extrude draws the sketch on the bottom of
 * the box (U along X, V along −Z, from the box centre) and pulls it up through
 * the box height. Revolve reads U as the distance from the box's vertical axis
 * and V as the height above its bottom, and turns the sketch around that axis.
 * Concave outlines are split into convex brushes, so the result stays a valid
 * CSG solid; editing the sketch rebuilds it.
 */
export class ModifierStackKindSketch extends ModifierStackKindGenerator {
  readonly id = 'sketch';
  readonly label = 'Sketch';
  readonly description =
    'Draws rectangles, circles, arcs, outlines and lines on a plane, then extrudes or revolves them into brushes.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    {
      key: 'sketch',
      label: 'Sketch',
      type: 'sketch',
      default: MODIFIER_STACK_SKETCH_DEFAULT,
      hint: 'Shapes in meters on the sketch plane. Overlapping shapes join.',
    },
    {
      key: 'build',
      label: 'Build',
      type: 'choice',
      default: 'extrude',
      choices: modifierStackChoices([
        ['extrude', 'Extrude'],
        ['revolve', 'Revolve'],
      ]),
      hint: 'Extrude pulls the sketch up through the box height. Revolve turns it around the vertical axis: U is the radius, V the height.',
    },
    {
      key: 'angle',
      label: 'Angle',
      type: 'number',
      default: 360,
      min: 1,
      max: 360,
      step: 15,
      visible: modifierStackWhen('build', 'revolve'),
      hint: 'How far the sketch turns, in degrees.',
    },
    {
      key: 'sides',
      label: 'Sides',
      type: 'number',
      default: 24,
      min: 3,
      max: MODIFIER_STACK_SKETCH_MAX_SIDES,
      integer: true,
      step: 1,
      visible: modifierStackWhen('build', 'revolve'),
      hint: 'Segments over the turn.',
    },
  ];
  protected override readonly shadingFields = [MODIFIER_STACK_GENERATOR_SMOOTH_FIELD];

  /**
   * Returns the header summary: shape count and build.
   *
   * @param parameters Normalized parameters.
   * @returns Summary.
   */
  override summary(parameters: Record<string, unknown>): string {
    const count = this.sketchOf(parameters).shapes.length;
    return `${count} ${count === 1 ? 'Shape' : 'Shapes'} · ${parameters['build'] === 'revolve' ? 'Revolve' : 'Extrude'}`;
  }

  /**
   * Draws the sketch outlines on the sketch plane.
   *
   * @param volume Generator node.
   * @param parameters Normalized parameters.
   * @returns Outline guide in the node's local space.
   */
  override helpers(volume: THREE.Object3D, parameters: Record<string, unknown>): THREE.Object3D[] {
    const box = modifierStackVolumeBox(volume);
    const toLocal = volume.matrixWorld.clone().invert().multiply(modifierStackFrame(volume, 'volume'));
    const revolve = parameters['build'] === 'revolve';
    const center = box.getCenter(new THREE.Vector3());
    const local: THREE.Vector3[] = [];
    for (const outline of sketchOutlines(this.sketchOf(parameters))) {
      outline.forEach((point, index) => {
        const next = outline[(index + 1) % outline.length]!;
        for (const end of [point, next]) local.push(this.planePoint(end, box, center, revolve).applyMatrix4(toLocal));
      });
    }
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(local),
      new THREE.LineBasicMaterial({ color: MODIFIER_STACK_SKETCH_GUIDE_COLOR, depthTest: false }),
    );
    lines.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
    lines.renderOrder = 10;
    lines.raycast = () => undefined;
    return [lines];
  }

  /**
   * Builds the convex brushes of the sketch.
   *
   * @param parameters Normalized parameters.
   * @param box Box in frame coordinates.
   * @returns Pieces in frame coordinates.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const pieces = sketchOutlines(this.sketchOf(parameters)).flatMap(sketchConvexPieces);
    if (parameters['build'] === 'revolve') return this.revolvePieces(pieces, parameters, box);
    const center = box.getCenter(new THREE.Vector3());
    const brushes: SolidBrush[] = [];
    for (const piece of pieces) {
      const bottom = piece.map((point) => this.planePoint(point, box, center, false));
      const top = bottom.map((point) => new THREE.Vector3(point.x, box.max.y, point.z));
      const brush = modifierStackConvexFromLoops([bottom, top, ...sketchSideLoops(bottom, top)]);
      if (brush) brushes.push(brush);
    }
    return brushes;
  }

  /**
   * Turns every convex piece around the vertical axis, one convex wedge per
   * side. Parts left of the axis are cut off.
   *
   * @param pieces Convex pieces (radius, height).
   * @param parameters Normalized parameters.
   * @param box Box in frame coordinates.
   * @returns Wedges.
   */
  private revolvePieces(pieces: THREE.Vector2[][], parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const angle = THREE.MathUtils.degToRad(modifierStackNumber(parameters['angle'], 360, 1, 360));
    const sides = Math.round(modifierStackNumber(parameters['sides'], 24, 3, MODIFIER_STACK_SKETCH_MAX_SIDES));
    const center = box.getCenter(new THREE.Vector3());
    const brushes: SolidBrush[] = [];
    for (const raw of pieces) {
      const piece = sketchClipMinU(raw, 0);
      if (piece.length === 0) continue;
      for (let side = 0; side < sides; side++) {
        const at = (point: THREE.Vector2, turn: number): THREE.Vector3 =>
          new THREE.Vector3(
            center.x + Math.cos(turn) * point.x,
            box.min.y + point.y,
            center.z - Math.sin(turn) * point.x,
          );
        const a = (angle * side) / sides;
        const b = (angle * (side + 1)) / sides;
        const front = piece.map((point) => at(point, a));
        const back = piece.map((point) => at(point, b));
        const loops = [front, back, ...sketchSideLoops(front, back)]
          .map(sketchDistinct)
          .filter((loop) => loop.length >= 3);
        const brush = modifierStackConvexFromLoops(loops);
        if (brush) brushes.push(brush);
      }
    }
    return brushes;
  }

  /**
   * Places a sketch point in the frame.
   *
   * @param point Sketch point.
   * @param box Box in frame coordinates.
   * @param center Box centre.
   * @param revolve True for the revolve plane (radius, height) facing −Z.
   * @returns Frame point.
   */
  private planePoint(point: THREE.Vector2, box: THREE.Box3, center: THREE.Vector3, revolve: boolean): THREE.Vector3 {
    if (revolve) return new THREE.Vector3(center.x + point.x, box.min.y + point.y, center.z);
    return new THREE.Vector3(center.x + point.x, box.min.y, center.z - point.y);
  }

  /**
   * Decodes the stored sketch.
   *
   * @param parameters Normalized parameters.
   * @returns Sketch.
   */
  private sketchOf(parameters: Record<string, unknown>): Sketch {
    return sketchDecode(parameters['sketch']) ?? { shapes: [] };
  }
}

/**
 * Builds the side faces joining two matching rings.
 *
 * @param lower First ring.
 * @param upper Second ring.
 * @returns One loop per ring edge.
 */
function sketchSideLoops(lower: readonly THREE.Vector3[], upper: readonly THREE.Vector3[]): THREE.Vector3[][] {
  return lower.map((point, index) => {
    const next = (index + 1) % lower.length;
    return [point, lower[next]!, upper[next]!, upper[index]!];
  });
}

/**
 * Drops points that repeat their neighbour, such as two corners on the axis.
 *
 * @param loop Loop.
 * @returns Loop of distinct points.
 */
function sketchDistinct(loop: THREE.Vector3[]): THREE.Vector3[] {
  return loop.filter(
    (point, index) => point.distanceTo(loop[(index + 1) % loop.length]!) > MODIFIER_STACK_SHAPE_EPSILON,
  );
}
