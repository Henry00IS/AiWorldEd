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

/**
 * Public approval is the default; open rooms warn and private rooms retain edit
 * access.
 */
it('defaults public rooms to viewers and warns only for open public rooms', async () => {
  const pending = open('Owner');
  const mode = document.querySelector<HTMLSelectElement>('select[aria-label="Editing permissions"]');
  if (!mode) throw new Error('missing edit mode selector');
  expect(mode.value).toBe('viewers');
  mode.value = 'anyone';
  mode.dispatchEvent(new Event('change'));
  const warning = [...document.querySelectorAll<HTMLElement>('[role="dialog"] p')].find((element) =>
    element.textContent?.startsWith('Anyone can edit is a free-for-all'),
  );
  expect(warning?.parentElement?.style.display).toBe('flex');
  const visibility = [...document.querySelectorAll<HTMLSelectElement>('select')].find((element) =>
    [...element.options].some((option) => option.value === 'private'),
  );
  if (!visibility) throw new Error('missing visibility selector');
  visibility.value = 'private';
  visibility.dispatchEvent(new Event('change'));
  expect(warning?.parentElement?.style.display).toBe('none');
  create();
  expect(await pending).toMatchObject({ private: true, editMode: 'anyone' });
  document.body.innerHTML = '';
});

/** Every field retains the shared row layout after visibility validation. */
it('keeps Editing in the shared full-width field column with an aligned hint', () => {
  void open('Owner');
  const fields = [...document.querySelectorAll<HTMLElement>('[role="dialog"] label')];
  const named = (name: string) => fields.find((row) => row.firstElementChild?.textContent === name);
  const reference = named('Your name');
  const editing = named('Editing');
  const visibility = named('Visibility')?.querySelector('select');
  if (!reference || !editing || !visibility) throw new Error('missing dialog fields');
  for (const value of ['private', 'public']) {
    visibility.value = value;
    visibility.dispatchEvent(new Event('change'));
  }
  for (const caption of ['Room name', 'Visibility', 'Editing']) {
    const row = named(caption);
    expect(row?.style.display).toBe(reference.style.display);
    expect(row?.style.gap).toBe(reference.style.gap);
    expect((row?.firstElementChild as HTMLElement)?.style.width).toBe(
      (reference.firstElementChild as HTMLElement).style.width,
    );
  }
  const mode = editing.querySelector('select');
  expect(mode?.style.flex).toBe(visibility.style.flex);
  expect(mode?.style.minWidth).toBe(visibility.style.minWidth);
  if (!mode) throw new Error('missing mode');
  mode.value = 'anyone';
  mode.dispatchEvent(new Event('change'));
  const hint = [...document.querySelectorAll('p')].find((line) => line.textContent?.includes('free-for-all'));
  expect(hint?.parentElement?.style.display).toBe(reference.style.display);
  expect((hint?.parentElement?.firstElementChild as HTMLElement)?.style.width).toBe(
    (reference.firstElementChild as HTMLElement).style.width,
  );
  document.body.innerHTML = '';
});
