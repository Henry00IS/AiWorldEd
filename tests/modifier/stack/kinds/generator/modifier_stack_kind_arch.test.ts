import { describe, expect, it } from 'vitest';
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
 * @returns Generated brushes.
 */
function arch(parameters: Record<string, unknown>, scale = 4): SolidBrushInstance[] {
  return stackFixture([{ kind: 'arch', parameters }], scale)
    .compile()
    .instances.slice(1);
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
