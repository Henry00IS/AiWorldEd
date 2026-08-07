import * as THREE from 'three';
import {
  inputNumericAreAllNumberSkips,
  inputNumericEvaluateNumberExpression,
  inputNumericHasInvalidNumber,
  inputNumericNumberOrNull,
  inputNumericParseOptionalNumber,
  type InputNumericParseResult,
} from '@/ui/input/input_numeric_parse.js';

/** Result of parsing an inspector numeric text field. */
export type PanelPropertiesNumberParseResult = InputNumericParseResult;

/**
 * Parses a UI text field as a number or arithmetic expression.
 *
 * @param text Input text.
 * @returns Value, skip, or invalid parse result.
 */
export function panelPropertiesParseOptionalNumber(text: string): PanelPropertiesNumberParseResult {
  return inputNumericParseOptionalNumber(text);
}

/**
 * Evaluates a non-empty expression with the shared safe math parser.
 *
 * @param expression Expression text after trim.
 * @returns Value when finite, otherwise invalid.
 */
export function panelPropertiesEvaluateNumberExpression(expression: string): PanelPropertiesNumberParseResult {
  return inputNumericEvaluateNumberExpression(expression);
}

/**
 * Returns true when any parse result is invalid.
 *
 * @param results Axis parse results.
 * @returns True when at least one result is invalid.
 */
export function panelPropertiesHasInvalidNumber(...results: PanelPropertiesNumberParseResult[]): boolean {
  return inputNumericHasInvalidNumber(...results);
}

/**
 * Returns true when every parse result skips the axis.
 *
 * @param results Axis parse results.
 * @returns True when all results are skip.
 */
export function panelPropertiesAreAllNumberSkips(...results: PanelPropertiesNumberParseResult[]): boolean {
  return inputNumericAreAllNumberSkips(...results);
}

/**
 * Returns the numeric value when present, otherwise null.
 *
 * @param result Axis parse result.
 * @returns Finite value or null for skip/invalid.
 */
export function panelPropertiesNumberOrNull(result: PanelPropertiesNumberParseResult): number | null {
  return inputNumericNumberOrNull(result);
}

/** Resolved X/Y/Z numbers for an inspector section (null means keep per-object). */
export interface PanelPropertiesAxisNumbers {
  x: number | null;
  y: number | null;
  z: number | null;
}

/** Outcome of parsing three axis text fields together. */
export type PanelPropertiesAxisNumbersResolve =
  { kind: 'values'; axes: PanelPropertiesAxisNumbers } | { kind: 'invalid' } | { kind: 'skip_all' };

/**
 * Parses three axis fields, combining value/skip/invalid outcomes.
 *
 * @param xText X field text.
 * @param yText Y field text.
 * @param zText Z field text.
 * @returns Values, invalid, or all-skip.
 */
export function panelPropertiesResolveAxisNumbers(
  xText: string,
  yText: string,
  zText: string,
): PanelPropertiesAxisNumbersResolve {
  const x = panelPropertiesParseOptionalNumber(xText);
  const y = panelPropertiesParseOptionalNumber(yText);
  const z = panelPropertiesParseOptionalNumber(zText);
  if (panelPropertiesHasInvalidNumber(x, y, z)) {
    return { kind: 'invalid' };
  }
  if (panelPropertiesAreAllNumberSkips(x, y, z)) {
    return { kind: 'skip_all' };
  }
  return {
    kind: 'values',
    axes: {
      x: panelPropertiesNumberOrNull(x),
      y: panelPropertiesNumberOrNull(y),
      z: panelPropertiesNumberOrNull(z),
    },
  };
}

/**
 * Converts an Euler rotation to degrees for inspector display.
 *
 * @param rotation Euler rotation in radians.
 * @returns Vector of degrees.
 */
export function panelPropertiesEulerDegrees(rotation: THREE.Euler): THREE.Vector3 {
  return new THREE.Vector3(
    THREE.MathUtils.radToDeg(rotation.x),
    THREE.MathUtils.radToDeg(rotation.y),
    THREE.MathUtils.radToDeg(rotation.z),
  );
}

/**
 * Returns true when proposed positions match the given objects.
 *
 * @param objects Objects to compare.
 * @param positions Proposed positions.
 * @returns True when nothing would change.
 */
export function panelPropertiesAreObjectPositionsUnchanged(
  objects: readonly THREE.Object3D[],
  positions: readonly THREE.Vector3[],
): boolean {
  return objects.every((object, index) => {
    return object.position.distanceToSquared(positions[index]!) < 1e-12;
  });
}

/**
 * Returns true when proposed rotations match the given objects.
 *
 * @param objects Objects to compare.
 * @param rotations Proposed Euler rotations.
 * @returns True when nothing would change.
 */
export function panelPropertiesAreObjectRotationsUnchanged(
  objects: readonly THREE.Object3D[],
  rotations: readonly THREE.Euler[],
): boolean {
  return objects.every((object, index) => {
    const current = object.rotation;
    const next = rotations[index]!;
    return (
      Math.abs(current.x - next.x) < 1e-8 && Math.abs(current.y - next.y) < 1e-8 && Math.abs(current.z - next.z) < 1e-8
    );
  });
}

/**
 * Returns true when proposed scales match the given objects.
 *
 * @param objects Objects to compare.
 * @param scales Proposed scales.
 * @returns True when nothing would change.
 */
export function panelPropertiesAreObjectScalesUnchanged(
  objects: readonly THREE.Object3D[],
  scales: readonly THREE.Vector3[],
): boolean {
  return objects.every((object, index) => {
    return object.scale.distanceToSquared(scales[index]!) < 1e-12;
  });
}
