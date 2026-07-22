import { describe, it, expect, beforeEach } from 'vitest';
import { CameraAnimationConfig } from '../../src/navigation/camera_animation_config.js';

describe('CameraAnimationConfig', () => {
  let config: CameraAnimationConfig;

  beforeEach(() => {
    config = new CameraAnimationConfig();
  });

  it('should have default duration of 300ms', () => {
    expect(config.getDurationMs()).toBe(300);
  });

  it('should have default padding factor of 1.5', () => {
    expect(config.getPaddingFactor()).toBe(1.5);
  });

  it('should have animation enabled by default', () => {
    expect(config.isAnimationEnabled()).toBe(true);
  });

  it('should allow changing duration', () => {
    config.setDurationMs(500);
    expect(config.getDurationMs()).toBe(500);
  });

  it('should allow changing padding factor', () => {
    config.setPaddingFactor(2.0);
    expect(config.getPaddingFactor()).toBe(2.0);
  });

  it('should allow toggling animation enabled', () => {
    config.setAnimationEnabled(false);
    expect(config.isAnimationEnabled()).toBe(false);
    config.setAnimationEnabled(true);
    expect(config.isAnimationEnabled()).toBe(true);
  });

  it('should clamp negative duration to zero', () => {
    config.setDurationMs(-100);
    expect(config.getDurationMs()).toBe(0);
  });

  it('should clamp very small padding factor to minimum', () => {
    config.setPaddingFactor(0);
    expect(config.getPaddingFactor()).toBe(0.001);
  });
});
