import * as THREE from 'three';
import type { Vector3 } from 'three';
import { notificationFrameEvents } from '@/audio/notification/notification_frame_events.js';
import { audioContextHost } from '@/audio/context/audio_context_host.js';
import { audioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { AUDIO_ROOM_CHARACTER_DRY_2D } from '@/audio/space/audio_room_character.js';
import { audioSpaceProbe } from '@/audio/space/audio_space_probe.js';
import { getAudioSelectionWorldBounds } from '@/audio/space/audio_space_probe_bind.js';
import { resolveBoundsClosestSoundPose } from '@/audio/spatial/audio_bounds_closest_sound_pose.js';
import { audioSpatialBus, type AudioSpatialPlaybackPose } from '@/audio/spatial/audio_spatial_bus.js';
import { audioViewportFocus } from '@/audio/spatial/audio_viewport_focus.js';
import { audioSettings, type AudioSettings } from '@/audio/settings/audio_settings.js';
import { audioFeedbackRateLimiter, type AudioFeedbackRateLimiter } from './audio_feedback_rate_limiter.js';
import { AudioRemoteVoiceGate, audioRemoteSoundShape } from './audio_remote_voice_gate.js';
import { audioSoundPageTurn, type AudioSoundPageTurn } from './audio_sound_page_turn.js';
import { audioSoundSoftClick, type AudioSoundSoftClick } from './audio_sound_soft_click.js';
import { audioSoundSoftFootstep, type AudioSoundSoftFootstep } from './audio_sound_soft_footstep.js';
import { audioSoundSoftWhoosh, type AudioSoundSoftWhoosh } from './audio_sound_soft_whoosh.js';

/**
 * Consumes frame-event snapshots at the end of the editor update cycle and
 * plays mapped sounds when audio is enabled.
 */
export class ControllerAudioPlayback {
  private readonly settings: AudioSettings;
  private readonly softClick: AudioSoundSoftClick;
  private readonly softWhoosh: AudioSoundSoftWhoosh;
  private readonly pageTurn: AudioSoundPageTurn;
  private readonly softFootstep: AudioSoundSoftFootstep;
  private readonly rateLimiter: AudioFeedbackRateLimiter;
  private readonly footstepSourcePosition: THREE.Vector3;
  private readonly remoteVoices: AudioRemoteVoiceGate;
  private readonly remoteListener: THREE.Vector3;

  /**
   * Creates a playback controller.
   *
   * @param settings Audio enable settings.
   * @param softClick Soft click sound player (scale/resize).
   * @param softWhoosh Soft whoosh sound player (move/rotate).
   * @param pageTurn Page-turn player (CSG operation changes).
   * @param rateLimiter Cool-down gate for rapid snap feedback.
   * @param softFootstep Soft footstep player (play-mode plants).
   */
  constructor(
    settings: AudioSettings = audioSettings,
    softClick: AudioSoundSoftClick = audioSoundSoftClick,
    softWhoosh: AudioSoundSoftWhoosh = audioSoundSoftWhoosh,
    pageTurn: AudioSoundPageTurn = audioSoundPageTurn,
    rateLimiter: AudioFeedbackRateLimiter = audioFeedbackRateLimiter,
    softFootstep: AudioSoundSoftFootstep = audioSoundSoftFootstep,
  ) {
    this.settings = settings;
    this.softClick = softClick;
    this.softWhoosh = softWhoosh;
    this.pageTurn = pageTurn;
    this.softFootstep = softFootstep;
    this.rateLimiter = rateLimiter;
    this.footstepSourcePosition = new THREE.Vector3();
    this.remoteVoices = new AudioRemoteVoiceGate();
    this.remoteListener = new THREE.Vector3();
  }

  /** Plays sounds for events snapshotted at the start of this frame. */
  endFrame(): void {
    if (!this.settings.isEnabled()) {
      notificationFrameEvents.reset();
      return;
    }
    if (!notificationFrameEvents.hasAnySnapFeedbackSnapshot()) {
      return;
    }
    if (!notificationFrameEvents.hasAnyLocalFeedbackSnapshot() && !audioContextHost.isRunning()) {
      return;
    }
    if (!this.ensureRunningContextForPlayback()) {
      return;
    }
    const hasEditorSnap =
      notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot() ||
      notificationFrameEvents.hasSelectionRotatedWithSnappingSnapshot() ||
      notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot() ||
      notificationFrameEvents.hasSolidCsgOperationFlippedSnapshot();
    this.playPlayerFootstepIfRaised();
    if (!hasEditorSnap && !notificationFrameEvents.hasPlayerFootstepSnapshot()) {
      this.playRemotePlayerSounds();
    }
    if (hasEditorSnap) {
      this.prepareSpatialAndRoom();
      this.playSelectionMovedWithSnappingIfRaised();
      this.playSelectionRotatedWithSnappingIfRaised();
      this.playSelectionScaledWithSnappingIfRaised();
      this.playSolidCsgOperationFlippedIfRaised();
    }
  }

  /**
   * Resumes audio when needed and drops snap backlog while still suspended so
   * Chrome wake-up does not play every queued snap at once.
   *
   * @returns True when the shared context is running and playback may proceed.
   */
  private ensureRunningContextForPlayback(): boolean {
    const context = audioContextHost.ensureContext();
    if (!context) {
      notificationFrameEvents.reset();
      return false;
    }
    if (context.state === 'running') {
      return true;
    }
    void audioContextHost.resumeContext(context);
    notificationFrameEvents.reset();
    return false;
  }

  /**
   * Resolves the volumetric sound pose, then applies dry mono for 2D or room
   * probe + HRTF for 3D.
   */
  private prepareSpatialAndRoom(): void {
    this.prepareSpatialAndRoomForPose(this.resolvePlaybackPose());
  }

  /**
   * Applies room character and spatial bus routing for a resolved pose.
   *
   * @param pose Spatial pose used for both panner and room rays.
   */
  private prepareSpatialAndRoomForPose(pose: AudioSpatialPlaybackPose): void {
    this.applyRoomCharacterForPoseMode(pose.mode, pose.sourcePosition);
    const context = audioContextHost.ensureContext();
    if (!context) {
      return;
    }
    audioSpatialBus.prepareForPlayback(context, pose);
  }

  /**
   * 2D is fully dry; 3D samples room character at the sound origin.
   *
   * @param mode Mono (2D) or spatial3d.
   * @param sourcePosition World point for room rays in 3D.
   */
  private applyRoomCharacterForPoseMode(mode: 'mono' | 'spatial3d', sourcePosition: Vector3): void {
    if (mode === 'mono') {
      audioEffectSoftReverb.applyRoomCharacter(AUDIO_ROOM_CHARACTER_DRY_2D);
      return;
    }
    const character = audioSpaceProbe.sampleRoomCharacterAt(sourcePosition);
    audioEffectSoftReverb.applyRoomCharacter(character);
  }

  /**
   * Builds the shared playback pose: closest point on selection bounds to the
   * camera (3D), or mono when inside bounds / on a 2D viewport.
   *
   * @returns Spatial pose used for both panner and room rays.
   */
  private resolvePlaybackPose(): AudioSpatialPlaybackPose {
    return resolveBoundsClosestSoundPose(
      audioViewportFocus.getSpatialMode(),
      audioViewportFocus.getCamera(),
      getAudioSelectionWorldBounds(),
      audioSpaceProbe.getProbeOrigin(),
    );
  }

  /**
   * Builds a pose for a world-space foot plant using the same mono/3D viewport
   * rules as selection feedback.
   *
   * @param sourcePosition World foot position.
   * @returns Spatial pose for the foot plant.
   */
  private resolveFootstepPlaybackPose(sourcePosition: THREE.Vector3): AudioSpatialPlaybackPose {
    const mode = audioViewportFocus.getSpatialMode();
    const camera = audioViewportFocus.getCamera();
    if (mode === 'mono' || !camera) {
      return { mode: 'mono', camera, sourcePosition: sourcePosition.clone() };
    }
    return { mode: 'spatial3d', camera, sourcePosition: sourcePosition.clone() };
  }

  /**
   * Plays the nearest audible remote player sound through the same room reverb
   * and spatial bus as the own footsteps. Skipped in frames with local
   * feedback, which owns the shared panner then.
   */
  private playRemotePlayerSounds(): void {
    const sounds = notificationFrameEvents.getRemotePlayerSoundsSnapshot();
    const camera = audioViewportFocus.getCamera();
    if (sounds.length === 0 || !camera) {
      return;
    }
    camera.getWorldPosition(this.remoteListener);
    this.remoteVoices.select(sounds, this.remoteListener, performance.now()).forEach(({ sound, gain }) => {
      this.footstepSourcePosition.set(sound.x, sound.y, sound.z);
      this.prepareSpatialAndRoomForPose(this.resolveFootstepPlaybackPose(this.footstepSourcePosition));
      const shape = audioRemoteSoundShape(sound, mapFootstepSpeedToPlaybackRate(sound.strength));
      this.softFootstep.play(shape.rate, gain * shape.level);
    });
  }

  /** Plays the soft whoosh when move snap fired and cool-down allows. */
  private playSelectionMovedWithSnappingIfRaised(): void {
    if (!notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()) {
      return;
    }
    if (!this.rateLimiter.tryConsumeWhoosh()) {
      return;
    }
    const speed = notificationFrameEvents.getSelectionMovedSpeedSnapshot();
    this.softWhoosh.play(mapSnapMoveSpeedToPlaybackRate(speed));
  }

  /** Plays the soft whoosh when rotate snap fired and cool-down allows. */
  private playSelectionRotatedWithSnappingIfRaised(): void {
    if (!notificationFrameEvents.hasSelectionRotatedWithSnappingSnapshot()) {
      return;
    }
    if (!this.rateLimiter.tryConsumeWhoosh()) {
      return;
    }
    const speed = notificationFrameEvents.getSelectionRotatedSpeedSnapshot();
    this.softWhoosh.play(mapSnapRotateSpeedToPlaybackRate(speed));
  }

  /** Plays the soft click when scale/resize snap fired and cool-down allows. */
  private playSelectionScaledWithSnappingIfRaised(): void {
    if (!notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()) {
      return;
    }
    if (!this.rateLimiter.tryConsumeClick()) {
      return;
    }
    const travel = notificationFrameEvents.getSelectionResizeTravelSnapshot();
    this.softClick.play(mapResizeTravelToPlaybackRate(travel));
  }

  /** Plays the page-turn when a solid CSG operation change snapshot is set. */
  private playSolidCsgOperationFlippedIfRaised(): void {
    if (!notificationFrameEvents.hasSolidCsgOperationFlippedSnapshot()) {
      return;
    }
    this.pageTurn.play();
  }

  /**
   * Plays a soft footstep at the planted foot with room reverb rules matching
   * other editor SFX.
   */
  private playPlayerFootstepIfRaised(): void {
    if (!notificationFrameEvents.hasPlayerFootstepSnapshot()) {
      return;
    }
    if (!this.rateLimiter.tryConsumeFootstep()) {
      return;
    }
    this.footstepSourcePosition.set(
      notificationFrameEvents.getPlayerFootstepWorldXSnapshot(),
      notificationFrameEvents.getPlayerFootstepWorldYSnapshot(),
      notificationFrameEvents.getPlayerFootstepWorldZSnapshot(),
    );
    this.prepareSpatialAndRoomForPose(this.resolveFootstepPlaybackPose(this.footstepSourcePosition));
    const speed = notificationFrameEvents.getPlayerFootstepSpeedSnapshot();
    this.softFootstep.play(mapFootstepSpeedToPlaybackRate(speed));
  }
}

/**
 * Maps move-snap speed EMA (world units/sec) to BufferSource playbackRate.
 *
 * @param speedUnitsPerSecond Snapshotted step-speed average.
 * @returns Playback rate for the move snap sample.
 */
export function mapSnapMoveSpeedToPlaybackRate(speedUnitsPerSecond: number): number {
  const speed = speedUnitsPerSecond < 0 ? 0 : speedUnitsPerSecond;
  const t = speed > 28 ? 1 : speed / 28;
  return 0.88 + t * 0.5;
}

/**
 * Maps rotate snap-rate EMA (snaps/sec) to BufferSource playbackRate. High
 * full-scale threshold so ordinary spins stay near default pitch.
 *
 * @param snapsPerSecond Snapshotted rotate snap frequency.
 * @returns Playback rate for the rotate snap sample.
 */
export function mapSnapRotateSpeedToPlaybackRate(snapsPerSecond: number): number {
  const rate = snapsPerSecond < 0 ? 0 : snapsPerSecond;
  const t = rate > 22 ? 1 : rate / 22;
  return 0.95 + t * 0.2;
}

/**
 * Maps scale/resize travel (bounds face distance or scale snap steps from
 * identity) to playbackRate. Zero travel stays at default pitch; pitch climbs
 * with distance.
 *
 * @param travelDistance Absolute travel from drag start.
 * @returns Playback rate for the resize/scale click sample.
 */
export function mapResizeTravelToPlaybackRate(travelDistance: number): number {
  const travel = travelDistance < 0 ? 0 : travelDistance;
  const t = travel > 7 ? 1 : travel / 7;
  return 1 + t * 0.45;
}

/**
 * Maps planar locomotion speed to footstep playback rate. Faster steps pitch
 * slightly higher while staying near the soft-click range.
 *
 * @param planarSpeedMetersPerSecond Body planar speed.
 * @returns Playback rate for the footstep sample.
 */
export function mapFootstepSpeedToPlaybackRate(planarSpeedMetersPerSecond: number): number {
  const speed = planarSpeedMetersPerSecond < 0 ? 0 : planarSpeedMetersPerSecond;
  const t = speed > 10 ? 1 : speed / 10;
  return 0.78 + t * 0.35;
}

/** Shared end-of-frame audio playback controller. */
export const controllerAudioPlayback = new ControllerAudioPlayback();
