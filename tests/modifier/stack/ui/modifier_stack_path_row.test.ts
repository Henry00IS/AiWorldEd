import { afterEach, describe, expect, it } from 'vitest';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import type { ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';
import { pathCreate, pathDecode, pathEncode } from '@/path/model/path_model.js';

/**
 * Renders the Path Array fields with a recording commit.
 *
 * @param path Encoded path shown.
 * @returns Root element and the commits made.
 */
function render(path: string) {
  const kind = modifierStackKindFind('path')!;
  const commits: [string, ModifierStackValue][] = [];
  const rows = new ModifierStackFieldRows(kind.fields, (key, value) => commits.push([key, value]));
  document.body.appendChild(rows.getElement());
  rows.update(kind.normalizeParameters({ path }));
  return { root: rows.getElement(), commits, rows, kind };
}

/**
 * Finds an element by accessible name.
 *
 * @param root Search root.
 * @param label Accessible name.
 * @returns Element.
 */
function named<T extends HTMLElement>(root: HTMLElement, label: string): T {
  const found = root.querySelector<T>(`[aria-label="${label}"]`);
  if (!found) throw new Error(`No control ${label}`);
  return found;
}

const triangle = pathEncode(
  pathCreate(
    [
      [0, 0, 0],
      [2, 0, 0],
      [2, 1, 2],
    ],
    { smooth: false },
  ),
);

describe('path field editor', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows one X, Y, Z row per point with the stored values', () => {
    const { root } = render(triangle);
    expect(named<HTMLInputElement>(root, 'Point 3 Y').value).toBe('1');
    expect(root.querySelector('[aria-label="Point 4 X"]')).toBeNull();
    expect(named<HTMLInputElement>(root, 'Smooth Curve').checked).toBe(false);
    expect(named<HTMLInputElement>(root, 'Closed Loop').checked).toBe(false);
  });

  it('commits a typed coordinate as the whole path', () => {
    const { root, commits } = render(triangle);
    const input = named<HTMLInputElement>(root, 'Point 2 Z');
    input.value = '5';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const last = commits[commits.length - 1]!;
    expect(last[0]).toBe('path');
    expect(pathDecode(last[1])?.points[1]).toEqual({ x: 2, y: 0, z: 5 });
  });

  it('adds, removes and reverses points and toggles the loop and smoothing', () => {
    const { root, commits } = render(triangle);
    named<HTMLButtonElement>(root, 'Add Point').click();
    expect(pathDecode(commits.pop()![1])?.points[3]).toEqual({ x: 2, y: 2, z: 4 });
    named<HTMLButtonElement>(root, 'Remove Point 2').click();
    expect(pathDecode(commits.pop()![1])?.points.map((point) => point.x)).toEqual([0, 2]);
    named<HTMLButtonElement>(root, 'Reverse Path Direction').click();
    expect(pathDecode(commits.pop()![1])?.points[0]).toEqual({ x: 2, y: 1, z: 2 });
    const closed = named<HTMLInputElement>(root, 'Closed Loop');
    closed.checked = true;
    closed.dispatchEvent(new Event('change'));
    expect(pathDecode(commits.pop()![1])?.closed).toBe(true);
    const smooth = named<HTMLInputElement>(root, 'Smooth Curve');
    smooth.checked = true;
    smooth.dispatchEvent(new Event('change'));
    expect(pathDecode(commits.pop()![1])?.smooth).toBe(true);
  });

  it('never lets a path drop below two points', () => {
    const { root, rows, kind } = render(triangle);
    rows.update(
      kind.normalizeParameters({
        path: pathEncode(
          pathCreate([
            [0, 0, 0],
            [1, 0, 0],
          ]),
        ),
      }),
    );
    expect(named<HTMLButtonElement>(root, 'Remove Point 1').disabled).toBe(true);
    expect(root.querySelector('[aria-label="Point 3 X"]')).toBeNull();
  });
});
