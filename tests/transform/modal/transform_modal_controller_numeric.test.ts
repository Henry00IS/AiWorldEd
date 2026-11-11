import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GizmoAxis, TransformMode } from '@/types/transform_mode.js';
import { TransformModalController } from '@/transform/modal/transform_modal_controller.js';
import type { TransformModalApplyHost } from '@/transform/modal/transform_modal_apply_host.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';

/**
 * Builds a host mock for controller numeric tests.
 *
 * @param overrides Host method overrides.
 * @returns Apply host double.
 */
function createHost(overrides: Partial<TransformModalApplyHost> = {}): TransformModalApplyHost {
  return {
    isDragging: () => true,
    getMode: () => TransformMode.TRANSLATE,
    getActiveAxis: () => GizmoAxis.VIEW,
    isSingleUseDrag: () => true,
    getOrientation: () => new THREE.Quaternion(),
    getDragObjects: () => [],
    getDragPivot: () => new THREE.Vector3(),
    reapplyMouseDrivenTransform: vi.fn(),
    applyNumericValue: vi.fn(() => true),
    commitDrag: vi.fn(),
    cancelDrag: vi.fn(),
    setConstraintLineAxis: vi.fn(),
    setStatusText: vi.fn(),
    ...overrides,
  };
}

/**
 * Creates a keyboard event for modal routing.
 *
 * @param code Physical key code.
 * @param key Event key string.
 * @returns KeyboardEvent.
 */
function keyEvent(code: string, key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { code, key });
}

describe('TransformModalController numeric typing', () => {
  it('applies typed translate distance after X constraint (G X 0.25)', () => {
    const applyNumericValue = vi.fn(() => true);
    const host = createHost({ applyNumericValue });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    expect(controller.handleKeyDown(keyEvent('KeyX', 'x'))).toBe(true);
    expect(controller.handleKeyDown(keyEvent('Digit0', '0'))).toBe(true);
    expect(controller.handleKeyDown(keyEvent('Period', '.'))).toBe(true);
    expect(controller.handleKeyDown(keyEvent('Digit2', '2'))).toBe(true);
    expect(controller.handleKeyDown(keyEvent('Digit5', '5'))).toBe(true);
    expect(applyNumericValue).toHaveBeenLastCalledWith(0.25, TransformModalAxis.X);
    expect(controller.handleKeyDown(keyEvent('Enter', 'Enter'))).toBe(true);
    expect(host.commitDrag).toHaveBeenCalled();
    expect(controller.isActive()).toBe(false);
  });

  it('ignores digits without a keyboard axis lock during single-use', () => {
    const applyNumericValue = vi.fn(() => true);
    const host = createHost({ applyNumericValue });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    expect(controller.handleKeyDown(keyEvent('Digit1', '1'))).toBe(false);
    expect(controller.hasTypedValue()).toBe(false);
    expect(applyNumericValue).not.toHaveBeenCalled();
  });

  it('ignores digits on permanent (non single-use) drags even with free VIEW handle', () => {
    const applyNumericValue = vi.fn(() => true);
    const host = createHost({
      isSingleUseDrag: () => false,
      getActiveAxis: () => GizmoAxis.VIEW,
      applyNumericValue,
    });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    expect(controller.handleKeyDown(keyEvent('KeyX', 'x'))).toBe(true);
    expect(controller.getAxis()).toBe(TransformModalAxis.X);
    expect(controller.handleKeyDown(keyEvent('Digit2', '2'))).toBe(false);
    expect(controller.hasTypedValue()).toBe(false);
    expect(applyNumericValue).not.toHaveBeenCalled();
  });

  it('applies typed free scale on all axes without an axis constraint (S 2 Enter)', () => {
    const applyNumericValue = vi.fn(() => true);
    const host = createHost({
      getMode: () => TransformMode.SCALE,
      applyNumericValue,
    });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    expect(controller.handleKeyDown(keyEvent('Digit2', '2'))).toBe(true);
    expect(controller.hasTypedValue()).toBe(true);
    expect(applyNumericValue).toHaveBeenLastCalledWith(2, TransformModalAxis.None);
    expect(controller.handleKeyDown(keyEvent('Enter', 'Enter'))).toBe(true);
    expect(host.commitDrag).toHaveBeenCalled();
    expect(controller.isActive()).toBe(false);
  });

  it('applies typed free scale decimals without an axis constraint (S 0.5 Enter)', () => {
    const applyNumericValue = vi.fn(() => true);
    const host = createHost({
      getMode: () => TransformMode.SCALE,
      applyNumericValue,
    });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    expect(controller.handleKeyDown(keyEvent('Digit0', '0'))).toBe(true);
    expect(controller.handleKeyDown(keyEvent('Period', '.'))).toBe(true);
    expect(controller.handleKeyDown(keyEvent('Digit5', '5'))).toBe(true);
    expect(applyNumericValue).toHaveBeenLastCalledWith(0.5, TransformModalAxis.None);
    expect(controller.handleKeyDown(keyEvent('Enter', 'Enter'))).toBe(true);
    expect(host.commitDrag).toHaveBeenCalled();
  });

  it('still applies axis-locked scale after a Y constraint (S Y 2)', () => {
    const applyNumericValue = vi.fn(() => true);
    const host = createHost({
      getMode: () => TransformMode.SCALE,
      applyNumericValue,
    });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    expect(controller.handleKeyDown(keyEvent('KeyY', 'y'))).toBe(true);
    expect(controller.handleKeyDown(keyEvent('Digit2', '2'))).toBe(true);
    expect(applyNumericValue).toHaveBeenLastCalledWith(2, TransformModalAxis.Y);
  });

  it('requires single-use plus axis lock for rotate numeric entry', () => {
    const applyNumericValue = vi.fn(() => true);
    const host = createHost({
      getMode: () => TransformMode.ROTATE,
      applyNumericValue,
    });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    expect(controller.handleKeyDown(keyEvent('Digit2', '2'))).toBe(false);
    expect(controller.handleKeyDown(keyEvent('KeyY', 'y'))).toBe(true);
    expect(controller.handleKeyDown(keyEvent('Digit2', '2'))).toBe(true);
    expect(applyNumericValue).toHaveBeenLastCalledWith(2, TransformModalAxis.Y);
  });

  it('clears typed digits when the axis lock is toggled off for translate', () => {
    const reapplyMouseDrivenTransform = vi.fn();
    const host = createHost({ reapplyMouseDrivenTransform });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    controller.handleKeyDown(keyEvent('KeyX', 'x'));
    controller.handleKeyDown(keyEvent('Digit5', '5'));
    expect(controller.hasTypedValue()).toBe(true);
    controller.handleKeyDown(keyEvent('KeyX', 'x'));
    expect(controller.getAxis()).toBe(TransformModalAxis.None);
    expect(controller.hasTypedValue()).toBe(false);
    expect(reapplyMouseDrivenTransform).toHaveBeenCalled();
  });

  it('keeps typed free scale digits when an axis lock is toggled off', () => {
    const applyNumericValue = vi.fn(() => true);
    const host = createHost({
      getMode: () => TransformMode.SCALE,
      applyNumericValue,
    });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    controller.handleKeyDown(keyEvent('Digit3', '3'));
    expect(controller.hasTypedValue()).toBe(true);
    controller.handleKeyDown(keyEvent('KeyX', 'x'));
    expect(applyNumericValue).toHaveBeenLastCalledWith(3, TransformModalAxis.X);
    controller.handleKeyDown(keyEvent('KeyX', 'x'));
    expect(controller.getAxis()).toBe(TransformModalAxis.None);
    expect(controller.hasTypedValue()).toBe(true);
    expect(applyNumericValue).toHaveBeenLastCalledWith(3, TransformModalAxis.None);
  });

  it('clears typed input on Escape without cancelling the drag first', () => {
    const reapplyMouseDrivenTransform = vi.fn();
    const cancelDrag = vi.fn();
    const host = createHost({ reapplyMouseDrivenTransform, cancelDrag });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    controller.handleKeyDown(keyEvent('KeyX', 'x'));
    controller.handleKeyDown(keyEvent('Digit1', '1'));
    expect(controller.hasTypedValue()).toBe(true);
    expect(controller.handleKeyDown(keyEvent('Escape', 'Escape'))).toBe(true);
    expect(controller.hasTypedValue()).toBe(false);
    expect(reapplyMouseDrivenTransform).toHaveBeenCalled();
    expect(cancelDrag).not.toHaveBeenCalled();
  });

  it('blocks pointer-driven moves while typed text is present via hasTypedValue', () => {
    const host = createHost();
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    expect(controller.hasTypedValue()).toBe(false);
    controller.handleKeyDown(keyEvent('KeyX', 'x'));
    controller.handleKeyDown(keyEvent('Digit3', '3'));
    expect(controller.hasTypedValue()).toBe(true);
  });

  it('toggles minus before digits (G X - 0.25)', () => {
    const applyNumericValue = vi.fn(() => true);
    const host = createHost({ applyNumericValue });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    controller.handleKeyDown(keyEvent('KeyX', 'x'));
    controller.handleKeyDown(keyEvent('Minus', '-'));
    expect(controller.hasTypedValue()).toBe(true);
    controller.handleKeyDown(keyEvent('Digit0', '0'));
    controller.handleKeyDown(keyEvent('Period', '.'));
    controller.handleKeyDown(keyEvent('Digit2', '2'));
    controller.handleKeyDown(keyEvent('Digit5', '5'));
    expect(applyNumericValue).toHaveBeenLastCalledWith(-0.25, TransformModalAxis.X);
  });

  it('toggles minus after a complete typed value at any time', () => {
    const applyNumericValue = vi.fn(() => true);
    const host = createHost({ applyNumericValue });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    controller.handleKeyDown(keyEvent('KeyY', 'y'));
    controller.handleKeyDown(keyEvent('Digit3', '3'));
    expect(applyNumericValue).toHaveBeenLastCalledWith(3, TransformModalAxis.Y);
    controller.handleKeyDown(keyEvent('Minus', '-'));
    expect(applyNumericValue).toHaveBeenLastCalledWith(-3, TransformModalAxis.Y);
    controller.handleKeyDown(keyEvent('NumpadSubtract', '-'));
    expect(applyNumericValue).toHaveBeenLastCalledWith(3, TransformModalAxis.Y);
  });

  it('toggles minus after a decimal mid-entry with axis lock', () => {
    const applyNumericValue = vi.fn(() => true);
    const host = createHost({
      getMode: () => TransformMode.ROTATE,
      applyNumericValue,
    });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    controller.handleKeyDown(keyEvent('KeyZ', 'z'));
    controller.handleKeyDown(keyEvent('Digit4', '4'));
    controller.handleKeyDown(keyEvent('Period', '.'));
    controller.handleKeyDown(keyEvent('Digit5', '5'));
    expect(applyNumericValue).toHaveBeenLastCalledWith(4.5, TransformModalAxis.Z);
    controller.handleKeyDown(keyEvent('Minus', '-'));
    expect(applyNumericValue).toHaveBeenLastCalledWith(-4.5, TransformModalAxis.Z);
  });

  it('accepts physical Minus even when Shift makes key underscore', () => {
    const applyNumericValue = vi.fn(() => true);
    const host = createHost({ applyNumericValue });
    const controller = new TransformModalController();
    controller.setHost(host);
    controller.beginDrag();
    controller.handleKeyDown(keyEvent('KeyZ', 'z'));
    controller.handleKeyDown(keyEvent('Digit1', '1'));
    const shiftMinus = new KeyboardEvent('keydown', { code: 'Minus', key: '_', shiftKey: true });
    expect(controller.handleKeyDown(shiftMinus)).toBe(true);
    expect(applyNumericValue).toHaveBeenLastCalledWith(-1, TransformModalAxis.Z);
  });
});
