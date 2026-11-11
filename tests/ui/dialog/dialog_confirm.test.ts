import { afterEach, describe, expect, it } from 'vitest';
import { showConfirmDialog, showMessageBox, showMessageNotice } from '@/ui/dialog/dialog_message_box.js';

describe('showMessageBox', () => {
  let host: HTMLElement;

  afterEach(() => {
    document.querySelectorAll('.editor-message-box-backdrop').forEach((node) => node.remove());
    document.querySelectorAll('.editor-confirm-dialog-backdrop').forEach((node) => node.remove());
    host?.remove();
  });

  it('resolves true when Yes is clicked', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const promise = showMessageBox({
      host,
      title: 'Create New Scene',
      message: 'Any unsaved changes will be permanently lost.',
    });
    const yes = host.querySelector('[data-message-box-accept="true"]') as HTMLButtonElement;
    expect(yes.textContent).toBe('Yes');
    yes.click();
    await expect(promise).resolves.toBe(true);
    expect(host.querySelector('.editor-message-box-backdrop')).toBeNull();
  });

  it('resolves false when No is clicked', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const promise = showMessageBox({
      host,
      title: 'Create New Scene',
      message: 'Any unsaved changes will be permanently lost.',
    });
    const no = host.querySelector('[data-message-box-cancel="true"]') as HTMLButtonElement;
    expect(no.textContent).toBe('No');
    no.click();
    await expect(promise).resolves.toBe(false);
  });

  it('resolves false when Escape is pressed', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const promise = showMessageBox({
      host,
      title: 'Create New Scene',
      message: 'Discard changes?',
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(promise).resolves.toBe(false);
  });

  it('shows a notice with one focused OK button that Escape also closes', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const promise = showMessageNotice({ host, title: 'Level Too Large', message: 'Remove textures.' });
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.map((each) => each.textContent)).toEqual(['OK']);
    expect(document.activeElement).toBe(buttons[0]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(promise).resolves.toBeUndefined();
    expect(host.querySelector('[role=alertdialog]')).toBeNull();
  });

  it('keeps showConfirmDialog as a working alias', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const promise = showConfirmDialog({
      host,
      title: 'Alias',
      message: 'Works',
    });
    const yes = host.querySelector('[data-confirm-accept="true"]') as HTMLButtonElement;
    yes.click();
    await expect(promise).resolves.toBe(true);
  });

  it('renders an optional bold message under the main body', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const promise = showMessageBox({
      host,
      title: 'Reset All Settings',
      message: 'Settings will be cleared.',
      boldMessage: 'Any unsaved changes will be permanently lost.',
    });
    const paragraphs = Array.from(host.querySelectorAll('.editor-message-box-panel p'));
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    const bold = paragraphs[paragraphs.length - 1] as HTMLElement;
    expect(bold.textContent).toBe('Any unsaved changes will be permanently lost.');
    expect(bold.style.fontWeight).toBe('700');
    const no = host.querySelector('[data-message-box-cancel="true"]') as HTMLButtonElement;
    no.click();
    await expect(promise).resolves.toBe(false);
  });
});
