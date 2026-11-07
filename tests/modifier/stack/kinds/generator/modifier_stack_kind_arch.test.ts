import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackParameterSet } from '@/modifier/stack/modifier_stack_operations.js';
import { MODIFIER_STACK_USERDATA_KEY } from '@/modifier/volume/modifier_volume_record.js';
import { MODIFIER_STACK_ARCH_MIN_SEGMENTS } from '@/modifier/stack/kinds/generator/modifier_stack_kind_arch.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { nodeVolumeApply } from '@/collaboration/scene/node_collaboration_volume.js';
import { expectStackConvex, stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Builds an arch and returns its pieces.
 *
 * @param parameters Arch parameters.
 * @param scale Volume size.
 * @param height Volume height, the size unless given.
 * @returns Generated brushes.
 */
function arch(parameters: Record<string, unknown>, scale = 4, height = scale): SolidBrushInstance[] {
  const fixture = stackFixture([{ kind: 'arch', parameters }], scale);
  fixture.volume.scale.y = height;
  return fixture.compile().instances.slice(1);
}

/**
 * Checks that every piece is a valid convex brush.
 *
 * @param pieces Pieces.
 */
function expectValid(pieces: readonly SolidBrushInstance[]): void {
  for (const piece of pieces) {
    expectStackConvex(piece);
    expect(SolidBrushValidator.validateGenerated(piece.brush).valid).toBe(true);
  }
}

describe('arch segments', () => {
  it('never goes below two segments in settings, edits and old saves', () => {
    const kind = modifierStackKindFind('arch');
    expect(kind?.normalizeParameters({ segments: 1 })['segments']).toBe(MODIFIER_STACK_ARCH_MIN_SEGMENTS);
    const fixture = stackFixture(['arch'], 4);
    let stack = ModifierVolume.read(fixture.volume);
    const step = stack.modifiers[0]?.id ?? '';
    stack = modifierStackParameterSet(stack, step, 'segments', 1);
    expect(stack.modifiers[0]?.parameters['segments']).toBe(MODIFIER_STACK_ARCH_MIN_SEGMENTS);
    const raw = structuredClone(fixture.volume.userData[MODIFIER_STACK_USERDATA_KEY]) as {
      modifiers: { parameters: Record<string, unknown> }[];
    };
    const first = raw.modifiers[0];
    if (first) first.parameters['segments'] = 1;
    fixture.volume.userData[MODIFIER_STACK_USERDATA_KEY] = raw;
    expect(ModifierVolume.read(fixture.volume).modifiers[0]?.parameters['segments']).toBe(2);
    const remote = stackFixture(['arch'], 4).volume;
    nodeVolumeApply(remote, { modifierStack: raw } as unknown as Parameters<typeof nodeVolumeApply>[1]);
    expect(ModifierVolume.read(remote).modifiers[0]?.parameters['segments']).toBe(2);
  });

  it('builds two valid pieces from a two-segment arch', () => {
    const pieces = arch({ segments: 2 });
    expect(pieces).toHaveLength(2);
    expectValid(pieces);
  });
});

/**
 * Returns the combined bounds of pieces.
 *
 * @param pieces Pieces.
 * @returns Bounds.
 */
function boundsOf(pieces: readonly SolidBrushInstance[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const piece of pieces) for (const vertex of piece.brush.vertices) box.expandByPoint(vertex);
  return box;
}

describe('arch sweep start', () => {
  it('keeps old saves centred and starts a partial sweep on the ground at either side', () => {
    expect(modifierStackKindFind('arch')?.normalizeParameters({})['start']).toBe('centre');
    const full = boundsOf(arch({ segments: 8 }));
    const centre = boundsOf(arch({ segments: 8, sweep: 90 }));
    const left = boundsOf(arch({ segments: 8, sweep: 90, start: 'left' }));
    const right = boundsOf(arch({ segments: 8, sweep: 90, start: 'right' }));
    expect(centre.min.y).toBeGreaterThan(full.min.y + 0.1);
    expect(left.min.y).toBeCloseTo(full.min.y, 5);
    expect(right.min.y).toBeCloseTo(full.min.y, 5);
    expect(left.min.x).toBeCloseTo(full.min.x, 5);
    expect(left.max.x).toBeLessThan(full.max.x - 0.5);
    expect(right.max.x).toBeCloseTo(full.max.x, 5);
    expect(right.min.x).toBeGreaterThan(full.min.x + 0.5);
    expectValid(arch({ segments: 8, sweep: 90, start: 'left' }));
  });

  it('offers the start only for a ring sweeping less than a half circle', () => {
    const field = modifierStackKindFind('arch')?.fields.find((entry) => entry.key === 'start');
    expect(field?.visible?.({ style: 'ring', sweep: 90 })).toBe(true);
    expect(field?.visible?.({ style: 'ring', sweep: 180 })).toBe(false);
    expect(field?.visible?.({ style: 'wall', sweep: 90 })).toBe(false);
  });
});

describe('arch tunnel', () => {
  it('builds the arched opening filling the volume as valid convex subtractive strips', () => {
    const ring = boundsOf(arch({ segments: 12 }));
    const tunnel = arch({ segments: 12, style: 'tunnel' });
    expect(tunnel).toHaveLength(12);
    expectValid(tunnel);
    expect(tunnel.every((piece) => piece.operation === SolidOperation.Subtractive)).toBe(true);
    const box = boundsOf(tunnel);
    expect(box.min.y).toBeCloseTo(ring.min.y, 5);
    expect(box.max.x - box.min.x).toBeCloseTo(ring.max.x - ring.min.x, 5);
    expect(box.max.y).toBeLessThanOrEqual(ring.max.y + 1e-6);
  });

  it('builds valid tunnels stretched to the top or spanning Z', () => {
    for (const parameters of [
      { style: 'tunnel', shape: 'fit', segments: 8 },
      { style: 'tunnel', span: 'z', segments: 6 },
    ]) {
      const pieces = arch(parameters);
      expect(pieces.length).toBeGreaterThan(0);
      expectValid(pieces);
    }
  });

  it('loads arches saved with Output: Opening as tunnels and offers no Output setting', () => {
    const kind = modifierStackKindFind('arch');
    expect(kind?.normalizeParameters({ output: 'opening' })['style']).toBe('tunnel');
    expect(kind?.normalizeParameters({})['style']).toBe('ring');
    expect(kind?.fields.some((field) => field.key === 'output')).toBe(false);
    expect(
      arch({ output: 'opening', segments: 4 }).every((piece) => piece.operation === SolidOperation.Subtractive),
    ).toBe(true);
  });

  it('stretches to the top only when the volume is taller than half its span', () => {
    const tall = boundsOf(arch({ shape: 'fit', segments: 8 }));
    expect(tall.max.y).toBeGreaterThan(boundsOf(arch({ shape: 'round', segments: 8 })).max.y + 0.5);
    const low = boundsOf(arch({ shape: 'fit', segments: 8 }, 4, 1.5));
    const lowRound = boundsOf(arch({ shape: 'round', segments: 8 }, 4, 1.5));
    expect(low.max.y).toBeCloseTo(lowRound.max.y, 5);
    expect(low.min.y).toBeCloseTo(lowRound.min.y, 5);
  });
});
