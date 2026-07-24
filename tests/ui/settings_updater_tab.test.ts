import { describe, expect, it } from 'vitest';
import { GITHUB_RELEASES_PAGE_URL } from '../../src/updater/github_release_client.js';
import { StandaloneUpdateService } from '../../src/updater/standalone_update_service.js';
import { SettingsUpdaterTab } from '../../src/ui/settings/settings_updater_tab.js';

describe('SettingsUpdaterTab', () => {
  it('explains browser limitations and links to standalone releases', () => {
    const tab = new SettingsUpdaterTab(new StandaloneUpdateService({ bridge: null }));
    const link = tab.getElement().querySelector('a');

    expect(tab.getElement().textContent).toContain('standalone executable builds');
    expect(link?.href).toBe(GITHUB_RELEASES_PAGE_URL);
  });
});

