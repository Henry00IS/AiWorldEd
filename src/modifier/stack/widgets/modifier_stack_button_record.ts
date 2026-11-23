import * as THREE from 'three';
import {
  MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KEY,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { solidScriptDocumentNormalize } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentEvent } from '@/solid_script/document/solid_script_document_event.js';
import { solidScriptFieldBoolean } from '@/solid_script/language/solid_script_field.js';
import { solidScriptInputsList } from '@/solid_script/language/solid_script_input.js';
import type { SolidScriptEvent } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';
import type { SolidScriptWidget, SolidScriptWidgetButton } from '@/solid_script/language/solid_script_widget.js';
import { ModifierStackStepRecord } from './modifier_stack_step_record.js';
import { modifierStackEditSteps, modifierStackStep } from './modifier_stack_sliders.js';

/** A Widget Button or Widget Toggle of a step, in world coordinates. */
export interface ModifierStackButton {
  /** Id of the step that made it. */
  stepId: string;
  /** Key that stays the same between evaluations of the step. */
  key: string;
  /** Button, or Toggle, which shows whether it is on. */
  kind: 'Button' | 'Toggle';
  /** Text on the button. */
  label: string;
  /** Name of the Input a click presses or flips. */
  writes: string;
  /** Whether a Toggle shows as on. */
  on: boolean;
  /** CSS colour, or empty text for the theme colour. */
  color: string;
  /** World point the button floats at. */
  at: THREE.Vector3;
}

/** Buttons each step made at its last evaluation, by stack owner and step id. */
const MODIFIER_STACK_BUTTONS = new ModifierStackStepRecord<ModifierStackButton>();

/**
 * Keeps the Widget Buttons and Widget Toggles of a script step as it ran.
 *
 * @param owner Stack owner.
 * @param stepId Step id.
 * @param widgets Widgets of the run, in script coordinates.
 * @param frame Matrix from script coordinates to the world.
 */
export function modifierStackButtonsRecord(
  owner: THREE.Object3D,
  stepId: string,
  widgets: readonly SolidScriptWidget[],
  frame: THREE.Matrix4,
): void {
  const buttons = widgets
    .filter((widget): widget is SolidScriptWidgetButton => widget.kind === 'Button' || widget.kind === 'Toggle')
    .map(({ kind, label, writes, on, color, at, line }, index) => ({
      stepId,
      key: `${stepId}:${line}:${index}`,
      kind,
      label,
      writes,
      on,
      color,
      at: new THREE.Vector3(...at).applyMatrix4(frame),
    }));
  MODIFIER_STACK_BUTTONS.record(owner, stepId, buttons);
}

/**
 * Returns the buttons of the steps of an object that have an edit mode.
 *
 * @param owner Stack owner.
 * @returns Buttons, in stack order.
 */
export function modifierStackButtons(owner: THREE.Object3D): ModifierStackButton[] {
  return modifierStackEditSteps(owner).flatMap((entry) => MODIFIER_STACK_BUTTONS.recorded(owner, entry.id));
}

/** What a click on a button does. */
export interface ModifierStackButtonPressed {
  /** Parameter patch to store. */
  patch: Record<string, unknown>;
  /** Messages the handlers showed. */
  notices: string[];
  /** Mistake a handler stopped at, or null. */
  error: string | null;
}

/**
 * Returns what a click on a button does: a Button Input is pressed and a Switch
 * Input flipped, and the When Button Pressed or When Input Changes lines run,
 * keep what they set and pass on the messages they show.
 *
 * @param owner Stack owner.
 * @param button Button clicked.
 * @returns Patch and messages, or null when the step or the input is gone.
 */
export function modifierStackButtonPress(
  owner: THREE.Object3D,
  button: ModifierStackButton,
): ModifierStackButtonPressed | null {
  const entry = modifierStackStep(owner, button.stepId);
  if (!entry || button.writes === '') return null;
  const script = entry.parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY];
  const values = (entry.parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY] ?? {}) as Record<string, string>;
  const key = solidScriptNameKey(button.writes);
  const input = solidScriptInputsList(solidScriptDocumentNormalize(script).blocks.filter((block) => !block.off)).find(
    (each) => solidScriptNameKey(each.name) === key,
  );
  if (input?.type !== 'Button' && input?.type !== 'Switch') return null;
  const event: SolidScriptEvent = { kind: input.type === 'Button' ? 'button' : 'input', name: input.name };
  const flipped = solidScriptFieldBoolean(values[input.name] ?? input.fallback) === true ? 'No' : 'Yes';
  const { next, handled } = solidScriptDocumentEvent(script, event, values, event.kind === 'button' ? null : flipped);
  const patch = { [MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]: next };
  return { patch, notices: handled.notices, error: handled.error?.message ?? null };
}
