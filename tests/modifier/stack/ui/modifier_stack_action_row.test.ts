import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ModifierStackActionTarget, ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackFieldsNormalize } from '@/modifier/stack/modifier_stack_fields.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';

/**
 * Builds an action field that resolves when the test lets it.
 *
 * @param calls Receives every target the action runs with.
 * @param gate Promise the action waits for.
 * @returns Action field.
 */
function actionRowTestField(calls: ModifierStackActionTarget[], gate: Promise<void>): ModifierStackField {
  return {
    key: 'run',
    label: 'Run It',
    type: 'action',
    default: '',
    action: async (target) => {
      calls.push(target);
      target.status('Working');
      await gate;
    },
  };
}

describe('modifier stack action rows', () => {
  it('store nothing in the parameters', () => {
    const field = actionRowTestField([], Promise.resolve());
    expect(modifierStackFieldsNormalize([field], { run: 'anything' })).toEqual({});
  });

  it('run the action with the target, show its status, stay disabled until it settles, then redraw the panel', async () => {
    const calls: ModifierStackActionTarget[] = [];
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const volume = new THREE.Object3D();
    let refreshed = 0;
    const rows = new ModifierStackFieldRows(
      [actionRowTestField(calls, gate)],
      () => undefined,
      undefined,
      undefined,
      (status) => ({ volume, stepId: 'step-1', commandStack: null, status, refresh: () => refreshed++ }),
    );
    const button = rows.getElement().querySelector('button');
    button?.click();
    expect(calls[0]?.volume).toBe(volume);
    expect(calls[0]?.stepId).toBe('step-1');
    expect(button?.disabled).toBe(true);
    expect(rows.getElement().textContent).toContain('Working');
    expect(refreshed).toBe(0);
    release();
    await gate;
    await Promise.resolve();
    expect(button?.disabled).toBe(false);
    expect(refreshed).toBe(1);
  });

  it('keep the button disabled while the field says the action is unavailable', () => {
    const calls: ModifierStackActionTarget[] = [];
    const field = {
      ...actionRowTestField(calls, Promise.resolve()),
      actionDisabled: (p: Record<string, unknown>) => p['locked'] === true,
    };
    const rows = new ModifierStackFieldRows(
      [field],
      () => undefined,
      undefined,
      undefined,
      (status) => ({
        volume: new THREE.Object3D(),
        stepId: 'step-1',
        commandStack: null,
        status,
      }),
    );
    const button = rows.getElement().querySelector('button');
    rows.update({ locked: true });
    expect(button?.disabled).toBe(true);
    button?.click();
    expect(calls.length).toBe(0);
    rows.update({ locked: false });
    expect(button?.disabled).toBe(false);
  });
});
