import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { notificationFrameEvents } from '@/audio/notification/notification_frame_events.js';
import { audioContextHost } from '@/audio/context/audio_context_host.js';
import { AudioFeedbackRateLimiter } from '@/audio/playback/audio_feedback_rate_limiter.js';
import {
  ControllerAudioPlayback,
  mapFootstepSpeedToPlaybackRate,
  mapResizeTravelToPlaybackRate,
  mapSnapMoveSpeedToPlaybackRate,
  mapSnapRotateSpeedToPlaybackRate,
} from '@/audio/playback/controller_audio_playback.js';
import { AudioSettings } from '@/audio/settings/audio_settings.js';
import { audioViewportFocus } from '@/audio/spatial/audio_viewport_focus.js';
import * as THREE from 'three';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import type { AudioSoundPageTurn } from '@/audio/playback/audio_sound_page_turn.js';
import type { AudioSoundSoftClick } from '@/audio/playback/audio_sound_soft_click.js';
import type { AudioSoundSoftFootstep } from '@/audio/playback/audio_sound_soft_footstep.js';
import type { AudioSoundSoftWhoosh } from '@/audio/playback/audio_sound_soft_whoosh.js';

beforeEach(() => {
  vi.spyOn(audioContextHost, 'ensureContext').mockReturnValue(createRunningContextMock());
});

afterEach(() => {
  notificationFrameEvents.reset();
  vi.restoreAllMocks();
});

describe('ControllerAudioPlayback', () => {
  it('does not play when audio is disabled and clears frame flags', () => {
    const softClick = createSoftClickMock();
    const softWhoosh = createSoftWhooshMock();
    const pageTurn = createPageTurnMock();
    const settings = new AudioSettings(new MemorySettingsStorage());
    settings.setEnabled(false);
    notificationFrameEvents.raiseSelectionMovedWithSnapping();
    notificationFrameEvents.beginFrame();
    const controller = createController(settings, softClick, softWhoosh.player, pageTurn);
    controller.endFrame();
    expect(softClick.play).not.toHaveBeenCalled();
    expect(softWhoosh.play).not.toHaveBeenCalled();
    expect(pageTurn.play).not.toHaveBeenCalled();
    expect(notificationFrameEvents.hasAnySnapFeedbackSnapshot()).toBe(false);
  });

  it('plays whoosh for move snaps and click for scale snaps', () => {
    const softClick = createSoftClickMock();
    const softWhoosh = createSoftWhooshMock();
    const pageTurn = createPageTurnMock();
    const settings = new AudioSettings(new MemorySettingsStorage());
    notificationFrameEvents.raiseSelectionMovedWithSnapping();
    notificationFrameEvents.raiseSelectionScaledWithSnapping();
    notificationFrameEvents.beginFrame();
    const controller = createController(settings, softClick, softWhoosh.player, pageTurn);
    controller.endFrame();
    expect(softWhoosh.play).toHaveBeenCalledTimes(1);
    expect(softClick.play).toHaveBeenCalledTimes(1);
  });

  it('rate-limits rapid move whooshes across frames', () => {
    let now = 0;
    const rateLimiter = new AudioFeedbackRateLimiter(12, 12, () => now);
    const softClick = createSoftClickMock();
    const softWhoosh = createSoftWhooshMock();
    const pageTurn = createPageTurnMock();
    const settings = new AudioSettings(new MemorySettingsStorage());
    const controller = createController(settings, softClick, softWhoosh.player, pageTurn, rateLimiter);

    notificationFrameEvents.raiseSelectionMovedWithSnapping();
    notificationFrameEvents.beginFrame();
    controller.endFrame();
    expect(softWhoosh.play).toHaveBeenCalledTimes(1);

    now = 5;
    notificationFrameEvents.raiseSelectionMovedWithSnapping();
    notificationFrameEvents.beginFrame();
    controller.endFrame();
    expect(softWhoosh.play).toHaveBeenCalledTimes(1);

    now = 20;
    notificationFrameEvents.raiseSelectionMovedWithSnapping();
    notificationFrameEvents.beginFrame();
    controller.endFrame();
    expect(softWhoosh.play).toHaveBeenCalledTimes(2);
  });

  it('plays page turn for solid CSG operation flips', () => {
    const softClick = createSoftClickMock();
    const softWhoosh = createSoftWhooshMock();
    const pageTurn = createPageTurnMock();
    const settings = new AudioSettings(new MemorySettingsStorage());
    notificationFrameEvents.raiseSolidCsgOperationFlipped();
    notificationFrameEvents.beginFrame();
    const controller = createController(settings, softClick, softWhoosh.player, pageTurn);
    controller.endFrame();
    expect(pageTurn.play).toHaveBeenCalledTimes(1);
  });

  it('plays footstep samples with speed-based pitch', () => {
    const softClick = createSoftClickMock();
    const softWhoosh = createSoftWhooshMock();
    const pageTurn = createPageTurnMock();
    const softFootstep = createSoftFootstepMock();
    const settings = new AudioSettings(new MemorySettingsStorage());
    notificationFrameEvents.raisePlayerFootstep(2, 0, 4, 8);
    notificationFrameEvents.beginFrame();
    const controller = createController(
      settings,
      softClick,
      softWhoosh.player,
      pageTurn,
      new AudioFeedbackRateLimiter(0, 0, () => 0, 0),
      softFootstep,
    );
    controller.endFrame();
    expect(softFootstep.play).toHaveBeenCalledTimes(1);
    const rate = softFootstep.play.mock.calls[0]?.[0] as number;
    expect(rate).toBeCloseTo(mapFootstepSpeedToPlaybackRate(8), 5);
  });

  it('plays the nearest remote player sound quieter with distance', () => {
    vi.spyOn(audioContextHost, 'isRunning').mockReturnValue(true);
    vi.spyOn(audioViewportFocus, 'getCamera').mockReturnValue(new THREE.PerspectiveCamera());
    const softFootstep = createSoftFootstepMock();
    const controller = createRemoteController(softFootstep);
    notificationFrameEvents.raiseRemotePlayerSound({ kind: 'step', x: 30, y: 0, z: 0, strength: 3 });
    notificationFrameEvents.raiseRemotePlayerSound({ kind: 'step', x: 2, y: 0, z: 0, strength: 3 });
    notificationFrameEvents.beginFrame();
    controller.endFrame();
    expect(softFootstep.play).toHaveBeenCalledTimes(1);
    const near = softFootstep.play.mock.calls[0]?.[1] as number;
    notificationFrameEvents.raiseRemotePlayerSound({ kind: 'step', x: 30, y: 0, z: 0, strength: 3 });
    notificationFrameEvents.beginFrame();
    controller.endFrame();
    expect(softFootstep.play).toHaveBeenCalledTimes(2);
    expect(softFootstep.play.mock.calls[1]?.[1] as number).toBeLessThan(near);
  });

  it('never creates or resumes audio for remote sounds alone', () => {
    const ensure = vi.spyOn(audioContextHost, 'ensureContext');
    vi.spyOn(audioContextHost, 'isRunning').mockReturnValue(false);
    vi.spyOn(audioViewportFocus, 'getCamera').mockReturnValue(new THREE.PerspectiveCamera());
    const softFootstep = createSoftFootstepMock();
    const controller = createRemoteController(softFootstep);
    notificationFrameEvents.raiseRemotePlayerSound({ kind: 'jump', x: 1, y: 0, z: 0, strength: 1 });
    notificationFrameEvents.beginFrame();
    controller.endFrame();
    expect(ensure).not.toHaveBeenCalled();
    expect(softFootstep.play).not.toHaveBeenCalled();
  });

  it('leaves the shared panner to the own footstep in the same frame', () => {
    vi.spyOn(audioContextHost, 'isRunning').mockReturnValue(true);
    vi.spyOn(audioViewportFocus, 'getCamera').mockReturnValue(new THREE.PerspectiveCamera());
    const softFootstep = createSoftFootstepMock();
    const controller = createRemoteController(softFootstep);
    notificationFrameEvents.raisePlayerFootstep(0, 0, 0, 3);
    notificationFrameEvents.raiseRemotePlayerSound({ kind: 'step', x: 1, y: 0, z: 0, strength: 3 });
    notificationFrameEvents.beginFrame();
    controller.endFrame();
    expect(softFootstep.play).toHaveBeenCalledTimes(1);
    expect(softFootstep.play.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('does not play when no snapshot flags are set', () => {
    const softClick = createSoftClickMock();
    const softWhoosh = createSoftWhooshMock();
    const pageTurn = createPageTurnMock();
    const settings = new AudioSettings(new MemorySettingsStorage());
    notificationFrameEvents.beginFrame();
    const controller = createController(settings, softClick, softWhoosh.player, pageTurn);
    controller.endFrame();
    expect(softClick.play).not.toHaveBeenCalled();
    expect(softWhoosh.play).not.toHaveBeenCalled();
    expect(pageTurn.play).not.toHaveBeenCalled();
  });

  it('maps higher move speed to a higher whoosh playback rate', () => {
    expect(mapSnapMoveSpeedToPlaybackRate(0)).toBeCloseTo(0.88, 5);
    expect(mapSnapMoveSpeedToPlaybackRate(28)).toBeCloseTo(1.38, 5);
    expect(mapSnapMoveSpeedToPlaybackRate(14)).toBeCloseTo(1.13, 5);
    expect(mapSnapMoveSpeedToPlaybackRate(100)).toBeCloseTo(1.38, 5);
  });

  it('passes a non-default playback rate into the whoosh player on move snaps', () => {
    const softClick = createSoftClickMock();
    const softWhoosh = createSoftWhooshMock();
    const pageTurn = createPageTurnMock();
    const settings = new AudioSettings(new MemorySettingsStorage());
    notificationFrameEvents.raiseSelectionMovedWithSnapping(2);
    notificationFrameEvents.raiseSelectionMovedWithSnapping(2);
    notificationFrameEvents.beginFrame();
    const controller = createController(settings, softClick, softWhoosh.player, pageTurn);
    controller.endFrame();
    expect(softWhoosh.play).toHaveBeenCalledTimes(1);
    const rate = softWhoosh.play.mock.calls[0]?.[0] as number;
    expect(rate).toBeGreaterThan(0.88);
    expect(rate).toBeLessThanOrEqual(1.38);
  });

  it('maps resize travel to click pitch rising from default', () => {
    expect(mapResizeTravelToPlaybackRate(0)).toBeCloseTo(1, 5);
    expect(mapResizeTravelToPlaybackRate(3.5)).toBeCloseTo(1.225, 5);
    expect(mapResizeTravelToPlaybackRate(7)).toBeCloseTo(1.45, 5);
    expect(mapResizeTravelToPlaybackRate(100)).toBeCloseTo(1.45, 5);
  });

  it('maps rotate snap rate so moderate spins stay below the pitch ceiling', () => {
    expect(mapSnapRotateSpeedToPlaybackRate(0)).toBeCloseTo(0.95, 5);
    expect(mapSnapRotateSpeedToPlaybackRate(11)).toBeCloseTo(0.95 + 0.1, 5);
    expect(mapSnapRotateSpeedToPlaybackRate(22)).toBeCloseTo(1.15, 5);
    expect(mapSnapRotateSpeedToPlaybackRate(100)).toBeCloseTo(1.15, 5);
  });

  it('plays whoosh for rotation snaps with a speed-based rate', () => {
    const softClick = createSoftClickMock();
    const softWhoosh = createSoftWhooshMock();
    const pageTurn = createPageTurnMock();
    const settings = new AudioSettings(new MemorySettingsStorage());
    notificationFrameEvents.raiseSelectionRotatedWithSnapping(0.25);
    notificationFrameEvents.raiseSelectionRotatedWithSnapping(0.25);
    notificationFrameEvents.beginFrame();
    const controller = createController(settings, softClick, softWhoosh.player, pageTurn);
    controller.endFrame();
    expect(softWhoosh.play).toHaveBeenCalledTimes(1);
    const rate = softWhoosh.play.mock.calls[0]?.[0] as number;
    expect(rate).toBeGreaterThanOrEqual(0.95);
    expect(rate).toBeLessThanOrEqual(1.15);
  });

  it('pitches resize clicks from travel distance', () => {
    const softClick = createSoftClickMock();
    const softWhoosh = createSoftWhooshMock();
    const pageTurn = createPageTurnMock();
    const settings = new AudioSettings(new MemorySettingsStorage());
    notificationFrameEvents.raiseSelectionResizedWithSnapping(7);
    notificationFrameEvents.beginFrame();
    const controller = createController(settings, softClick, softWhoosh.player, pageTurn);
    controller.endFrame();
    expect(softClick.play).toHaveBeenCalledWith(1.45);
  });

  it('pitches scale clicks from travel distance the same way as resize', () => {
    const softClick = createSoftClickMock();
    const softWhoosh = createSoftWhooshMock();
    const pageTurn = createPageTurnMock();
    const settings = new AudioSettings(new MemorySettingsStorage());
    notificationFrameEvents.raiseSelectionScaledWithSnapping(7);
    notificationFrameEvents.beginFrame();
    const controller = createController(settings, softClick, softWhoosh.player, pageTurn);
    controller.endFrame();
    expect(softClick.play).toHaveBeenCalledWith(1.45);
  });

  it('drops snap backlog when the audio context is not running', () => {
    const softClick = createSoftClickMock();
    const softWhoosh = createSoftWhooshMock();
    const pageTurn = createPageTurnMock();
    const settings = new AudioSettings(new MemorySettingsStorage());
    notificationFrameEvents.raiseSelectionMovedWithSnapping(1);
    notificationFrameEvents.raiseSelectionMovedWithSnapping(1);
    notificationFrameEvents.raiseSelectionScaledWithSnapping();
    notificationFrameEvents.beginFrame();
    const ensureSpy = vi.spyOn(audioContextHost, 'ensureContext').mockReturnValue({
      state: 'suspended',
      resume: vi.fn(async () => undefined),
    } as unknown as AudioContext);
    const resumeSpy = vi.spyOn(audioContextHost, 'resumeContext').mockResolvedValue(undefined);
    const controller = createController(settings, softClick, softWhoosh.player, pageTurn);
    controller.endFrame();
    expect(softWhoosh.play).not.toHaveBeenCalled();
    expect(softClick.play).not.toHaveBeenCalled();
    expect(notificationFrameEvents.hasAnySnapFeedbackSnapshot()).toBe(false);
    expect(resumeSpy).toHaveBeenCalled();
    ensureSpy.mockRestore();
    resumeSpy.mockRestore();
  });
});

/**
 * Builds a playback controller with an always-open rate limiter by default.
 *
 * @param settings Audio settings.
 * @param softClick Click player.
 * @param softWhoosh Whoosh player.
 * @param pageTurn Page-turn player.
 * @param rateLimiter Optional rate limiter.
 * @returns Controller under test.
 */
function createController(
  settings: AudioSettings,
  softClick: AudioSoundSoftClick,
  softWhoosh: AudioSoundSoftWhoosh,
  pageTurn: AudioSoundPageTurn,
  rateLimiter: AudioFeedbackRateLimiter = new AudioFeedbackRateLimiter(0, 0, () => 0),
  softFootstep: AudioSoundSoftFootstep = createSoftFootstepMock(),
): ControllerAudioPlayback {
  return new ControllerAudioPlayback(settings, softClick, softWhoosh, pageTurn, rateLimiter, softFootstep);
}

/**
 * Creates a soft-click double for playback tests.
 *
 * @returns Mock soft click player.
 */
function createSoftClickMock(): AudioSoundSoftClick {
  return { play: vi.fn(), unlock: vi.fn() } as unknown as AudioSoundSoftClick;
}

/**
 * Creates a soft-whoosh double for playback tests.
 *
 * @returns Mock soft whoosh player with a typed play spy.
 */
function createSoftWhooshMock(): {
  player: AudioSoundSoftWhoosh;
  play: Mock<(playbackRate?: number) => void>;
} {
  const play = vi.fn<(playbackRate?: number) => void>();
  return {
    play,
    player: { play } as unknown as AudioSoundSoftWhoosh,
  };
}

/**
 * Creates a page-turn double for playback tests.
 *
 * @returns Mock page-turn player.
 */
function createPageTurnMock(): AudioSoundPageTurn {
  return { play: vi.fn() } as unknown as AudioSoundPageTurn;
}

/**
 * Creates a soft-footstep double for playback tests.
 *
 * @returns Mock footstep player with a typed play spy.
 */
function createSoftFootstepMock(): AudioSoundSoftFootstep & {
  play: Mock<(playbackRate?: number, gain?: number) => void>;
} {
  const play = vi.fn<(playbackRate?: number) => void>();
  return { play, unlock: vi.fn() } as unknown as AudioSoundSoftFootstep & {
    play: Mock<(playbackRate?: number, gain?: number) => void>;
  };
}

/**
 * Builds a running AudioContext double that can construct the spatial bus
 * graph.
 *
 * @returns Mock context used by controller playback tests.
 */
function createRunningContextMock(): AudioContext {
  const makeParam = (value = 0) => ({
    value,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const makeGain = () => ({
    gain: makeParam(1),
    connect: vi.fn(),
  });
  const panner = {
    panningModel: 'equalpower',
    distanceModel: 'inverse',
    refDistance: 1,
    maxDistance: 10000,
    rolloffFactor: 1,
    coneInnerAngle: 360,
    coneOuterAngle: 360,
    coneOuterGain: 0,
    positionX: makeParam(0),
    positionY: makeParam(0),
    positionZ: makeParam(0),
    connect: vi.fn(),
  };
  return {
    state: 'running',
    currentTime: 0,
    destination: {},
    listener: {
      positionX: { value: 0 },
      positionY: { value: 0 },
      positionZ: { value: 0 },
      forwardX: { value: 0 },
      forwardY: { value: 0 },
      forwardZ: { value: -1 },
      upX: { value: 0 },
      upY: { value: 1 },
      upZ: { value: 0 },
    },
    createGain: vi.fn(makeGain),
    createPanner: vi.fn(() => panner),
    resume: vi.fn(async () => undefined),
  } as unknown as AudioContext;
}

/**
 * Creates a controller for remote sound tests.
 *
 * @param softFootstep Footstep double.
 * @returns Controller.
 */
function createRemoteController(softFootstep: AudioSoundSoftFootstep): ControllerAudioPlayback {
  return createController(
    new AudioSettings(new MemorySettingsStorage()),
    createSoftClickMock(),
    createSoftWhooshMock().player,
    createPageTurnMock(),
    new AudioFeedbackRateLimiter(0, 0, () => 0, 0),
    softFootstep,
  );
}
