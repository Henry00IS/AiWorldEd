import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { pathInputRow } from '@/path/ui/path_input_row.js';
import { pathAssetEncode, type PathAsset } from '@/path/model/path_asset.js';
import { pathEditSelect } from '@/path/edit/path_edit_selection.js';

const RUN: PathAsset = {
  points: [
    [0, 0, 0],
    [1, 0, 0],
    [2, 1, 0],
  ],
  segments: [{ kind: 'Straight' }, { kind: 'Smooth' }],
  closed: false,
};

/**
 * Builds the row of a Path input named Run of step s1.
 *
 * @returns Row.
 */
function runRow(): { element: HTMLElement; write: (text: string) => void } {
  const place = { volume: new THREE.Object3D(), stepId: 's1' };
  return pathInputRow({ name: 'Run', label: 'Run', hint: '', commit: () => undefined, placeOf: () => place });
}

/**
 * Returns the Stretch choice shown, or null.
 *
 * @param root Row element.
 * @returns Select, or null.
 */
function stretch(root: HTMLElement): HTMLSelectElement | null {
  return root.querySelector<HTMLSelectElement>('[aria-label="Stretch"]');
}

afterEach(() => {
  pathEditSelect(null);
  document.body.replaceChildren();
});

describe('pathInputRow', () => {
  it('follows the scene selection again after the inspector showed something else', () => {
    const row = runRow();
    row.write(pathAssetEncode(RUN));
    document.body.append(row.element);
    pathEditSelect({ stepId: 's1', name: 'Run', points: [], segments: [0] });
    expect(stretch(row.element)?.value).toBe('Straight');
    row.element.remove();
    pathEditSelect(null);
    document.body.append(row.element);
    row.write(pathAssetEncode(RUN));
    pathEditSelect({ stepId: 's1', name: 'Run', points: [], segments: [1] });
    expect(stretch(row.element)?.value).toBe('Smooth');
    pathEditSelect({ stepId: 's1', name: 'Run', points: [], segments: [0, 1] });
    expect(stretch(row.element)?.value).toBe('');
    expect(row.element.querySelector('[data-path-point]')?.textContent).toContain('2 Stretches');
  });

  it('shows the Stretch of selected stretches when points are selected too', () => {
    const row = runRow();
    row.write(pathAssetEncode(RUN));
    document.body.append(row.element);
    pathEditSelect({ stepId: 's1', name: 'Run', points: [0], segments: [1] });
    expect(row.element.querySelector('[aria-label="Point X"]')).not.toBeNull();
    expect(stretch(row.element)?.value).toBe('Smooth');
  });
});
