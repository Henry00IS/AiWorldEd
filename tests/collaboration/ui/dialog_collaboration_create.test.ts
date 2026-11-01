import { afterEach, describe, expect, it } from 'vitest';
import { DialogCollaborationCreate } from '@/collaboration/ui/dialog_collaboration_create.js';
import { roomCollaborationDefaultName } from '@/collaboration/ui/room_collaboration_default_name.js';

/**
 * Returns a dialog input by its field name.
 *
 * @param field Field name.
 * @returns Input.
 */
function field(field: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`#aiworlded-collab-${field}`);
  if (input === null) throw new Error(`no ${field} input`);
  return input;
}

/**
 * Types text one character at a time, firing an input event per character like
 * a keyboard does.
 *
 * @param input Target input.
 * @param text Text to append.
 */
function type(input: HTMLInputElement, text: string): void {
  for (const character of text) {
    input.value += character;
    input.dispatchEvent(new Event('input'));
  }
}

/**
 * Replaces an input's text and types the new one.
 *
 * @param input Target input.
 * @param text New text.
 */
function retype(input: HTMLInputElement, text: string): void {
  input.value = '';
  input.dispatchEvent(new Event('input'));
  type(input, text);
}

/**
 * Opens the create dialog the way the Collaborate menu does.
 *
 * @param stored Stored display name.
 * @returns Pending result.
 */
function open(stored: string): ReturnType<DialogCollaborationCreate['open']> {
  return new DialogCollaborationCreate(document.body, roomCollaborationDefaultName(stored), stored).open();
}

/** Clicks Create. */
function create(): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];
  buttons.find((button) => button.textContent === 'Create')?.click();
}

describe('collaboration create dialog', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('suggests the room name from the stored display name when it opens', () => {
    void open('Henry');
    expect(field('room-title').value).toBe("Henry's room");
  });

  it('follows the display name as it is typed until the room name is edited', () => {
    void open('');
    expect(field('room-title').value).toBe('My room');
    type(field('display-name'), 'Henry');
    expect(field('room-title').value).toBe("Henry's room");
    retype(field('display-name'), 'James');
    expect(field('room-title').value).toBe("James' room");
    retype(field('room-title'), 'Lab');
    type(field('display-name'), 'on');
    expect(field('room-title').value).toBe('Lab');
  });

  it('creates the room with every typed character of the room and display names', async () => {
    const pending = open('');
    type(field('display-name'), 'Henry Smith!');
    retype(field('room-title'), 'Awesome room');
    create();
    const result = await pending;
    expect(result?.name).toBe('Awesome room');
    expect(result?.displayName).toBe('Henry Smith!');
  });
});
