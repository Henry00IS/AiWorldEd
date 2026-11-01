import { afterEach, describe, expect, it } from 'vitest';
import { DialogCollaborationJoin } from '@/collaboration/ui/dialog_collaboration_join.js';
import { DialogCollaborationCreate } from '@/collaboration/ui/dialog_collaboration_create.js';
import { DialogCollaborationSettings } from '@/collaboration/ui/dialog_collaboration_settings.js';
import { indicatorCollaborationPassword } from '@/collaboration/ui/indicator_collaboration_status.js';

/**
 * Returns the inputs of the open dialog.
 *
 * @returns Inputs.
 */
function inputs(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input')];
}

/**
 * Checks that no input looks like a login field to browsers or password
 * managers.
 *
 * @param root Root to scan.
 */
function expectNoCredentialFields(root: ParentNode): void {
  expect(root.querySelectorAll('input[type="password"]')).toHaveLength(0);
  expect(root.querySelectorAll('form')).toHaveLength(0);
  for (const input of root.querySelectorAll<HTMLInputElement>('input')) {
    expect(input.type).toBe('text');
    expect(input.autocomplete).toBe('off');
    expect(input.hasAttribute('data-1p-ignore')).toBe(true);
    expect(input.getAttribute('data-lpignore')).toBe('true');
    expect(input.getAttribute('data-form-type')).toBe('other');
    expect(`${input.name} ${input.id}`).not.toMatch(/user|pass|login|email/i);
  }
}

/**
 * Clicks the dialog button with a label.
 *
 * @param label Button label.
 */
function click(label: string): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];
  buttons.find((button) => button.textContent === label)?.click();
}

describe('collaboration dialogs never look like a login form', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the password out of the DOM while a room is public', () => {
    const dialog = new DialogCollaborationCreate(document.body, "Henry's room", 'Henry');
    void dialog.open();
    expectNoCredentialFields(document.body);
    expect(inputs()).toHaveLength(2);
    const visibility = document.querySelector<HTMLSelectElement>('[role="dialog"] select');
    if (visibility === null) throw new Error('no visibility select');
    visibility.value = 'private';
    visibility.dispatchEvent(new Event('change'));
    expectNoCredentialFields(document.body);
    const key = inputs()[2];
    expect(key?.disabled).toBe(false);
    expect(key?.dataset['masked']).toBe('true');
    click('Show');
    expect(key?.dataset['masked']).toBe('false');
    click('Hide');
    expect(key?.dataset['masked']).toBe('true');
    visibility.value = 'public';
    visibility.dispatchEvent(new Event('change'));
    expect(inputs()).toHaveLength(2);
    expect(key?.isConnected).toBe(false);
    expect(key?.disabled).toBe(true);
  });

  it('uses a masked text input to join a private room', () => {
    void new DialogCollaborationJoin(document.body, { name: 'Lab', private: true }, 'Alice', '').open();
    expectNoCredentialFields(document.body);
    expect(inputs()[1]?.dataset['masked']).toBe('true');
  });

  it('has no credential fields in the settings dialog or the room password row', () => {
    void new DialogCollaborationSettings(document.body, { url: '', name: 'Bob' }, 'wss://example.test/ws').open();
    expectNoCredentialFields(document.body);
    const row = indicatorCollaborationPassword('secret-value');
    expectNoCredentialFields(row);
    expect(row.querySelectorAll('input')).toHaveLength(0);
  });
});
