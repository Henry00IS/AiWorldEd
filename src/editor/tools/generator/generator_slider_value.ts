import * as THREE from 'three';
import { editAxisDragParameter } from '@/edit/tool/edit_axis_drag.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import type { ModifierStackSlider } from '@/modifier/stack/widgets/modifier_stack_sliders.js';

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
  const length = slider.direction.length();
  if (!(length > 0)) return null;
  const rect = pane.pickElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -(((clientY - rect.top) / rect.height) * 2 - 1),
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, pane.camera);
  const unit = slider.direction.clone().divideScalar(length);
  const distance = editAxisDragParameter(slider.origin, unit, ray.ray.origin, ray.ray.direction);
  if (distance === null) return null;
  const value = snap(distance) / length;
  return Math.min(slider.max ?? Infinity, Math.max(slider.min ?? -Infinity, value));
}

/**
 * Returns the world point of a slider's handle.
 *
 * @param slider Slider.
 * @returns Handle point.
 */
export function generatorSliderHandle(slider: ModifierStackSlider): THREE.Vector3 {
  return slider.origin.clone().addScaledVector(slider.direction, slider.value);
}
