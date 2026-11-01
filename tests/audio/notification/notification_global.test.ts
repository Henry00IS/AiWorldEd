import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationFrameEvents } from '@/audio/notification/notification_frame_events.js';
import { NotificationGlobal } from '@/audio/notification/notification_global.js';
import { audioSettings } from '@/audio/settings/audio_settings.js';
import { audioContextHost } from '@/audio/context/audio_context_host.js';

beforeEach(() => {
  audioSettings.setEnabled(true);
  notificationFrameEvents.reset();
});

afterEach(() => {
  audioSettings.setEnabled(true);
  notificationFrameEvents.reset();
});

describe('NotificationGlobal', () => {
  it('raises remote player sounds without unlocking audio, and none while disabled', () => {
    const unlock = vi.spyOn(audioContextHost, 'unlock');
    const ensure = vi.spyOn(audioContextHost, 'ensureContext');
    NotificationGlobal.onRemotePlayerSound('land', 1, 2, 3, 7);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.getRemotePlayerSoundsSnapshot()).toEqual([
      { kind: 'land', x: 1, y: 2, z: 3, strength: 7 },
    ]);
    audioSettings.setEnabled(false);
    NotificationGlobal.onRemotePlayerSound('step', 0, 0, 0, 3);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.getRemotePlayerSoundsSnapshot()).toEqual([]);
    expect(unlock).not.toHaveBeenCalled();
    expect(ensure).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('raises move and scale flags on separate channels', () => {
    NotificationGlobal.onSelectionMovedWithSnapping();
    NotificationGlobal.onSelectionScaledWithSnapping();
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()).toBe(true);
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(true);
  });

  it('maps resized-with-snapping onto the scale channel with travel distance', () => {
    NotificationGlobal.onSelectionResizedWithSnapping(4);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(true);
    expect(notificationFrameEvents.getSelectionResizeTravelSnapshot()).toBe(4);
    expect(notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()).toBe(false);
  });

  it('raises rotation snaps on their own channel', () => {
    NotificationGlobal.onSelectionRotatedWithSnapping(0.2);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionRotatedWithSnappingSnapshot()).toBe(true);
    expect(notificationFrameEvents.getSelectionRotatedSpeedSnapshot()).toBeGreaterThan(0);
  });

  it('does not raise flags while audio is disabled', () => {
    audioSettings.setEnabled(false);
    NotificationGlobal.onSelectionMovedWithSnapping();
    NotificationGlobal.onSelectionScaledWithSnapping();
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasAnySnapFeedbackSnapshot()).toBe(false);
  });
});
