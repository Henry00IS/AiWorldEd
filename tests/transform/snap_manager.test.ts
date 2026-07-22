import { describe, it, expect, beforeEach } from 'vitest';
import { SnapManager } from '../../src/transform/snap_manager.js';
import { SNAP_PRESETS } from '../../src/types/snap_presets.js';

describe('SnapManager default interval', () => {
  it('should initialize with the provided default interval', () => {
    const manager = new SnapManager(2.0);
    expect(manager.getInterval()).toBe(2.0);
  });

  it('should default to 1.0 when created with that value', () => {
    const manager = new SnapManager(1.0);
    expect(manager.getInterval()).toBe(1.0);
  });
});

describe('SnapManager cycle forward', () => {
  let manager: SnapManager;

  beforeEach(() => {
    manager = new SnapManager(1.0);
  });

  it('should advance to the next preset on cycleForward', () => {
    manager.cycleForward();
    expect(manager.getInterval()).toBe(2.0);
  });

  it('should wrap from last preset to first on cycleForward', () => {
    manager.setInterval(64.0);
    manager.cycleForward();
    expect(manager.getInterval()).toBe(0.03125);
  });

  it('should fire callback on forward cycle', () => {
    let called = false;
    let captured: number | undefined;
    manager.onIntervalChanged((value) => {
      called = true;
      captured = value;
    });
    manager.cycleForward();
    expect(called).toBe(true);
    expect(captured).toBe(2.0);
  });
});

describe('SnapManager cycle backward', () => {
  let manager: SnapManager;

  beforeEach(() => {
    manager = new SnapManager(1.0);
  });

  it('should go to the previous preset on cycleBackward', () => {
    manager.cycleBackward();
    expect(manager.getInterval()).toBe(0.5);
  });

  it('should wrap from first preset to last on cycleBackward', () => {
    manager.setInterval(0.03125);
    manager.cycleBackward();
    expect(manager.getInterval()).toBe(64.0);
  });

  it('should fire callback on backward cycle', () => {
    let called = false;
    let captured: number | undefined;
    manager.onIntervalChanged((value) => {
      called = true;
      captured = value;
    });
    manager.cycleBackward();
    expect(called).toBe(true);
    expect(captured).toBe(0.5);
  });
});

describe('SnapManager setInterval validation', () => {
  it('should reject zero value', () => {
    const manager = new SnapManager(1.0);
    manager.setInterval(0);
    expect(manager.getInterval()).toBe(1.0);
  });

  it('should reject negative value', () => {
    const manager = new SnapManager(1.0);
    manager.setInterval(-5);
    expect(manager.getInterval()).toBe(1.0);
  });

  it('should accept positive non-preset value', () => {
    const manager = new SnapManager(1.0);
    manager.setInterval(7.5);
    expect(manager.getInterval()).toBe(7.5);
  });
});

describe('SnapManager callback', () => {
  it('should fire multiple callbacks on interval change', () => {
    const manager = new SnapManager(1.0);
    const results: number[] = [];
    manager.onIntervalChanged((v) => results.push(v));
    manager.onIntervalChanged((v) => results.push(v * 2));
    manager.setInterval(5.0);
    expect(results).toEqual([5.0, 10.0]);
  });

  it('should not fire callback when interval does not change', () => {
    const manager = new SnapManager(1.0);
    let callCount = 0;
    manager.onIntervalChanged(() => {
      callCount++;
    });
    manager.setInterval(1.0);
    expect(callCount).toBe(0);
  });
});

describe('SnapManager getPresetIndex', () => {
  it('should return correct index for a preset value', () => {
    const manager = new SnapManager(4.0);
    expect(manager.getPresetIndex()).toBe(SNAP_PRESETS.indexOf(4.0));
  });

  it('should return -1 for a non-preset value', () => {
    const manager = new SnapManager(1.0);
    manager.setInterval(7.5);
    expect(manager.getPresetIndex()).toBe(-1);
  });

  it('should return 0 for the first preset', () => {
    const manager = new SnapManager(0.03125);
    expect(manager.getPresetIndex()).toBe(0);
  });
});
