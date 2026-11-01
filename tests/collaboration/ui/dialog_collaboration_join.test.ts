import { afterEach, describe, expect, it } from 'vitest';
import { DialogCollaborationJoin } from '@/collaboration/ui/dialog_collaboration_join.js';
import { DialogCollaborationCreate } from '@/collaboration/ui/dialog_collaboration_create.js';
import {
  fieldCollaborationDisplayNameFeedback,
  fieldCollaborationDisplayNameValue,
} from '@/collaboration/ui/field_collaboration_display_name.js';

/**
 * Returns the inputs of the open dialog.
 *
 * @returns Inputs in order.
 */
function inputs(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input')];
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

/** Display name prompts of the create and join dialogs. */
describe('dialog_collaboration_join', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('validates display names: required, at most 12 characters, no control characters', () => {
    expect(fieldCollaborationDisplayNameFeedback(' ')).toBe('Enter your name.');
    expect(fieldCollaborationDisplayNameFeedback('Twelve chars')).toBe('');
    expect(fieldCollaborationDisplayNameFeedback('Thirteen char')).toContain('12');
    expect(fieldCollaborationDisplayNameFeedback('a\u0007b')).toContain('control');
    expect(fieldCollaborationDisplayNameValue('  Bob  ')).toBe('Bob');
  });

  it('prefills the stored name and asks for the password of private rooms only', async () => {
    const pending = new DialogCollaborationJoin(document.body, { name: 'Lab', private: true }, 'Alice', '').open();
    expect(inputs().map((input) => input.value)).toEqual(['Alice', '']);
    click('Join');
    expect(document.body.textContent).toContain('Enter the password.');
    const password = inputs()[1];
    if (password !== undefined) password.value = 'secret';
    click('Join');
    expect(await pending).toEqual({ displayName: 'Alice', password: 'secret' });
  });

  it('refuses to join a public room without a name', async () => {
    const pending = new DialogCollaborationJoin(document.body, { name: 'Lab', private: false }, '', '').open();
    expect(inputs()).toHaveLength(1);
    click('Join');
    expect(document.body.textContent).toContain('Enter your name.');
    const name = inputs()[0];
    if (name !== undefined) name.value = ' Bob ';
    click('Join');
    expect(await pending).toEqual({ displayName: 'Bob', password: '' });
  });

  it('returns the display name from the create dialog', async () => {
    const pending = new DialogCollaborationCreate(document.body, 'Alice room', 'Alice').open();
    expect(inputs()[0]?.value).toBe('Alice');
    click('Create');
    expect(await pending).toMatchObject({ name: 'Alice room', displayName: 'Alice', private: false });
  });
});
