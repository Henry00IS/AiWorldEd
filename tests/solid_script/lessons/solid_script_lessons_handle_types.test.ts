import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptPathHandleTypes } from '@/solid_script/language/solid_script_path_handle_types.js';
import { solidScriptPathHandles } from '@/solid_script/language/solid_script_path_handles.js';
import { solidScriptPathStraight } from '@/solid_script/language/solid_script_path_model.js';

/** A bent path of three points, in [P]. */
const BENT: SolidScriptLine = {
  command: 'path',
  values: { shape: 'From Points', points: '[0, 0, 0], [2, 0, 0], [4, 2, 0]', into: 'P' },
};

/** Handles on the middle point that do not line up. */
const CROOKED: SolidScriptLine = {
  command: 'set_handles',
  values: {
    path: '[P]',
    left: '[=[$Index] == 1 ? Vector(1, 1, 0) : [$Point.Position]]',
    right: '[=[$Index] == 1 ? Vector(3, 1, 0) : [$Point.Position]]',
    into: 'P',
  },
};

/**
 * Runs lines after the bent path and prints what Echo reads.
 *
 * @param lines Lines after the path.
 * @param echo What to print.
 * @returns Printed text, or the error.
 */
function ran(lines: SolidScriptLine[], echo: string): string {
  const result = solidScriptProgramRun(
    solidScriptDocumentCreate([BENT, ...lines, { command: 'echo', values: { value: echo } }, { command: 'cube' }]),
  );
  return result.error?.message ?? result.messages[0] ?? '';
}

/**
 * Makes a Set Handle Type line on [P].
 *
 * @param values Fields besides Path and Into.
 * @returns Line.
 */
function typed(values: Record<string, string>): SolidScriptLine {
  return { command: 'set_handle_type', values: { path: '[P]', into: 'P', ...values } };
}

describe('Set Handle Type', () => {
  it('puts Vector handles a third of the way to each neighbour', () => {
    expect(ran([typed({ type: 'Vector' })], '[P.HandlesLeft(1)] [P.HandlesRight(1)]')).toBe(
      '[1.333333333, 0, 0] [2.666666667, 0.666666667, 0]',
    );
  });

  it('lines Auto handles up along the turn, sized to the stretch on each side', () => {
    const path = solidScriptPathStraight(
      [
        [0, 0, 0],
        [2, 0, 0],
        [4, 2, 0],
      ],
      false,
    );
    const handles = solidScriptPathHandleTypes(path, solidScriptPathHandles(path), 'Auto', 'Both', [true, true, true]);
    const point = new THREE.Vector3(2, 0, 0);
    const left = new THREE.Vector3(...(handles.left[1] ?? [])).sub(point);
    const right = new THREE.Vector3(...(handles.right[1] ?? [])).sub(point);
    const along = new THREE.Vector3(1, 0, 0).add(new THREE.Vector3(1, 1, 0).normalize()).normalize();
    expect(right.clone().normalize().dot(along)).toBeCloseTo(1, 9);
    expect(left.clone().normalize().dot(along)).toBeCloseTo(-1, 9);
    expect(left.length() / right.length()).toBeCloseTo(2 / Math.hypot(2, 2), 9);
  });

  it('aligns both handles through the point, keeping their lengths', () => {
    expect(
      ran([CROOKED, typed({ type: 'Align', pick: '[=[$Index] == 1]' })], '[P.HandlesLeft(1)] [P.HandlesRight(1)]'),
    ).toBe('[0.585786438, 0, 0] [3.414213562, 0, 0]');
  });

  it('turns only the Left handle away from the right one with Side Left', () => {
    expect(
      ran(
        [CROOKED, typed({ type: 'Align', side: 'Left', pick: '[=[$Index] == 1]' })],
        '[P.HandlesLeft(1)] [P.HandlesRight(1)]',
      ),
    ).toBe('[1, -1, 0] [3, 1, 0]');
  });

  it('keeps points that fail Pick Where, and every handle with Free', () => {
    expect(ran([CROOKED, typed({ type: 'Vector', pick: '[=[$Index] == 0]' })], '[P.HandlesLeft(1)]')).toBe('[1, 1, 0]');
    expect(ran([CROOKED, typed({ type: 'Free' })], '[P.HandlesRight(1)]')).toBe('[3, 1, 0]');
  });

  it('stops on an unknown Type', () => {
    expect(ran([typed({ type: 'Spiky' })], '[P]')).toContain('Auto, Vector, Align or Free');
  });
});
