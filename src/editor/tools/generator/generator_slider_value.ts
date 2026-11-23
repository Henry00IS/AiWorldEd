import * as THREE from 'three';
import { editAxisDragParameter } from '@/edit/tool/edit_axis_drag.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import { generatorPointerRay } from './generator_path_geometry.js';
import type { ModifierStackSlider } from '@/modifier/stack/widgets/modifier_stack_slider_record.js';

/**
 * Returns the value a slider takes under a client point: the point on its line
 * nearest the pointer ray, its distance snapped by the grid, then kept between
 * Minimum and Maximum.
 *
 * @param slider Slider.
 * @param pane Pane the pointer is over.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @param snap Snaps a distance in metres to the grid.
 * @returns Value, or null when the pane looks straight down the slider.
 */
export function generatorSliderValueAt(
  slider: ModifierStackSlider,
  pane: EditorViewportPickContext,
  clientX: number,
  clientY: number,
  snap: (distance: number) => number,
): number | null {
  if (slider.axis) return generatorSliderTurnAt(slider, slider.axis, generatorPointerRay(pane, clientX, clientY));
  const length = slider.direction.length();
  if (!(length > 0)) return null;
  const ray = generatorPointerRay(pane, clientX, clientY);
  const unit = slider.direction.clone().divideScalar(length);
  const distance = editAxisDragParameter(slider.origin, unit, ray.origin, ray.direction);
  if (distance === null) return null;
  return generatorSliderClamp(slider, snap(distance) / length);
}

/**
 * Returns the angle a dial takes under a pointer ray: the angle in whole
 * degrees from its arm to where the ray meets the dial's plane, the turn
 * nearest the value it shows, kept between Minimum and Maximum.
 *
 * @param slider Dial.
 * @param axis Unit axis of the dial.
 * @param ray Pointer ray.
 * @returns Degrees, or null when the ray misses the dial's plane.
 */
function generatorSliderTurnAt(slider: ModifierStackSlider, axis: THREE.Vector3, ray: THREE.Ray): number | null {
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, slider.origin);
  const hit = ray.intersectPlane(plane, new THREE.Vector3());
  if (!hit) return null;
  const arm = hit.sub(slider.origin);
  const side = new THREE.Vector3().crossVectors(axis, slider.direction);
  const angle = THREE.MathUtils.radToDeg(Math.atan2(arm.dot(side), arm.dot(slider.direction)));
  const turns = Math.round((slider.value - angle) / 360);
  return generatorSliderClamp(slider, Math.round(angle + turns * 360));
}

/**
 * Keeps a value between a slider's Minimum and Maximum.
 *
 * @param slider Slider.
 * @param value Value.
 * @returns Value inside the limits.
 */
export function generatorSliderClamp(slider: ModifierStackSlider, value: number): number {
  return Math.min(slider.max ?? Infinity, Math.max(slider.min ?? -Infinity, value));
}

/**
 * Formats a slider value the way its caption and typing field show it.
 *
 * @param value Value.
 * @returns Text with at most four decimals.
 */
export function generatorSliderValueText(value: number): string {
  return String(Number(value.toFixed(4)));
}

/**
 * Returns the world point of a slider's handle: along its line, or round a dial
 * by its value in degrees.
 *
 * @param slider Slider.
 * @returns Handle point.
 */
export function generatorSliderHandle(slider: ModifierStackSlider): THREE.Vector3 {
  if (!slider.axis) return slider.origin.clone().addScaledVector(slider.direction, slider.value);
  const angle = THREE.MathUtils.degToRad(slider.value);
  return slider.direction.clone().applyAxisAngle(slider.axis, angle).add(slider.origin);
}

/**
 * Returns the world direction a slider's handle moves in at its value: along
 * its line, or round a dial.
 *
 * @param slider Slider.
 * @returns Direction.
 */
export function generatorSliderTangent(slider: ModifierStackSlider): THREE.Vector3 {
  if (!slider.axis) return slider.direction.clone();
  return new THREE.Vector3().crossVectors(slider.axis, generatorSliderHandle(slider).sub(slider.origin));
}
