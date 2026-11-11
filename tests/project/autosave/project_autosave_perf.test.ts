import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ProjectAutosave } from '@/project/autosave/project_autosave.js';
import { projectAutosaveParse } from '@/project/autosave/project_autosave_files.js';
import { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import { buildAxisAlignedSideBlocks } from '../../io/vmf/vmf_test_solids.js';
import { projectAutosaveProjectCreate } from './project_autosave_test_utils.js';

const PERF_BRUSHES = 3000;

/**
 * Builds a VMF with a grid of separate box brushes.
 *
 * @param count Brush count.
 * @returns VMF text.
 */
function perfVmf(count: number): string {
  const solids = Array.from({ length: count }, (_, index) => {
    const x = (index % 60) * 96;
    const y = Math.floor(index / 60) * 96;
    const sides = buildAxisAlignedSideBlocks({ x, y, z: 0 }, { x: x + 64, y: y + 64, z: 64 }, 'DEV/DEV_A');
    return `\tsolid\n\t{\n\t\t"id" "${index + 10}"\n${sides}\n\t}`;
  });
  return `world\n{\n\t"id" "1"\n\t"classname" "worldspawn"\n${solids.join('\n')}\n}\n`;
}

describe('ProjectAutosave performance', () => {
  it(`autosaves a ${PERF_BRUSHES}-brush scene quickly`, async () => {
    const io = new HandlerSceneIo();
    const result = await io.importVmfFromText(perfVmf(PERF_BRUSHES), 'perf.vmf', null);
    expect(result?.importedBrushCount).toBe(PERF_BRUSHES);
    const world = new THREE.Group();
    world.add(result!.model.root);
    const { root, fileSystem } = projectAutosaveProjectCreate();
    let captures = 0;
    const autosave = new ProjectAutosave({
      fileSystem: () => fileSystem,
      revision: () => 1,
      capture: () => {
        captures += 1;
        const data = io.serializeScene(world);
        return { data, objectCount: data.objects.length };
      },
    });
    autosave.changed();
    await autosave.flush();
    const started = performance.now();
    autosave.changed();
    await autosave.flush();
    const skipMs = performance.now() - started;
    const metrics = autosave.metrics();
    console.info(
      `[autosave perf] ${PERF_BRUSHES} brushes: capture ${metrics.lastCaptureMs.toFixed(1)} ms, ` +
        `total ${metrics.lastWriteMs.toFixed(1)} ms, ${(metrics.lastBytes / 1_048_576).toFixed(2)} MiB, ` +
        `unchanged skip ${skipMs.toFixed(3)} ms`,
    );
    expect(captures).toBe(1);
    expect(metrics.skipped).toBe(1);
    autosave.dispose();
    const tree = 'AiWorldEd/.Local/History/Levels/untitled';
    const marker = JSON.parse((await root.textAt(`${tree}/index.json`)) ?? '{}').marker;
    const document = projectAutosaveParse((await root.textAt(`${tree}/${marker}.json`)) ?? '');
    expect(document?.objectCount).toBeGreaterThan(0);
    expect(metrics.lastError).toBeNull();
    expect(metrics.lastCaptureMs).toBeLessThan(5000);
  }, 180_000);
});
