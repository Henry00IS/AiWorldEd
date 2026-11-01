import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_SCENE_OPENER_OFFERED_KEY, ProjectSceneOpener } from '@/project/host/project_scene_opener.js';
import {
  ProjectHostMemoryStorage,
  projectHostAutosaveCreate,
  projectHostAutosavePut,
  projectHostControllerCreate,
  projectHostFakeCreate,
  projectHostFolderCreate,
} from './project_host_test_utils.js';

const FUTURE = 9_000_000_000_000;

/**
 * Builds an opener over an opened mock project.
 *
 * @param answers Confirm answers.
 * @returns Fixture parts.
 */
async function openerCreate(answers: boolean[] = []) {
  const fake = projectHostFakeCreate(answers);
  const { root, picker } = projectHostFolderCreate();
  const { project } = projectHostControllerCreate(fake.library, picker);
  await project.open();
  const autosave = projectHostAutosaveCreate(project);
  const changed = vi.spyOn(autosave, 'changed');
  const storage = new ProjectHostMemoryStorage();
  const opener = new ProjectSceneOpener(fake.host, project, autosave, storage);
  const record = (path: string) => project.snapshot().files.get(path)!;
  return { ...fake, root, project, autosave, changed, storage, opener, record };
}

describe('ProjectSceneOpener', () => {
  afterEach(() => document.body.replaceChildren());

  it('loads a scene and reports its project path while loading', async () => {
    const fixture = await openerCreate();
    let seen: string | null = null;
    fixture.host.sceneLoad.mockImplementation(() => ((seen = fixture.opener.loadingPath()), true));
    await fixture.opener.open(fixture.record('maps/start.json'));
    expect(fixture.host.sceneLoad).toHaveBeenCalledWith(expect.stringContaining('"A"'), 'start.json');
    expect(seen).toBe('maps/start.json');
    expect(fixture.opener.loadingPath()).toBeNull();
    fixture.project.dispose();
  });

  it('imports VMF and OBJ files', async () => {
    const fixture = await openerCreate();
    await fixture.opener.open(fixture.record('maps/de_dust.vmf'));
    await fixture.opener.open(fixture.record('models/crate.obj'));
    expect(fixture.host.vmfImport).toHaveBeenCalledWith('versioninfo {}', 'de_dust.vmf');
    expect(fixture.host.objImport).toHaveBeenCalledWith('v 0 0 0', 'crate.obj');
    fixture.project.dispose();
  });

  it('refuses while blocked and asks before dropping unsaved work', async () => {
    const fixture = await openerCreate([false]);
    fixture.state.blocked = true;
    await fixture.opener.open(fixture.record('maps/start.json'));
    fixture.state.blocked = false;
    fixture.state.unsaved = true;
    await fixture.opener.open(fixture.record('maps/start.json'));
    expect(fixture.host.confirm).toHaveBeenCalledWith('Open Scene', expect.any(String), 'Open', 'Cancel');
    expect(fixture.host.sceneLoad).not.toHaveBeenCalled();
    fixture.project.dispose();
  });

  it('offers a newer autosave when opening its scene', async () => {
    const fixture = await openerCreate([true]);
    projectHostAutosavePut(fixture.root, 'maps/start.json', FUTURE);
    await fixture.opener.open(fixture.record('maps/start.json'));
    expect(fixture.host.confirm).toHaveBeenCalledWith(
      'Recover Autosave',
      expect.any(String),
      'Open autosave',
      'Open file',
    );
    expect(fixture.host.sceneLoad).toHaveBeenCalledWith(
      expect.stringContaining('Recovered'),
      'maps/start.json (autosave)',
    );
    expect(fixture.changed).toHaveBeenCalled();
    fixture.project.dispose();
  });

  it('opens the file when the autosave is declined or older', async () => {
    const fixture = await openerCreate([false]);
    projectHostAutosavePut(fixture.root, 'maps/start.json', FUTURE);
    await fixture.opener.open(fixture.record('maps/start.json'));
    projectHostAutosavePut(fixture.root, 'maps/start.json', 1);
    await fixture.opener.open(fixture.record('maps/start.json'));
    expect(fixture.host.confirm).toHaveBeenCalledTimes(1);
    expect(fixture.host.sceneLoad).toHaveBeenCalledTimes(2);
    expect(fixture.host.sceneLoad).toHaveBeenLastCalledWith(expect.stringContaining('"A"'), 'start.json');
    fixture.project.dispose();
  });

  it('offers the newest autosave once after the project opens', async () => {
    const fixture = await openerCreate([true]);
    projectHostAutosavePut(fixture.root, null, FUTURE);
    const fileSystem = fixture.project.fileSystem()!;
    await fixture.opener.recoveryOffer(fileSystem);
    await fixture.opener.recoveryOffer(fileSystem);
    expect(fixture.host.confirm).toHaveBeenCalledTimes(1);
    expect(fixture.host.sceneLoad).toHaveBeenCalledWith(expect.any(String), 'untitled (autosave)');
    expect(fixture.storage.getItem(PROJECT_SCENE_OPENER_OFFERED_KEY)).toBe(String(FUTURE));
    fixture.project.dispose();
  });

  it('does not offer recovery over unsaved work', async () => {
    const fixture = await openerCreate([true]);
    projectHostAutosavePut(fixture.root, null, FUTURE);
    fixture.state.unsaved = true;
    await fixture.opener.recoveryOffer(fixture.project.fileSystem()!);
    expect(fixture.host.confirm).not.toHaveBeenCalled();
    fixture.project.dispose();
  });

  it('reports files it cannot read', async () => {
    const fixture = await openerCreate();
    const record = fixture.record('maps/start.json');
    fixture.root.delete('maps/start.json');
    await fixture.opener.open(record);
    expect(fixture.host.status).toHaveBeenCalledWith(expect.stringContaining('Could not read maps/start.json'));
    fixture.project.dispose();
  });
});
