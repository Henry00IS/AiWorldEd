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

  it('shows only the selected point: its position and the settings of the stretch leaving it', () => {
    const onCommit = vi.fn();
    const field = new PathField({ label: 'Rail', onCommit });
    field.setText(pathAssetEncode(SQUARE));
    field.setSelected(1);
    const root = field.getElement();
    expect(root.querySelector('[data-path-point]')?.textContent).toContain('Point 2 of 4');
    expect(root.querySelectorAll('[aria-label^="Point "]')).toHaveLength(3);
    expect(root.querySelector<HTMLInputElement>('[aria-label="Arc Degrees"]')?.value).toBe('90');
    type(root, 'Point X', '3');
    expect(onCommit).toHaveBeenLastCalledWith({
      ...SQUARE,
      points: [SQUARE.points[0], [3, 0, 0], ...SQUARE.points.slice(2)],
    });
    type(root, 'Arc Degrees', '180');
    expect(onCommit.mock.lastCall?.[0].segments[1]).toEqual({ kind: 'Arc', degrees: 180, axis: [0, 1, 0] });
    type(root, 'Stretch', 'Bezier');
    expect(onCommit.mock.lastCall?.[0].segments[1].kind).toBe('Bezier');
    field.setSelected(0);
    expect(root.querySelector('[aria-label="Arc Degrees"]')).toBeNull();
  });

  it('keeps one selected point for the scene and the inspector, and tells who listens', () => {
    const heard = vi.fn();
    const stop = pathEditSelectionListen(heard);
    pathEditSelect({ stepId: 'm1', name: 'Rail', point: 2 });
    expect(pathEditSelected()).toEqual({ stepId: 'm1', name: 'Rail', point: 2 });
    stop();
    pathEditSelect(null);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(pathEditSelected()).toBeNull();
  });
});
