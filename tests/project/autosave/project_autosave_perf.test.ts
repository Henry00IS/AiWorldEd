import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ProjectAutosave } from '@/project/autosave/project_autosave.js';
import { projectAutosaveParse } from '@/project/autosave/project_autosave_files.js';
import { projectHistoryStoreFor } from '@/project/history/core/project_history_store.js';
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
  it(`autosaves a ${PERF_BRUSHES}-brush scene`, async () => {
    const io = new HandlerSceneIo();
    const result = await io.importVmfFromText(perfVmf(PERF_BRUSHES), 'perf.vmf', null);
    expect(result?.importedBrushCount).toBe(PERF_BRUSHES);
    const world = new THREE.Group();
    world.add(result!.model.root);
    const { fileSystem } = projectAutosaveProjectCreate();
    let captures = 0;
    const autosave = new ProjectAutosave({
      fileSystem: () => fileSystem,
      revision: () => 1,
      capture: () => {
        captures += 1;
        const data = io.serializeScene(world);
        return { data };
      },
    });
    autosave.changed();
    await autosave.flush();
    autosave.changed();
    await autosave.flush();
    const metrics = autosave.metrics();
    expect(captures).toBe(1);
    expect(metrics.skipped).toBe(1);
    autosave.dispose();
    const store = projectHistoryStoreFor(fileSystem);
    const [entry] = await store.entries();
    const document = projectAutosaveParse((await (await store.stateRead(entry!))?.text()) ?? '');
    expect(document?.objectCount).toBeGreaterThanOrEqual(PERF_BRUSHES);
    expect(entry?.objectCount).toBe(document?.objectCount);
    expect(metrics.lastError).toBeNull();
  }, 180_000);
});
