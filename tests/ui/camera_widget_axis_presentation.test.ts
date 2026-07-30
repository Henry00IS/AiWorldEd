import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getBuiltInCoordinateSpace } from '../../src/settings/coordinate_space_presets.js';
import type { AxisDirection, CoordinateSpaceDefinition } from '../../src/settings/coordinate_space_types.js';
import { Theme } from '../../src/theme.js';
import {
  resolveCameraWidgetAxisPresentations,
  type CameraWidgetAxisPresentation,
  type CameraWidgetAxisRole,
} from '../../src/ui/camera_widget_axis_presentation.js';

interface ExpectedRolePresentation {
  signedAxis: AxisDirection;
  color: number;
}

interface ExpectedProfilePresentation {
  right: ExpectedRolePresentation;
  up: ExpectedRolePresentation;
  forward: ExpectedRolePresentation;
}

const BUILT_IN_EXPECTATIONS: readonly [string, ExpectedProfilePresentation][] = [
  [
    'godot',
    {
      right: { signedAxis: '+x', color: Theme.widgetXAxisColor },
      up: { signedAxis: '+y', color: Theme.widgetYAxisColor },
      forward: { signedAxis: '-z', color: Theme.widgetZAxisColor },
    },
  ],
  [
    'unity',
    {
      right: { signedAxis: '+x', color: Theme.widgetXAxisColor },
      up: { signedAxis: '+y', color: Theme.widgetYAxisColor },
      forward: { signedAxis: '+z', color: Theme.widgetZAxisColor },
    },
  ],
  [
    'blender',
    {
      right: { signedAxis: '+x', color: Theme.widgetXAxisColor },
      up: { signedAxis: '+z', color: Theme.widgetZAxisColor },
      forward: { signedAxis: '+y', color: Theme.widgetYAxisColor },
    },
  ],
  [
    'unreal',
    {
      right: { signedAxis: '+y', color: Theme.widgetYAxisColor },
      up: { signedAxis: '+z', color: Theme.widgetZAxisColor },
      forward: { signedAxis: '+x', color: Theme.widgetXAxisColor },
    },
  ],
];

describe('resolveCameraWidgetAxisPresentations', () => {
  it.each(BUILT_IN_EXPECTATIONS)(
    'resolves the %s profile roles, signs, and axis-letter colors',
    (presetId, expected) => {
      const presentations = resolveCameraWidgetAxisPresentations(getBuiltInCoordinateSpace(presetId)!);
      expectRolePresentation(presentations, 'right', expected.right);
      expectRolePresentation(presentations, 'up', expected.up);
      expectRolePresentation(presentations, 'forward', expected.forward);
    },
  );

  it('keeps negative custom axes colored by coordinate letter instead of semantic role', () => {
    const customSpace = createNegativeCustomSpace();
    const presentations = resolveCameraWidgetAxisPresentations(customSpace);
    expectRolePresentation(presentations, 'right', { signedAxis: '-y', color: Theme.widgetYAxisColor });
    expectRolePresentation(presentations, 'up', { signedAxis: '+z', color: Theme.widgetZAxisColor });
    expectRolePresentation(presentations, 'forward', { signedAxis: '-x', color: Theme.widgetXAxisColor });
  });

  it('maps semantic profile directions back to the immutable editor basis', () => {
    const presentations = resolveCameraWidgetAxisPresentations(createNegativeCustomSpace());
    expectRoleDirection(presentations, 'right', new THREE.Vector3(1, 0, 0));
    expectRoleDirection(presentations, 'up', new THREE.Vector3(0, 1, 0));
    expectRoleDirection(presentations, 'forward', new THREE.Vector3(0, 0, -1));
  });
});

/**
 * Expects one semantic role to use a signed label and color.
 *
 * @param presentations Resolved profile presentations.
 * @param role Semantic role to inspect.
 * @param expected Expected label and color.
 */
function expectRolePresentation(
  presentations: CameraWidgetAxisPresentation[],
  role: CameraWidgetAxisRole,
  expected: ExpectedRolePresentation,
): void {
  const presentation = findRole(presentations, role);
  expect(presentation.signedAxis).toBe(expected.signedAxis);
  expect(presentation.color).toBe(expected.color);
}

/**
 * Expects one semantic role to point along an editor direction.
 *
 * @param presentations Resolved profile presentations.
 * @param role Semantic role to inspect.
 * @param expected Expected editor-space direction.
 */
function expectRoleDirection(
  presentations: CameraWidgetAxisPresentation[],
  role: CameraWidgetAxisRole,
  expected: THREE.Vector3,
): void {
  expect(findRole(presentations, role).editorDirection.distanceTo(expected)).toBeLessThan(1e-7);
}

/**
 * Finds a semantic role in a presentation array.
 *
 * @param presentations Resolved profile presentations.
 * @param role Semantic role to find.
 * @returns Matching presentation.
 */
function findRole(
  presentations: CameraWidgetAxisPresentation[],
  role: CameraWidgetAxisRole,
): CameraWidgetAxisPresentation {
  const presentation = presentations.find((candidate) => candidate.role === role);
  if (!presentation) throw new Error(`Missing ${role} presentation`);
  return presentation;
}

/**
 * Creates a valid custom basis containing negative X and Y directions.
 *
 * @returns Custom coordinate space.
 */
function createNegativeCustomSpace(): CoordinateSpaceDefinition {
  return {
    presetId: 'custom-negative-widget',
    name: 'Negative Widget Axes',
    handedness: 'left',
    up: '+z',
    right: '-y',
    forward: '-x',
    isCustom: true,
  };
}
