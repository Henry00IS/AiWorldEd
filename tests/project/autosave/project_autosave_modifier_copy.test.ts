import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectAutosave } from '@/project/autosave/project_autosave.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { projectAutosaveProjectCreate } from './project_autosave_test_utils.js';
import { stackUvFaceKey, stackUvFixtureMirror } from '../../modifier/stack/modifier_stack_uv_fixture.js';

describe('ProjectAutosave with modifier copies', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('repeated autosaves of a mirror volume scene never change the source brush face UVs', async () => {
    const fixture = stackUvFixtureMirror();
    const serializer = new SceneSerializer();
    const capture = vi.fn(() => {
      const data = serializer.serialize(fixture.world);
      return { data };
    });
    const { fileSystem } = projectAutosaveProjectCreate();
    const autosave = new ProjectAutosave({ fileSystem: () => fileSystem, capture, idle: (run) => run() });
    autosave.sceneSet('maps/start.json');
    const before = stackUvFaceKey(fixture.source);
    for (let round = 0; round < 3; round++) {
      autosave.changed();
      await autosave.flush();
      fixture.model.markDirty();
      fixture.model.rebuild(true);
    }
    expect(capture).toHaveBeenCalledTimes(3);
    expect(stackUvFaceKey(fixture.source)).toBe(before);
    autosave.dispose();
  });
});
