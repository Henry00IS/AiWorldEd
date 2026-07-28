import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AboutDialog } from '../../../src/ui/about/about_dialog.js';
import {
  HENRYS_TOOLS_DISCORD_URL,
  PROJECT_DISPLAY_NAME,
  getAboutLicenseText,
} from '../../../src/ui/about/about_license_text.js';
import * as fetcher from '../../../src/ui/about/about_contributor_fetcher.js';
import { PORTAL_QUOTES } from '../../../src/ui/about/portal_quotes.js';
import { Theme } from '../../../src/theme.js';
import { hexToRgb } from '../../../src/utils/color_utils.js';

describe('AboutDialog', () => {
  let host: HTMLElement;
  let dialog: AboutDialog;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    vi.spyOn(fetcher, 'fetchGitHubContributors').mockResolvedValue([
      {
        login: 'testuser',
        avatarUrl: 'https://avatars.githubusercontent.com/testuser',
        profileUrl: 'https://github.com/testuser',
        contributions: 10,
        displayName: 'Test User',
      },
    ]);
    dialog = new AboutDialog(host);
  });

  afterEach(() => {
    dialog.dispose();
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
    vi.restoreAllMocks();
  });

  it('should start hidden until shown', () => {
    expect(dialog.isOpen()).toBe(false);
    expect(dialog.getBackdropElement().style.display).toBe('none');
  });

  it('should open and close the modal overlay', () => {
    dialog.show();
    expect(dialog.isOpen()).toBe(true);
    expect(dialog.getBackdropElement().style.display).toBe('flex');
    dialog.hide();
    expect(dialog.isOpen()).toBe(false);
    expect(dialog.getBackdropElement().style.display).toBe('none');
  });

  it('should toggle visibility', () => {
    dialog.toggle();
    expect(dialog.isOpen()).toBe(true);
    dialog.toggle();
    expect(dialog.isOpen()).toBe(false);
  });

  it('should display the project name World Editor without the AI prefix', () => {
    dialog.show();
    expect(dialog.getPanelElement().textContent).toContain(PROJECT_DISPLAY_NAME);
    expect(dialog.getPanelElement().textContent).not.toContain('AI World Editor');
  });

  it('should credit Henry de Jongh as the project architect', () => {
    dialog.show();
    expect(dialog.getPanelElement().textContent).toContain('Project Architect: Henry de Jongh');
  });

  it('should credit Grok Build 4.5 and Qwen 3.6 27B as technical consultants', () => {
    dialog.show();
    const text = dialog.getPanelElement().textContent || '';
    expect(text).toContain('Technical consultants: Grok Build 4.5 · Qwen 3.6 27B');
  });

  it('should include a GitHub Contributors section label', async () => {
    dialog.show();
    const panel = dialog.getPanelElement();

    await waitForContributorSpheres(panel);

    const labels = panel.querySelectorAll('div');
    const contributorLabel = Array.from(labels).find((el) => el.textContent === 'GitHub Contributors');
    expect(contributorLabel).toBeTruthy();
  });

  it('should render contributor spheres with avatar images', async () => {
    dialog.show();
    const panel = dialog.getPanelElement();

    await waitForContributorSpheres(panel);

    const rollContainer = panel.querySelector('.contributor-roll');
    expect(rollContainer).toBeTruthy();

    const spheres = rollContainer?.querySelectorAll('.contributor-sphere');
    expect(spheres?.length).toBeGreaterThanOrEqual(1);

    if (spheres && spheres.length > 0) {
      const img = spheres[0]!.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.src).toContain('avatars.githubusercontent.com');
    }
  });

  it('should credit Sander van Rossen for Chisel and RealtimeCSG lineage', () => {
    dialog.show();
    const text = dialog.getPanelElement().textContent || '';
    expect(text).toContain('Sander van Rossen');
    expect(text).toContain('Chisel');
    expect(text).toContain('RealtimeCSG');
    expect(text).toContain('SabreCSG');
    expect(text).toContain('three.js');
  });

  it('should show a Portal quote without the removed proclamation', () => {
    dialog.show();
    const quote = findPortalQuote(dialog);
    const panelText = dialog.getPanelElement().textContent || '';
    expect(PORTAL_QUOTES).toContain(quote);
    expect(panelText).not.toContain('AI is the superior being');
    expect(panelText.toLowerCase()).not.toContain('superior');
  });

  it('should change the Portal quote whenever the dialog is reopened', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    dialog.show();
    const firstQuote = findPortalQuote(dialog);
    dialog.hide();
    dialog.show();
    const secondQuote = findPortalQuote(dialog);
    expect(secondQuote).not.toBe(firstQuote);
  });

  it('should not change the Portal quote when show is called while open', () => {
    dialog.show();
    const firstQuote = findPortalQuote(dialog);
    dialog.show();
    expect(findPortalQuote(dialog)).toBe(firstQuote);
  });

  it("should provide a Discord button that opens Henry's Tools server", () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    dialog.show();
    const discordButton = findButtonByText(dialog.getPanelElement(), "Henry's Tools Discord");
    expect(discordButton).toBeTruthy();
    discordButton?.click();
    expect(openSpy).toHaveBeenCalledWith(HENRYS_TOOLS_DISCORD_URL, '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('should embed MIT licenses for Chisel, RealtimeCSG, SabreCSG, and three.js', () => {
    const licenseBox = dialog.getLicenseTextArea();
    expect(licenseBox).toBeInstanceOf(HTMLTextAreaElement);
    expect(licenseBox.readOnly).toBe(true);
    expect(licenseBox.value).toBe(getAboutLicenseText());
    expect(licenseBox.value).toContain('Copyright (c) 2024 Chisel');
    expect(licenseBox.value).toContain('Copyright (c) 2019 Sander van Rossen');
    expect(licenseBox.value).toContain('Copyright (c) 2016 Sabresaurus');
    expect(licenseBox.value).toContain('three.js');
    expect(licenseBox.value).toContain('MIT License');
  });

  it('should use the shared editor theme for modal presentation', () => {
    dialog.show();
    const backdrop = dialog.getBackdropElement();
    const panel = dialog.getPanelElement();
    const title = panel.querySelector('h1') as HTMLElement;
    expect(backdrop.classList.contains('about-dialog-backdrop')).toBe(true);
    expect(panel.classList.contains('about-dialog-panel')).toBe(true);
    expect(title.classList.contains('about-dialog-title')).toBe(true);
    expect(panel.style.background).toBe(hexToRgb(Theme.propertiesPanelBackground));
    expect(panel.style.fontFamily).toContain('Segoe UI');
    expect(panel.style.border).toContain(hexToRgb(Theme.separatorColor));
    expect(document.getElementById('aiworlded-about-dialog-styles')).toBeTruthy();
  });

  it('should expose theme hooks for the complete dialog', () => {
    const panel = dialog.getPanelElement();
    const expectedSelectors = [
      '.about-dialog-header',
      '.about-dialog-body',
      '.about-dialog-quote',
      '.about-dialog-credits',
      '.about-dialog-contributors',
      '.about-dialog-licenses',
      '.about-dialog-license',
      '.about-dialog-footer',
    ];
    expectedSelectors.forEach((selector) => expect(panel.querySelector(selector)).toBeTruthy());
    const styleText = document.getElementById('aiworlded-about-dialog-styles')?.textContent || '';
    expect(styleText).toContain("html[data-aiworlded-theme='light'] .about-dialog-panel");
    expect(styleText).toContain("html[data-aiworlded-theme='light'] .about-dialog-quote");
    expect(styleText).toContain("html[data-aiworlded-theme='light'] .about-dialog-license");
  });

  it('should close when Escape is pressed while open', () => {
    dialog.show();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog.isOpen()).toBe(false);
  });

  it('should close when the footer Close button is clicked', () => {
    dialog.show();
    const closeButton = findButtonByText(dialog.getPanelElement(), 'Close');
    closeButton?.click();
    expect(dialog.isOpen()).toBe(false);
  });

  it('should remove itself from the host on dispose', () => {
    dialog.show();
    dialog.dispose();
    expect(host.contains(dialog.getBackdropElement())).toBe(false);
    expect(dialog.isOpen()).toBe(false);
  });
});

/**
 * Finds a button under a root whose text content matches exactly.
 *
 * @param root Element tree to search.
 * @param label Exact button label.
 * @returns Matching button or null.
 */
function findButtonByText(root: HTMLElement, label: string): HTMLButtonElement | null {
  const buttons = Array.from(root.querySelectorAll('button'));
  return buttons.find((button) => (button.textContent || '').trim() === label) || null;
}

/**
 * Reads the currently displayed Portal quote.
 *
 * @param dialog About dialog being inspected.
 * @returns Displayed quote text.
 */
function findPortalQuote(dialog: AboutDialog): string {
  const quote = dialog.getPanelElement().querySelector('[aria-label="Portal quote"]');
  return quote?.textContent || '';
}

/**
 * Waits for the async contributor fetch to populate spheres in the dialog.
 *
 * @param panel Dialog panel to observe.
 */
async function waitForContributorSpheres(panel: HTMLElement): Promise<void> {
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    const roll = panel.querySelector('.contributor-roll');
    if (roll && roll.querySelectorAll('.contributor-sphere').length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
