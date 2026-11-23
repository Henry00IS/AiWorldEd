import * as THREE from 'three';
import type { SolidScriptCommandWord } from './solid_script_command.js';
import {
  solidScriptValueNumber,
  solidScriptValueNumbers,
  solidScriptValueText,
} from '@/solid_script/language/solid_script_value.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type {
  SolidScriptUvPackMethod,
  SolidScriptUvPackSettings,
} from '@/solid_script/language/solid_script_uv_islands.js';

/** How Pack Islands may fit islands, each with its meaning. */
export const SOLID_SCRIPT_UVS_PACK_METHODS: readonly SolidScriptCommandWord[] = [
  { word: 'Bounding Box', detail: 'Pack the bounding boxes of the islands in rows' },
  { word: 'Convex Hull', detail: 'Nest the convex hulls of the islands' },
  { word: 'Exact Shape', detail: 'Nest the faces of the islands, notches too' },
];

/**
 * Reads Margin, 0.001 when left off.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Gap between islands as a share of the square.
 */
export function solidScriptUvsMargin(run: SolidScriptBlockRun, label: string): number {
  if (run.source('margin').trim() === '') return 0.001;
  const margin = solidScriptValueNumber(run.value('margin'));
  if (margin === undefined || !(margin >= 0 && margin <= 1))
    throw new Error(`${label} needs a Margin from 0 to 1, such as 0.001`);
  return margin;
}

/**
 * Reads how Pack Islands packs: Margin, Rotate, Method, and the area between
 * Bottom Left and Top Right, the 0 to 1 square when they do not span one.
 *
 * @param run Running line.
 * @returns Settings.
 */
export function solidScriptUvsPackSettings(run: SolidScriptBlockRun): SolidScriptUvPackSettings {
  const rotate = run.value('rotate');
  if (typeof rotate !== 'boolean') throw new Error('Pack Islands needs Yes or No in Rotate');
  const from = solidScriptUvsVector(run, 'from', [0, 0, 0], 'Pack Islands Bottom Left');
  const to = solidScriptUvsVector(run, 'to', [1, 1, 0], 'Pack Islands Top Right');
  const spans = to.x > from.x && to.y > from.y;
  return {
    margin: solidScriptUvsMargin(run, 'Pack Islands'),
    rotate,
    method: solidScriptUvsPackMethod(run),
    from: spans ? [from.x, from.y] : [0, 0],
    to: spans ? [to.x, to.y] : [1, 1],
  };
}

/**
 * Reads Pack Islands' Method, Bounding Box when empty.
 *
 * @param run Running line.
 * @returns Method.
 */
export function solidScriptUvsPackMethod(run: SolidScriptBlockRun): SolidScriptUvPackMethod {
  const text = run.text('method').trim() || 'Bounding Box';
  const method = SOLID_SCRIPT_UVS_PACK_METHODS.find((entry) => entry.word.toLowerCase() === text.toLowerCase());
  if (!method)
    throw new Error(`Pack Islands needs Bounding Box, Convex Hull or Exact Shape in Method, not ${run.text('method')}`);
  return method.word as SolidScriptUvPackMethod;
}

/**
 * Reads Unwrap's Pack.
 *
 * @param run Running line.
 * @returns True to pack the islands into 0 to 1.
 */
export function solidScriptUvsPacks(run: SolidScriptBlockRun): boolean {
  const pack = run.value('pack');
  if (typeof pack !== 'boolean') throw new Error('Unwrap needs Yes or No in Pack');
  return pack;
}

/**
 * Reads a vector field as numbers, or the fallback when the field is empty.
 *
 * @param run Running line.
 * @param key Field key.
 * @param fallback Used when the field is empty.
 * @param label Field caption, for messages.
 * @returns Three numbers.
 */
export function solidScriptUvsVector(
  run: SolidScriptBlockRun,
  key: string,
  fallback: [number, number, number],
  label: string,
): THREE.Vector3 {
  const text = solidScriptValueText(run.value(key)).trim();
  if (text === '') return new THREE.Vector3(...fallback);
  const numbers = solidScriptValueNumbers(run.value(key));
  const x = numbers?.[0];
  const y = numbers?.[1];
  const z = numbers?.[2];
  if (x === undefined || y === undefined || z === undefined || numbers?.length !== 3)
    throw new Error(`${label} needs three numbers, such as 0, 1, 0`);
  return new THREE.Vector3(x, y, z);
}
