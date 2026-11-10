import { describe, expect, it, vi } from 'vitest';
import { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { GITHUB_RELEASES_PAGE_URL } from '@/updater/github_release_client.js';
import { StandaloneUpdateService } from '@/updater/standalone_update_service.js';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { SettingsUpdaterTab } from '@/ui/settings/settings_updater_tab.js';
import type { StandaloneUpdateProgressListener, StandaloneUpdaterBridge } from '@/updater/bridge_standalone_updater.js';
import type { StandaloneHostUpdateCheck } from '@/updater/update_types.js';

describe('SettingsUpdaterTab', () => {
  it('explains browser limitations, shows the embedded app version, and links to releases', () => {
    const store = new EditorSettingsStore(new MemorySettingsStorage());
    const tab = new SettingsUpdaterTab(store, new StandaloneUpdateService({ bridge: null, currentVersion: '1.24.0' }));
    const link = tab.getElement().querySelector('a');

    expect(tab.getElement().textContent).toContain('Version: 1.24.0');
    expect(tab.getElement().textContent).toContain('standalone executable builds');
    expect(link?.href).toBe(GITHUB_RELEASES_PAGE_URL);
  });

  it('shows the automatic update toggle Off and persists its On state', () => {
    const storage = new MemorySettingsStorage();
    const store = new EditorSettingsStore(storage);
    const tab = new SettingsUpdaterTab(
      store,
      new StandaloneUpdateService({ bridge: { installUpdate: () => undefined } }),
    );
    const toggle = tab.getElement().querySelector<HTMLInputElement>('[data-settings-field="auto-updater"]');

    expect(toggle?.checked).toBe(false);
    expect(toggle?.getAttribute('role')).toBe('switch');
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    expect(tab.getElement().textContent).toContain('Auto Updater');
    expect(tab.getElement().textContent).toContain('Off');

    toggle!.checked = true;
    toggle!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(store.getUpdateSettings().automaticChecks).toBe(true);
    expect(new EditorSettingsStore(storage).getUpdateSettings().automaticChecks).toBe(true);
    expect(toggle?.checked).toBe(true);
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    expect(tab.getElement().textContent).toContain('On');
  });

  it('skips automatic checks when Off and resumes them when switched On', async () => {
    const store = new EditorSettingsStore(new MemorySettingsStorage());
    store.setAutomaticUpdateChecksEnabled(false);
    const checkForUpdate = vi.fn(async () => ({
      currentVersion: '1.0.0',
      latestVersion: '1.0.0',
      updateAvailable: false,
    }));
    const tab = new SettingsUpdaterTab(
      store,
      new StandaloneUpdateService({
        bridge: { kind: 'electrobun', checkForUpdate, installUpdate: () => undefined },
      }),
    );

    tab.activate();
    await Promise.resolve();
    expect(checkForUpdate).not.toHaveBeenCalled();

    store.setAutomaticUpdateChecksEnabled(true);
    tab.rebuild();
    tab.activate();
    await Promise.resolve();
    expect(checkForUpdate).toHaveBeenCalledOnce();
  });

  it('offers Retry after a failed check and checks again when pressed', async () => {
    const store = new EditorSettingsStore(new MemorySettingsStorage());
    const checkForUpdate = vi
      .fn<() => Promise<StandaloneHostUpdateCheck>>()
      .mockResolvedValueOnce({ ...UP_TO_DATE, error: "GitHub didn't respond in time." })
      .mockResolvedValueOnce(UP_TO_DATE);
    const tab = createElectrobunTab(store, { checkForUpdate });

    await pressButton(tab, 'Check for Updates');
    expect(tab.getElement().textContent).toContain("GitHub didn't respond in time.");

    await pressButton(tab, 'Retry');
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
    expect(tab.getElement().textContent).toContain('You are using the latest compatible release.');
  });

  it('shows download progress while installing and offers Retry when the install fails', async () => {
    const store = new EditorSettingsStore(new MemorySettingsStorage());
    const progressListeners = new Set<StandaloneUpdateProgressListener>();
    let installFail: (error: Error) => void = () => undefined;
    const installUpdate = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          installFail = reject;
        }),
    );
    const tab = createElectrobunTab(store, {
      checkForUpdate: async () => ({ ...UP_TO_DATE, latestVersion: '1.1.0', updateAvailable: true }),
      installUpdate,
      onInstallProgress: (listener) => {
        progressListeners.add(listener);
        return () => progressListeners.delete(listener);
      },
    });

    await pressButton(tab, 'Check for Updates');
    await pressButton(tab, 'Install Update and Restart');
    for (const listener of progressListeners)
      listener({ phase: 'downloading', message: 'Downloading update… 30%', percent: 30 });
    const progressBar = tab.getElement().querySelector('[role="progressbar"]');
    expect(tab.getElement().textContent).toContain('Downloading update… 30%');
    expect(progressBar?.getAttribute('aria-valuenow')).toBe('30');

    installFail(new Error("The update couldn't be downloaded."));
    await flushPromises();
    expect(tab.getElement().textContent).toContain("The update couldn't be downloaded.");
    expect(tab.getElement().querySelector('[role="progressbar"]')).toBeNull();
    expect(progressListeners.size).toBe(0);
    expect(tab.getElement().querySelector('a')?.href).toBe(GITHUB_RELEASES_PAGE_URL);

    await pressButton(tab, 'Retry');
    expect(installUpdate).toHaveBeenCalledTimes(2);
  });
});

const UP_TO_DATE: StandaloneHostUpdateCheck = {
  currentVersion: '1.0.0',
  latestVersion: '1.0.0',
  updateAvailable: false,
};

/**
 * Creates an Update tab backed by a fake Electrobun bridge.
 *
 * @param store Settings store.
 * @param bridge Bridge methods to use.
 * @returns Update tab.
 */
function createElectrobunTab(store: EditorSettingsStore, bridge: Partial<StandaloneUpdaterBridge>): SettingsUpdaterTab {
  const service = new StandaloneUpdateService({
    bridge: { kind: 'electrobun', installUpdate: () => undefined, ...bridge },
  });
  return new SettingsUpdaterTab(store, service);
}

/**
 * Clicks the button with this label and lets the resulting work settle.
 *
 * @param tab Update tab.
 * @param label Button label.
 */
async function pressButton(tab: SettingsUpdaterTab, label: string): Promise<void> {
  const button = [...tab.getElement().querySelectorAll('button')].find((element) => element.textContent === label);
  expect(button, `button ${label}`).toBeDefined();
  button!.click();
  await flushPromises();
}

/** Lets pending promise callbacks run. */
async function flushPromises(): Promise<void> {
  for (let tick = 0; tick < 5; tick++) await Promise.resolve();
}
