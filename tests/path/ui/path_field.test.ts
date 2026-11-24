import { describe, expect, it, vi } from 'vitest';
import { PathField } from '@/path/ui/path_field.js';
import { pathAssetEncode, type PathAsset } from '@/path/model/path_asset.js';
import { pathFileWrite } from '@/path/model/path_file.js';
import { pathEditSelect, pathEditSelected, pathEditSelectionListen } from '@/path/edit/path_edit_selection.js';

/**
 * Types a value into a labelled field and commits it.
 *
 * @param root Element holding the field.
 * @param label Accessible name.
 * @param value Typed value.
 */
function type(root: HTMLElement, label: string, value: string): void {
  const field = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`);
  if (!field) throw new Error(`no ${label}`);
  field.value = value;
  field.dispatchEvent(new Event('change'));
}

const SQUARE: PathAsset = {
  points: [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [0, 0, 1],
  ],
  segments: [
    { kind: 'Straight' },
    { kind: 'Arc', degrees: 90, axis: [0, 1, 0] },
    { kind: 'Straight' },
    { kind: 'Smooth' },
  ],
  closed: true,
};

/**
 * Drops files on a field and waits for it to read them.
 *
 * @param field Field.
 * @param file Dropped file.
 */
async function drop(field: PathField, file: File): Promise<void> {
  const event = new Event('drop') as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: { getData: () => '', files: [file] } });
  field.getElement().dispatchEvent(event);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('PathField', () => {
  it('sums up the path instead of listing points to type into', () => {
    const field = new PathField({ label: 'Rail', onCommit: vi.fn() });
    field.setText(pathAssetEncode(SQUARE));
    expect(field.getElement().querySelector('[data-path-summary]')?.textContent).toBe(
      '4 Points · Closed · 2 Straight · 1 Arc · 1 Smooth',
    );
    expect(field.getElement().querySelector('[data-path-point] input')).toBeNull();
    field.setText('');
    expect(field.getElement().textContent).toContain('2 Points · Open · 1 Straight');
  });

  it('opens a dropped .aipath file into the input and explains a file that does not fit', async () => {
    const onCommit = vi.fn();
    const field = new PathField({ label: 'Rail', onCommit });
    await drop(field, new File([pathFileWrite(SQUARE, 'Square')], 'Square.aipath'));
    expect(onCommit).toHaveBeenCalledWith(SQUARE);
    await drop(field, new File(['{}'], 'Notes.txt'));
    expect(field.getElement().querySelector('[role="status"]')?.textContent).toBe('Only .aipath files fit here.');
    await drop(field, new File(['{"format":"aiworlded-path","version":1,"path":{}}'], 'Empty.aipath'));
    expect(field.getElement().querySelector('[role="status"]')?.textContent).toContain('no path');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('shows a selected point as one row per axis, like other vector fields, then the stretch leaving it', () => {
    const onCommit = vi.fn();
    const field = new PathField({ label: 'Rail', onCommit });
    field.setText(pathAssetEncode(SQUARE));
    field.setSelected({ points: [1], segments: [] });
    const root = field.getElement();
    expect(root.querySelector('[data-path-point]')?.textContent).toContain('Point 2 of 4');
    const axes = [...root.querySelectorAll('[aria-label^="Point "]')];
    expect(axes.map((each) => each.getAttribute('aria-label'))).toEqual(['Point X', 'Point Y', 'Point Z']);
    expect(new Set(axes.map((each) => each.closest('.modifier-stack-ui-row'))).size).toBe(3);
    expect(root.querySelector<HTMLSelectElement>('[aria-label="Stretch"]')?.value).toBe('Arc');
    type(root, 'Point X', '3');
    expect(onCommit).toHaveBeenLastCalledWith({
      ...SQUARE,
      points: [SQUARE.points[0], [3, 0, 0], ...SQUARE.points.slice(2)],
    });
  });

  it('shows a selected stretch: its kind and settings', () => {
    const onCommit = vi.fn();
    const field = new PathField({ label: 'Rail', onCommit });
    field.setText(pathAssetEncode(SQUARE));
    field.setSelected({ points: [], segments: [1] });
    const root = field.getElement();
    expect(root.querySelector('[data-path-point]')?.textContent).toContain('Stretch 2 of 4');
    expect(root.querySelector('[aria-label="Point X"]')).toBeNull();
    expect(root.querySelector<HTMLInputElement>('[aria-label="Arc Degrees"]')?.value).toBe('90');
    type(root, 'Arc Degrees', '180');
    expect(onCommit.mock.lastCall?.[0].segments[1]).toEqual({ kind: 'Arc', degrees: 180, axis: [0, 1, 0] });
    type(root, 'Stretch', 'Bezier');
    expect(onCommit.mock.lastCall?.[0].segments[1].kind).toBe('Bezier');
  });

  it('changes the stretch after a Smooth one from its first point, at every end of open and closed paths', () => {
    const onCommit = vi.fn();
    const field = new PathField({ label: 'Rail', onCommit });
    const root = field.getElement();
    const open: PathAsset = {
      ...SQUARE,
      segments: [{ kind: 'Smooth' }, { kind: 'Smooth' }, { kind: 'Straight' }],
      closed: false,
    };
    const stretch = () => root.querySelector<HTMLSelectElement>('[aria-label="Stretch"]');
    field.setText(pathAssetEncode(open));
    field.setSelected({ points: [2], segments: [] });
    expect(root.querySelector('[data-path-point]')?.textContent).toContain('Stretch 3 of 3');
    expect(stretch()?.value).toBe('Straight');
    type(root, 'Stretch', 'Bezier');
    expect(onCommit.mock.lastCall?.[0].segments.map((each: { kind: string }) => each.kind)).toEqual([
      'Smooth',
      'Smooth',
      'Bezier',
    ]);
    field.setSelected({ points: [0], segments: [] });
    expect(stretch()?.value).toBe('Smooth');
    field.setSelected({ points: [1], segments: [] });
    expect(stretch()?.value).toBe('Smooth');
    field.setSelected({ points: [3], segments: [] });
    expect(stretch()).toBeNull();
    field.setSelected({ points: [1, 2], segments: [] });
    expect(root.querySelector('[data-path-point]')?.textContent).toContain('2 Stretches');
    expect(stretch()?.value).toBe('');
    field.setText(
      pathAssetEncode({
        ...SQUARE,
        segments: [{ kind: 'Smooth' }, { kind: 'Smooth' }, { kind: 'Smooth' }, { kind: 'Straight' }],
      }),
    );
    field.setSelected({ points: [3], segments: [] });
    expect(root.querySelector('[data-path-point]')?.textContent).toContain('Stretch 4 of 4');
    type(root, 'Stretch', 'Arc');
    expect(onCommit.mock.lastCall?.[0].segments[3].kind).toBe('Arc');
    field.setSelected({ points: [0], segments: [2] });
    expect(root.querySelector('[data-path-point]')?.textContent).toContain('Stretch 3 of 4');
  });

  it('edits what several selected points or stretches share', () => {
    const onCommit = vi.fn();
    const field = new PathField({ label: 'Rail', onCommit });
    field.setText(pathAssetEncode(SQUARE));
    field.setSelected({ points: [0, 1], segments: [] });
    const root = field.getElement();
    expect(root.querySelector('[data-path-point]')?.textContent).toContain('2 Points');
    expect(root.querySelector<HTMLInputElement>('[aria-label="Point X"]')?.value).toBe('—');
    expect(root.querySelector<HTMLInputElement>('[aria-label="Point Y"]')?.value).toBe('0.00');
    type(root, 'Point Y', '2');
    expect(onCommit.mock.lastCall?.[0].points.slice(0, 2)).toEqual([
      [0, 2, 0],
      [1, 2, 0],
    ]);
    field.setSelected({ points: [0, 2], segments: [] });
    [...root.querySelectorAll('button')].find((each) => each.textContent === 'Delete Points')?.click();
    expect(onCommit.mock.lastCall?.[0].points).toEqual([SQUARE.points[1], SQUARE.points[3]]);
    field.setSelected({ points: [], segments: [0, 1] });
    expect(root.querySelector('[data-path-point]')?.textContent).toContain('2 Stretches');
    expect(root.querySelector<HTMLSelectElement>('[aria-label="Stretch"]')?.value).toBe('');
    expect(root.querySelector('[aria-label="Arc Degrees"]')).toBeNull();
    type(root, 'Stretch', 'Smooth');
    expect(onCommit.mock.lastCall?.[0].segments.slice(0, 2).map((each: { kind: string }) => each.kind)).toEqual([
      'Smooth',
      'Smooth',
    ]);
  });

  it('keeps one selection for the scene and the inspector, and tells who listens', () => {
    const heard = vi.fn();
    const stop = pathEditSelectionListen(heard);
    pathEditSelect({ stepId: 'm1', name: 'Rail', points: [2], segments: [] });
    expect(pathEditSelected()).toEqual({ stepId: 'm1', name: 'Rail', points: [2], segments: [] });
    stop();
    pathEditSelect(null);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(pathEditSelected()).toBeNull();
  });
});
