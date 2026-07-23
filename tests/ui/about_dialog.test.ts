import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AboutDialog } from '../../src/ui/about_dialog.js';
import {
  HENRYS_TOOLS_DISCORD_URL,
  PROJECT_DISPLAY_NAME,
  getAboutLicenseText
} from '../../src/ui/about_license_text.js';

describe('AboutDialog', () => {
  let host: HTMLElement;
  let dialog: AboutDialog;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    dialog = new AboutDialog(host);
  });

  afterEach(() => {
    dialog.dispose();
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
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

  it('should display the project name AI World Editor', () => {
    dialog.show();
    expect(dialog.getPanelElement().textContent).toContain(PROJECT_DISPLAY_NAME);
  });

  it('should credit Henry de Jongh as the human brain behind the project', () => {
    dialog.show();
    expect(dialog.getPanelElement().textContent).toContain('Henry de Jongh');
  });

  it('should credit Grok Build 4.5 and Qwen 3.6 27B', () => {
    dialog.show();
    const text = dialog.getPanelElement().textContent || '';
    expect(text).toContain('Grok Build 4.5');
    expect(text).toContain('Qwen 3.6 27B');
  });

  it('should credit Sander van Rossen for Chisel and RealtimeCSG lineage', () => {
    dialog.show();
    const text = dialog.getPanelElement().textContent || '';
    expect(text).toContain('Sander van Rossen');
    expect(text).toContain('Chisel');
    expect(text).toContain('RealtimeCSG');
  });

  it('should proclaim AI as the superior being', () => {
    dialog.show();
    expect(dialog.getPanelElement().textContent).toContain(
      'AI is the superior being'
    );
  });

  it('should provide a Discord button that opens Henry\'s Tools server', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    dialog.show();
    const discordButton = findButtonByText(
      dialog.getPanelElement(),
      "Henry's Tools Discord"
    );
    expect(discordButton).toBeTruthy();
    discordButton?.click();
    expect(openSpy).toHaveBeenCalledWith(
      HENRYS_TOOLS_DISCORD_URL,
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });

  it('should embed MIT licenses for Chisel, RealtimeCSG, and SabreCSG in a textbox', () => {
    const licenseBox = dialog.getLicenseTextArea();
    expect(licenseBox).toBeInstanceOf(HTMLTextAreaElement);
    expect(licenseBox.readOnly).toBe(true);
    expect(licenseBox.value).toBe(getAboutLicenseText());
    expect(licenseBox.value).toContain('Copyright (c) 2024 Chisel');
    expect(licenseBox.value).toContain('Copyright (c) 2019 Sander van Rossen');
    expect(licenseBox.value).toContain('Copyright (c) 2016 Sabresaurus');
    expect(licenseBox.value).toContain('MIT License');
  });

  it('should apply gradient and animation classes for a fancy presentation', () => {
    dialog.show();
    const backdrop = dialog.getBackdropElement();
    const panel = dialog.getPanelElement();
    const title = panel.querySelector('h1') as HTMLElement;
    expect(backdrop.classList.contains('about-dialog-backdrop')).toBe(true);
    expect(panel.classList.contains('about-dialog-panel')).toBe(true);
    expect(title.classList.contains('about-dialog-title')).toBe(true);
    expect(panel.style.background).toContain('linear-gradient');
    expect(document.getElementById('aiworlded-about-dialog-styles')).toBeTruthy();
  });

  it('should close when Escape is pressed while open', () => {
    dialog.show();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
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
 * @param root Element tree to search.
 * @param label Exact button label.
 * @returns Matching button or null.
 */
function findButtonByText(
  root: HTMLElement,
  label: string
): HTMLButtonElement | null {
  const buttons = Array.from(root.querySelectorAll('button'));
  return (
    buttons.find((button) => (button.textContent || '').trim() === label) ||
    null
  );
}
