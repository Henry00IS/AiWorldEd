import { afterEach, describe, expect, it } from 'vitest';
import type { SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { chip, editorFixture, find } from './solid_script_editor_fixture.js';

const LINES: SolidScriptLine[] = [{ command: 'cube' }, { command: 'sphere' }, { command: 'cube' }];

/** Effects each effectAllowed value lets a drop use, as browsers match them. */
const ALLOWS: Record<string, readonly string[]> = {
  none: [],
  copy: ['copy'],
  move: ['move'],
  link: ['link'],
  copyMove: ['copy', 'move'],
  copyLink: ['copy', 'link'],
  linkMove: ['link', 'move'],
  all: ['copy', 'move', 'link'],
  uninitialized: ['copy', 'move', 'link'],
};

/**
 * One drag's data transfer, following the browser rules that decide the cursor:
 * effectAllowed may only be written on drag start, dropEffect only takes the
 * four effects, and every enter and over starts it from what the source
 * allows.
 */
class BrowserDrag {
  private readonly data: Record<string, string> = {};
  private allowed = 'uninitialized';
  private effect = 'none';
  private phase = '';

  /**
   * Sends a drag event the way a browser does and tells the effect the cursor
   * shows after it.
   *
   * @param element Target.
   * @param type Event type.
   * @returns 'none' for the blocked cursor, else copy, move or link.
   */
  send(element: Element, type: string): string {
    this.phase = type;
    if (type === 'dragenter' || type === 'dragover') this.effect = this.initial();
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: -1 });
    const self = this;
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        get types() {
          return Object.keys(self.data);
        },
        files: [],
        getData: (kind: string) => (self.phase === 'drop' || self.phase === 'dragstart' ? (self.data[kind] ?? '') : ''),
        setData: (kind: string, value: string) => {
          if (self.phase === 'dragstart') self.data[kind] = value;
        },
        get effectAllowed() {
          return self.allowed;
        },
        set effectAllowed(value: string) {
          if (self.phase === 'dragstart' && value in ALLOWS) self.allowed = value;
        },
        get dropEffect() {
          return self.effect;
        },
        set dropEffect(value: string) {
          if (['none', 'copy', 'move', 'link'].includes(value)) self.effect = value;
        },
      },
    });
    element.dispatchEvent(event);
    if (type !== 'dragenter' && type !== 'dragover') return this.effect;
    if (!event.defaultPrevented) return 'none';
    return (ALLOWS[this.allowed] ?? []).includes(this.effect) ? this.effect : 'none';
  }

  /**
   * The effect an enter or over starts with, from what the source allows.
   *
   * @returns Effect.
   */
  private initial(): string {
    if (this.allowed === 'none') return 'none';
    if (this.allowed === 'move' || this.allowed === 'linkMove') return 'move';
    if (this.allowed === 'link') return 'link';
    return 'copy';
  }
}

/**
 * A palette entry, in Favorites or in its own group.
 *
 * @param id Command id.
 * @param favorite True for the entry under Favorites.
 * @returns Entry.
 */
function paletteEntry(id: string, favorite: boolean): HTMLElement {
  const favorites = find('.solid-script-editor-palette-favorites');
  const entry = [
    ...document.querySelectorAll<HTMLElement>(`.solid-script-editor-palette-item[data-command="${id}"]`),
  ].find((candidate) => favorites.contains(candidate) === favorite);
  if (!entry) throw new Error(`Expected ${id}`);
  return entry;
}

/**
 * The elements a drag crosses in the script: the list, a row, its chip and the
 * pieces of text inside it.
 *
 * @returns Targets.
 */
function scriptTargets(): Element[] {
  const row = chip(1).closest('[data-line]');
  return [find('.solid-script-editor-lines'), row!, chip(1), ...chip(1).querySelectorAll('*')];
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
  localStorage.clear();
});

describe('SolidScript editor: the cursor of every drag matches its target', () => {
  it.each([
    ['a palette command', false],
    ['a Favorites command', true],
  ])('shows copy for %s over every part of the script', (_name, favorite) => {
    editorFixture(LINES);
    const drag = new BrowserDrag();
    drag.send(paletteEntry('note', favorite), 'dragstart');
    for (const target of scriptTargets()) {
      expect(drag.send(target, 'dragenter'), `enter ${target.className}`).toBe('copy');
      expect(drag.send(target, 'dragover'), `over ${target.className}`).toBe('copy');
    }
  });

  it('shows copy over Favorites for a command that is not one yet, and blocked for one that is', () => {
    editorFixture(LINES);
    const favorites = find('.solid-script-editor-palette-favorites');
    const cube = new BrowserDrag();
    cube.send(paletteEntry('cube', false), 'dragstart');
    expect(cube.send(favorites, 'dragenter')).toBe('copy');
    expect(cube.send(favorites, 'dragover')).toBe('copy');
    const note = new BrowserDrag();
    note.send(paletteEntry('note', true), 'dragstart');
    expect(note.send(favorites, 'dragover')).toBe('none');
  });

  it('shows move for a line dragged over every part of the script', () => {
    editorFixture(LINES);
    const drag = new BrowserDrag();
    drag.send(find('[data-line="0"]'), 'dragstart');
    for (const target of scriptTargets()) {
      expect(drag.send(target, 'dragenter'), `enter ${target.className}`).toBe('move');
      expect(drag.send(target, 'dragover'), `over ${target.className}`).toBe('move');
    }
  });
});
