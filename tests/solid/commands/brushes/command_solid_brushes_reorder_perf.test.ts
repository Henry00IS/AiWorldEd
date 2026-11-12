import { describe, it, expect } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandSolidBrushesReorder } from '@/solid/commands/brushes/command_solid_brushes_reorder.js';
import { CommandStack } from '@/commands/command_stack.js';

/** Perf regression for To Last / To First: large flat maps must stay partial. */
describe('CommandSolidBrushesReorder perf', () => {
  it('To Last on 400 non-touching additives stays partial', () => {
    const brushCount = 400;
    const model = new SolidModel('OrderPerf');
    const brushes = [];
    for (let index = 0; index < brushCount; index++) {
      const brush = model.addBoxBrush(1.5, SolidOperation.Additive, null, false);
      brush.position.set((index % 40) * 4, Math.floor(index / 40) * 4, 0);
      brush.pushTransformToMesh();
      brushes.push(brush);
    }
    model.markDirty();
    model.rebuild(true);
    const mover = brushes[0]!;
    const stack = new CommandStack(8);
    stack.push(new CommandSolidBrushesReorder([mover.mesh!], 'last'));
    const stats = model.getCompilerStatsForTesting();
    expect(
      model
        .getBrushes()
        .map((brush) => brush.id)
        .at(-1),
    ).toBe(mover.id);
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeLessThan(8);
    expect(model['pipeline'].wasLastResultWritePartialForTesting()).toBe(true);
  }, 30_000);

  it('To Last on 300 overlapping stack still avoids full CSG when peers are local', () => {
    const brushCount = 300;
    const model = new SolidModel('OrderOverlapPerf');
    const brushes = [];
    for (let index = 0; index < brushCount; index++) {
      const op =
        index % 5 === 0
          ? SolidOperation.Subtractive
          : index % 11 === 0
            ? SolidOperation.Intersecting
            : SolidOperation.Additive;
      const brush = model.addBoxBrush(8, op, null, false);
      brush.position.set((index % 20) * 6, Math.floor(index / 20) * 6, (index % 3) * 2);
      brush.pushTransformToMesh();
      brushes.push(brush);
    }
    model.markDirty();
    model.rebuild(true);
    const mover = brushes[1]!;
    const stack = new CommandStack(8);
    stack.push(new CommandSolidBrushesReorder([mover.mesh!], 'last'));
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeLessThan(brushCount);
  }, 30_000);

  it('To Last on 1200 flat additives patches result mesh without full rewrite', () => {
    const brushCount = 1200;
    const model = new SolidModel('OrderLarge');
    const brushes = [];
    for (let index = 0; index < brushCount; index++) {
      const brush = model.addBoxBrush(2, SolidOperation.Additive, null, false);
      brush.position.set((index % 40) * 3, Math.floor(index / 40) * 3, 0);
      brush.pushTransformToMesh();
      brushes.push(brush);
    }
    model.markDirty();
    model.rebuild(true);
    const mover = brushes[0]!;
    const stack = new CommandStack(8);
    stack.push(new CommandSolidBrushesReorder([mover.mesh!], 'last'));
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeLessThan(16);
    expect(model['pipeline'].wasLastResultWritePartialForTesting()).toBe(true);
  }, 30_000);

  it('To Last under inverted world still avoids full CSG', () => {
    const brushCount = 600;
    const model = new SolidModel('OrderInverted');
    model.setInvertedWorld(true);
    const brushes = [];
    for (let index = 0; index < brushCount; index++) {
      const brush = model.addBoxBrush(2, SolidOperation.Additive, null, false);
      brush.position.set((index % 30) * 3, Math.floor(index / 30) * 3, 0);
      brush.pushTransformToMesh();
      brushes.push(brush);
    }
    model.markDirty();
    model.rebuild(true);
    const mover = brushes[2]!;
    const stack = new CommandStack(8);
    stack.push(new CommandSolidBrushesReorder([mover.mesh!], 'last'));
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeLessThan(16);
  }, 30_000);
});
