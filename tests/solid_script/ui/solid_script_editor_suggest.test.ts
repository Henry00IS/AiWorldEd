import { afterEach, describe, expect, it } from 'vitest';
import {
  chip,
  doubleClick,
  editorFixture,
  explorerRows,
  find,
  press,
  tool,
  type,
  editorCleanup,
  CUBE_SPHERE,
} from './solid_script_editor_fixture.js';

afterEach(editorCleanup);

describe('SolidScript editor suggestions and variables', () => {
  it('suggests the names of the script while typing, inserts them and checks fields as they are typed', () => {
    const { script } = editorFixture([
      { command: 'input', values: { name: 'steps', type: 'Count', default: '3' } },
      { command: 'variable', values: { name: 'width', value: '2' } },
      { command: 'cube' },
    ]);
    doubleClick(chip(2));
    const [x] = document.querySelectorAll<HTMLInputElement>('[data-solid-script-configurator="cube"] input');
    if (!x) throw new Error('Expected the Size X input');
    x.focus();
    x.setSelectionRange(0, x.value.length);
    type(x, '[w');
    x.setSelectionRange(2, 2);
    x.dispatchEvent(new Event('input', { bubbles: true }));
    // The list opens over the page, never inside the window where it gets cut off.
    const list = find('body > .solid-script-editor-suggestions-host [role="listbox"]');
    expect(list.closest('[data-solid-script-configurator]')).toBeNull();
    const typed = [...list.querySelectorAll('[role="option"]')].map((option) => option.firstChild?.textContent);
    expect(typed[0]).toBe('width');
    expect(typed).toContain('$Box.Width');
    press(x, 'Enter');
    expect(x.value).toBe('[width]');
    expect(document.querySelector('[data-solid-script-configurator="cube"]')).not.toBeNull();
    type(x, '[depth]');
    const dialog = find('[data-solid-script-configurator="cube"]');
    expect(dialog.textContent).toContain('no line sets [depth] yet');
    expect(tool('OK').disabled).toBe(false);
    type(x, '[=1 +');
    expect(x.classList.contains('solid-script-editor-invalid')).toBe(true);
    expect(tool('OK').disabled).toBe(true);
    type(x, '');
    x.setSelectionRange(0, 0);
    // Entering a field leaves the list closed; clicking it opens the list at the caret.
    x.value = '[';
    x.setSelectionRange(1, 1);
    x.blur();
    expect(document.querySelector('[aria-label="Suggestions"]')).toBeNull();
    x.focus();
    expect(document.querySelector('[aria-label="Suggestions"]')).toBeNull();
    x.click();
    expect(
      [...document.querySelectorAll('[aria-label="Suggestions"] [role="option"]')].map(
        (option) => option.firstChild?.textContent,
      ),
    ).toContain('$Box.Width');
    const styles = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '').join('\n');
    // Group headings stick flush to the top of the list: no top padding above them to show rows through.
    expect(styles).toMatch(/\.solid-script-editor-suggestions \{[^}]*padding: 0 0 4px;/);
    expect(styles).toMatch(/\.solid-script-editor-suggestion-heading \{[^}]*position: sticky; top: 0;[^}]*background:/);
    x.blur();
    x.value = '$[';
    x.setSelectionRange(2, 2);
    x.focus();
    expect(document.querySelector('[aria-label="Suggestions"]')).toBeNull();
    x.value = '[';
    x.setSelectionRange(1, 1);
    x.click();
    const pick = [...document.querySelectorAll<HTMLElement>('[aria-label="Suggestions"] [role="option"]')].find(
      (option) => option.firstChild?.textContent === '$Box.Width',
    )!;
    pick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(x.value).toBe('[$Box.Width]');
    expect(document.activeElement).toBe(x);
    tool('OK').click();
    expect(script().blocks[2]?.values['size']).toBe('[$Box.Width]');
  });

  it('checks Input lines while they are configured and lists what the script defines in the variable explorer', () => {
    editorFixture([
      { command: 'input', values: { name: 'steps', type: 'Count', default: '3' } },
      { command: 'variable', values: { name: 'width', value: '2' } },
      { command: 'cube' },
    ]);
    doubleClick(chip(0));
    const type_ = find<HTMLInputElement>('[data-solid-script-configurator="input"] input[aria-label="Type"]');
    type(type_, 'colour');
    expect(find('[data-solid-script-configurator="input"]').textContent).toContain('Type must be one of');
    expect(tool('OK').disabled).toBe(true);
    press(type_, 'Escape');
    find<HTMLButtonElement>('[data-tab="variables"]').click();
    expect(explorerRows()).toEqual(['steps|3|Whole Number · Read Only|1', 'width|2|Whole Number|2']);
    find<HTMLButtonElement>('[data-category="Inputs"]').click();
    expect(explorerRows()).toEqual(['steps|3|Whole Number · Read Only|1']);
    find<HTMLButtonElement>('[data-category="All"]').click();
    find<HTMLElement>('.solid-script-editor-explorer-row[data-name="width"]').click();
    expect(document.activeElement).toBe(chip(1));
  });

  it('opens the suggestions on the page above every window, inside the page edges', () => {
    editorFixture(CUBE_SPHERE);
    doubleClick(chip(0));
    const field = document.querySelector<HTMLInputElement>('[data-solid-script-configurator] input[type="text"]')!;
    const window = field.closest<HTMLElement>('[data-solid-script-configurator]')!;
    field.getBoundingClientRect = () => new DOMRect(900, globalThis.innerHeight - 40, 120, 24);
    field.focus();
    type(field, '[');
    const host = document.querySelector<HTMLElement>('body > .solid-script-editor-suggestions-host')!;
    expect(window.contains(host)).toBe(false);
    expect(host.style.top).toBe('');
    expect(host.style.maxHeight).toBe(`${globalThis.innerHeight - 40 - 8}px`);
    expect(Number.parseFloat(host.style.left) + Number.parseFloat(host.style.width)).toBeLessThanOrEqual(
      globalThis.innerWidth - 4,
    );
    expect(Number.parseFloat(host.style.width)).toBeGreaterThanOrEqual(Math.min(560, globalThis.innerWidth - 8));
  });

  it('offers the shape Names of the script in the Of field', () => {
    editorFixture([
      { command: 'cube', values: { label: 'Knob' } },
      { command: 'sphere', values: { label: 'Handle' } },
      { command: 'select_objects' },
      { command: 'select_faces' },
    ]);
    doubleClick(chip(3));
    const of = find<HTMLInputElement>('[data-solid-script-configurator="select_faces"] input[aria-label="Of"]');
    of.focus();
    of.click();
    const shown = [...document.querySelectorAll('body > .solid-script-editor-suggestions-host [role="option"]')].map(
      (option) => option.firstChild?.textContent,
    );
    expect(shown.slice(0, 2)).toEqual(['Knob', 'Handle']);
    expect(chip(0).textContent).toContain("Named 'Knob'");
  });

  it('suggests the counters and loop values a line sees, and only inside their loop', () => {
    editorFixture([
      { command: 'repeat', values: { variable: 'Row' } },
      { command: 'for_each', values: { variable: 'Face', list: '[$Selected.Faces]', key: 'Spot' } },
      { command: 'cube' },
      { command: 'end' },
      { command: 'end' },
      { command: 'echo' },
    ]);
    const offered = (line: number): string[] => {
      doubleClick(chip(line));
      const field = document.querySelector<HTMLInputElement>('[data-solid-script-configurator] input[type="text"]')!;
      field.focus();
      type(field, '[');
      const shown = [...document.querySelectorAll('body > .solid-script-editor-suggestions-host [role="option"]')].map(
        (option) => option.firstChild?.textContent ?? '',
      );
      press(field, 'Escape');
      press(document.querySelector<HTMLElement>('[data-solid-script-configurator]') ?? field, 'Escape');
      return shown;
    };
    const inside = offered(2);
    expect(inside).toContain('Row');
    expect(inside).toContain('Face');
    expect(inside).toContain('Spot');
    const after = offered(5);
    expect(after).not.toContain('Row');
    expect(after).not.toContain('Spot');
  });

  it('offers the words a field takes first, shows the call being typed and browses the words too', () => {
    editorFixture([{ command: 'cube' }, { command: 'select_faces' }]);
    doubleClick(chip(1));
    const which = find<HTMLInputElement>('[data-solid-script-configurator="select_faces"] input[aria-label="Which"]');
    which.focus();
    which.click();
    const options = () =>
      [...document.querySelectorAll('body > .solid-script-editor-suggestions-host [role="option"]')].map(
        (option) => option.firstChild?.textContent,
      );
    expect(options().slice(0, 3)).toEqual(['All', 'Between', 'Facing Up']);
    type(which, 'Bott');
    expect(options()).toEqual(['Bottom']);
    press(which, 'Enter');
    expect(which.value).toBe('Bottom');
    const where = find<HTMLInputElement>('[data-solid-script-configurator="select_faces"] input[aria-label="Where"]');
    where.focus();
    type(where, '[=Max(2, ');
    const hint = find('.solid-script-editor-suggestion-signature');
    expect(hint.querySelector('strong')?.textContent).toBe('B: Number or Vector');
    expect(hint.textContent).toBe(
      'Max(A: Number or Vector or List, B: Number or Vector, ...: Number or Vector) -> Number or Vector' +
        'B: Number or Vector. Another number, or another vector for the highest per axis.' +
        'Picks the biggest number from the values you give, or from one list. Two or more vectors give the highest on each axis.',
    );
    expect(options()).toContain('$Box.Width');
    const how = find<HTMLInputElement>('[data-solid-script-configurator="select_faces"] input[aria-label="How"]');
    how.focus();
    how.click();
    expect(find('[aria-label="Suggestions"] .solid-script-editor-suggestion-heading').textContent).toBe('Choices');
    const add = [...document.querySelectorAll<HTMLElement>('[aria-label="Suggestions"] [role="option"]')].find(
      (option) => option.firstChild?.textContent === 'Add',
    )!;
    add.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(how.value).toBe('Add');
    expect(document.activeElement).toBe(how);
    tool('Cancel').click();
  });

  it('suggests a Function its own locals, and no locals outside it', () => {
    editorFixture([
      { command: 'function', values: { name: 'lift', parameters: 'h' } },
      { command: 'return', values: { value: '1' } },
      { command: 'end' },
      { command: 'cube' },
    ]);
    const offered = (line: number): string[] => {
      doubleClick(chip(line));
      const field = document.querySelector<HTMLInputElement>('[data-solid-script-configurator] input[type="text"]')!;
      field.value = '[';
      field.setSelectionRange(1, 1);
      field.dispatchEvent(new Event('input'));
      const names = [...document.querySelectorAll<HTMLElement>('.solid-script-editor-suggestions [role="option"]')].map(
        (row) => row.firstElementChild?.textContent ?? '',
      );
      tool('Cancel').click();
      return names;
    };
    expect(offered(1)).toContain('$Local.h');
    expect(offered(3)).not.toContain('$Local.h');
  });

  it('explores variables: search, lists by index, every Set line, and Insert into the open field', () => {
    editorFixture([
      { command: 'variable', values: { name: 'pts()', value: '1, 2' } },
      { command: 'variable', values: { name: 'pts()', value: '3, 4' } },
      { command: 'variable', values: { name: 'label', value: 'Hall' } },
      { command: 'variable', values: { name: 'label', value: 'Big Hall' } },
      { command: 'cube' },
      { command: 'if', values: { condition: '1 == 2' } },
      { command: 'variable', values: { name: 'later', value: '1' } },
      { command: 'end' },
    ]);
    find<HTMLButtonElement>('[data-tab="variables"]').click();
    expect(explorerRows()).toEqual([
      'label|Big Hall|Text|3,4',
      'later|—|Not Set Yet|7',
      '▸ pts()|[[1, 2], [3, 4]]|List of Vectors|1,2',
    ]);
    find<HTMLElement>('.solid-script-editor-explorer-row[data-name="pts"] > span').click();
    expect(explorerRows().slice(2)).toEqual([
      '▾ pts()|[[1, 2], [3, 4]]|List of Vectors|1,2',
      'pts(0)|[1, 2]|Vector|1,2',
      'pts(1)|[3, 4]|Vector|1,2',
    ]);
    const search = find<HTMLInputElement>('.solid-script-editor-explorer-search');
    type(search, 'text');
    // Built-in values whose name or detail holds the search show too.
    expect(explorerRows().filter((row) => !row.endsWith('Read Only|'))).toEqual(['label|Big Hall|Text|3,4']);
    expect(explorerRows()).toContain('$Run.Context|generator|Text · Read Only|');
    press(search, 'Escape');
    expect(explorerRows()).toHaveLength(5);
    find<HTMLButtonElement>(
      '.solid-script-editor-explorer-row[data-name="label"] .solid-script-editor-explorer-line:last-child',
    ).click();
    expect(document.activeElement).toBe(chip(3));
    // The explorer only watches values; picking them happens in the windows of the lines.
    expect(document.querySelector('.solid-script-editor-explorer button[aria-label^="Insert"]')).toBeNull();
    expect(find('.solid-script-editor-explorer').innerHTML).not.toMatch(/insert/i);
  });
});
