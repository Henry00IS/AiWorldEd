import { afterEach, describe, expect, it } from 'vitest';
import { curveFileWrite } from '@/curve/model/curve_file.js';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { curveEquals } from '@/curve/model/curve_model.js';
import { curveDropAccepts, curveDropRead } from '@/curve/ui/curve_drop.js';
import { curveProjectAccessSet } from '@/curve/ui/curve_project_access.js';
import { PANEL_PROJECT_PATH_DRAG_TYPE } from '@/project/ui/panel_project_drag.js';

/**
 * Builds drag data like the browser hands to drop handlers.
 *
 * @param data Typed strings.
 * @param files Dropped files.
 * @returns Drag data.
 */
function transfer(data: Record<string, string>, files: File[] = []): DataTransfer {
  const types = [...Object.keys(data), ...(files.length > 0 ? ['Files'] : [])];
  return { types, files, getData: (type: string) => data[type] ?? '' } as unknown as DataTransfer;
}

const preset = CURVE_PRESETS_ARCHITECTURE[5] ?? CURVE_PRESETS_ARCHITECTURE[0];
const curve = preset ? curvePresetBuild(preset) : null;

describe('curve drops', () => {
  afterEach(() => curveProjectAccessSet(null));

  it('reads a curve file dragged from the project browser', async () => {
    if (!curve) throw new Error('Expected a preset');
    const files = new Map([['curves/a.curve', curveFileWrite(curve, 'a')]]);
    curveProjectAccessSet({
      writable: () => false,
      read: async (path) => files.get(path) ?? '',
      write: async () => {},
    });
    const drag = transfer({ [PANEL_PROJECT_PATH_DRAG_TYPE]: 'curves/a.curve' });
    expect(curveDropAccepts(drag)).toBe(true);
    const result = await curveDropRead(drag);
    if (!result || 'error' in result) throw new Error('Expected a curve');
    expect(curveEquals(result.curve, curve)).toBe(true);
  });

  it('reads a curve file dropped from the desktop and refuses other files', async () => {
    if (!curve) throw new Error('Expected a preset');
    const good = new File([curveFileWrite(curve, 'b')], 'b.curve');
    const result = await curveDropRead(transfer({}, [good]));
    expect(result && 'curve' in result).toBe(true);
    const other = await curveDropRead(transfer({}, [new File(['x'], 'stone.png')]));
    expect(other).toHaveProperty('error');
    expect(await curveDropRead(transfer({ [PANEL_PROJECT_PATH_DRAG_TYPE]: 'maps/a.json' }))).toHaveProperty('error');
    expect(curveDropAccepts(transfer({ 'text/plain': 'x' }))).toBe(false);
  });
});
