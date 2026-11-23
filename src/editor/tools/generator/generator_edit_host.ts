import type { Object3D, Quaternion, Vector3 } from 'three';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import type { PathAsset } from '@/path/model/path_asset.js';
import type { ModifierStackPath } from '@/modifier/stack/widgets/modifier_stack_path_record.js';
import type { ModifierStackSlider } from '@/modifier/stack/widgets/modifier_stack_slider_record.js';
import type { ModifierStackDraw } from '@/modifier/stack/widgets/modifier_stack_draw_record.js';
import type { ModifierStackButton } from '@/modifier/stack/widgets/modifier_stack_button_record.js';
import type { ModifierStackAim } from '@/modifier/stack/widgets/modifier_stack_aim_record.js';

/**
 * What the Edit button and the Generator tool need from the scene: the selected
 * object with an edit mode, the panes it shows in, picking, its sliders and
 * paths, the grid and the overlays.
 */
export interface GeneratorEditHost {
  /**
   * Returns the selected object when it is the only selected, unlocked object
   * and has an edit mode: a step whose script has Has Edit Mode on.
   *
   * @returns Object, or null.
   */
  selectedEditable(): Object3D | null;

  /**
   * Returns the camera and pick surface of every interactive pane.
   *
   * @returns Pane contexts.
   */
  panes(): EditorViewportPickContext[];

  /**
   * Selects the nearest object with an edit mode under a client point; anything
   * else under the point is ignored, so a click never selects an ordinary
   * object.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   */
  pickEditable(clientX: number, clientY: number): void;

  /**
   * Hides or restores the transform gizmos and bounds rulers, and shows the
   * Generator highlight on the tool rail, while an object is edited.
   *
   * @param editing True while the Generator tool is active.
   */
  setEditing(editing: boolean): void;

  /**
   * Returns the sliders of the selected object as its last evaluation placed
   * them.
   *
   * @returns Sliders; empty without a selected object with an edit mode.
   */
  sliders(): ModifierStackSlider[];

  /**
   * Returns the Path inputs of the selected object as its last evaluation
   * stored them.
   *
   * @returns Paths; empty without a selected object with an edit mode.
   */
  paths(): ModifierStackPath[];
  /**
   * Returns the Debug Draw drawings of the one selected object, with or without
   * an edit mode.
   *
   * @returns Drawings in world coordinates; empty without such a selection.
   */
  draws(): ModifierStackDraw[];
  /**
   * Returns the Widget Buttons and Widget Toggles of the selected object.
   *
   * @returns Buttons in world coordinates.
   */
  buttons(): ModifierStackButton[];
  /**
   * Presses a button: its Button Input is pressed or its Switch Input flipped,
   * the handlers run, and the change is one undo step.
   *
   * @param button Button clicked.
   */
  press(button: ModifierStackButton): void;
  /**
   * Returns the Widget Direction arrows of the selected object.
   *
   * @returns Arrows in world coordinates.
   */
  aims(): ModifierStackAim[];
  /**
   * Points an arrow along a world direction and rebuilds at once, as one live
   * step of a drag that is not yet in the undo history.
   *
   * @param aim Arrow dragged.
   * @param direction World direction.
   */
  aim(aim: ModifierStackAim, direction: Vector3): void;

  /**
   * Snaps a distance to the grid when grid snapping is on, or the other way
   * round while Shift is held.
   *
   * @param distance Distance in metres.
   * @param invert True while Shift is held.
   * @returns Snapped distance.
   */
  snapDistance(distance: number, invert: boolean): number;

  /**
   * Snaps an angle by the rotation step when grid snapping is on, or the other
   * way round while Shift is held.
   *
   * @param degrees Angle in degrees.
   * @param invert True while Shift is held.
   * @returns Snapped angle in degrees.
   */
  snapAngle(degrees: number, invert: boolean): number;

  /**
   * Returns the rotation of the X, Y and Z axis locks, as the transform gizmo
   * orients its axes: the workspace grid in Global space, the edited object in
   * Local space.
   *
   * @returns World rotation.
   */
  axisOrientation(): Quaternion;

  /**
   * Writes a value into the input of a slider and rebuilds at once, as one live
   * step of a drag that is not yet in the undo history.
   *
   * @param slider Slider being dragged.
   * @param value Value to write.
   */
  slide(slider: ModifierStackSlider, value: number): void;

  /**
   * Stores a changed path in its input and rebuilds at once, as one live step
   * of a change that is not yet in the undo history.
   *
   * @param path Path input.
   * @param asset Changed path.
   */
  pathWrite(path: ModifierStackPath, asset: PathAsset): void;

  /**
   * Ends a change such as a drag: everything it wrote becomes one undo step,
   * shared with others.
   */
  changeEnd(): void;

  /** Takes back everything the change wrote. */
  changeCancel(): void;
}
