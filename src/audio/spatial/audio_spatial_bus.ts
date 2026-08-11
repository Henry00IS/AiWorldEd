import type { Camera } from 'three';
import * as THREE from 'three';
import type { AudioSpatialMode } from './audio_viewport_focus.js';
import { syncAudioListenerFromCamera } from './audio_listener_camera_sync.js';

/** World-space placement for the next sound emission. */
export interface AudioSpatialPlaybackPose {
  /** Mono (2D) or camera-relative 3D. */
  mode: AudioSpatialMode;
  /** Camera for 3D listener pose; ignored in mono. */
  camera: Camera | null;
  /** World position of the sound source (selection pivot). */
  sourcePosition: THREE.Vector3;
}

/** Minimum listener–source distance so equal-power panning stays stable. */
const MIN_SOURCE_DISTANCE = 0.75;

/**
 * Master mix after reverb: dry is lightly position-panned; wet is ambient
 * (centered). Short editor SFX use equalpower, not HRTF, to avoid pitch
 * warble.
 */
export class AudioSpatialBus {
  private boundContext: AudioContext | null;
  private dryMixInput: GainNode | null;
  private wetMixInput: GainNode | null;
  private panner: PannerNode | null;
  private wetOutputGain: GainNode | null;

  /** Creates an unbound spatial bus. */
  constructor() {
    this.boundContext = null;
    this.dryMixInput = null;
    this.wetMixInput = null;
    this.panner = null;
    this.wetOutputGain = null;
  }

  /**
   * Returns the dry-path mix input (positional for 3D, centered for mono).
   *
   * @param context Live audio context.
   * @returns Dry mix gain, or context.destination when graph cannot build.
   */
  getDryMixInput(context: AudioContext): AudioNode {
    this.ensureGraph(context);
    return this.dryMixInput ?? context.destination;
  }

  /**
   * Returns the wet-path mix input (always ambient / non-HRTF).
   *
   * @param context Live audio context.
   * @returns Wet mix gain, or context.destination when graph cannot build.
   */
  getWetMixInput(context: AudioContext): AudioNode {
    this.ensureGraph(context);
    return this.wetMixInput ?? context.destination;
  }

  /**
   * Legacy alias for dry mix (kept for older call sites / tests).
   *
   * @param context Live audio context.
   * @returns Dry mix input.
   */
  getMixInput(context: AudioContext): AudioNode {
    return this.getDryMixInput(context);
  }

  /**
   * Configures mono vs positional dry routing and listener/source poses.
   *
   * @param context Live audio context.
   * @param pose Spatial mode, camera, and source world position.
   */
  prepareForPlayback(context: AudioContext, pose: AudioSpatialPlaybackPose): void {
    this.ensureGraph(context);
    if (!this.panner) {
      return;
    }
    if (pose.mode === 'spatial3d' && pose.camera) {
      this.prepareSpatial3d(context, pose.camera, pose.sourcePosition);
      return;
    }
    this.prepareMono(context);
  }

  /**
   * Builds dry→panner and wet→destination once per context.
   *
   * @param context Live audio context.
   */
  private ensureGraph(context: AudioContext): void {
    if (this.boundContext === context && this.dryMixInput && this.wetMixInput && this.panner) {
      return;
    }
    this.boundContext = context;
    this.dryMixInput = context.createGain();
    this.wetMixInput = context.createGain();
    this.wetOutputGain = context.createGain();
    this.panner = context.createPanner();
    this.configurePannerDefaults(this.panner);
    this.dryMixInput.gain.value = 1;
    this.wetMixInput.gain.value = 1;
    this.wetOutputGain.gain.value = 1;
    this.dryMixInput.connect(this.panner);
    this.panner.connect(context.destination);
    this.wetMixInput.connect(this.wetOutputGain);
    this.wetOutputGain.connect(context.destination);
  }

  /**
   * Equal-power defaults for short snap feedback (stable, no HRTF pitch warp).
   *
   * @param panner Panner node to configure.
   */
  private configurePannerDefaults(panner: PannerNode): void {
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 6;
    panner.maxDistance = 250;
    panner.rolloffFactor = 0.25;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 0;
  }

  /**
   * 3D mode: equal-power panner at a clamped source, listener from camera.
   *
   * @param context Live audio context.
   * @param camera Perspective camera for the listener.
   * @param sourcePosition World position of the selection / sound.
   */
  private prepareSpatial3d(context: AudioContext, camera: Camera, sourcePosition: THREE.Vector3): void {
    const panner = this.panner;
    if (!panner) {
      return;
    }
    panner.panningModel = 'equalpower';
    syncAudioListenerFromCamera(context, camera);
    const listenerPosition = this.readListenerPosition(context.listener);
    const safeSource = this.clampSourceAwayFromListener(sourcePosition, listenerPosition);
    this.writePannerPosition(context, panner, safeSource);
  }

  /**
   * 2D / mono mode: source co-located with the listener (centered).
   *
   * @param context Live audio context.
   */
  private prepareMono(context: AudioContext): void {
    const panner = this.panner;
    if (!panner) {
      return;
    }
    panner.panningModel = 'equalpower';
    const listenerPosition = this.readListenerPosition(context.listener);
    this.writePannerPosition(context, panner, listenerPosition);
  }

  /**
   * Keeps the source a minimum distance from the listener to avoid unstable
   * pans.
   *
   * @param source Desired source position.
   * @param listener Listener position.
   * @returns Clamped source position.
   */
  private clampSourceAwayFromListener(source: THREE.Vector3, listener: THREE.Vector3): THREE.Vector3 {
    const offset = source.clone().sub(listener);
    const distance = offset.length();
    if (distance >= MIN_SOURCE_DISTANCE) {
      return source.clone();
    }
    if (distance < 1e-5) {
      return listener.clone().add(new THREE.Vector3(0, 0, -MIN_SOURCE_DISTANCE));
    }
    return listener.clone().add(offset.multiplyScalar(MIN_SOURCE_DISTANCE / distance));
  }

  /**
   * Writes a world position onto the panner. Uses an immediate setValueAtTime
   * so one-shot SFX (footsteps) are not still easing from a previous source
   * pose when their buffer starts.
   *
   * @param context Live audio context.
   * @param panner Panner node.
   * @param position World position.
   */
  private writePannerPosition(context: AudioContext, panner: PannerNode, position: THREE.Vector3): void {
    if (typeof panner.positionX !== 'undefined') {
      this.setParamImmediate(context, panner.positionX, position.x);
      this.setParamImmediate(context, panner.positionY, position.y);
      this.setParamImmediate(context, panner.positionZ, position.z);
      return;
    }
    const legacy = panner as PannerNode & {
      setPosition?: (x: number, y: number, z: number) => void;
    };
    legacy.setPosition?.(position.x, position.y, position.z);
  }

  /**
   * Snaps an AudioParam to a value at the current audio time.
   *
   * @param context Live audio context.
   * @param param Parameter to update.
   * @param value Target value.
   */
  private setParamImmediate(context: AudioContext, param: AudioParam, value: number): void {
    if (typeof param.cancelScheduledValues === 'function' && typeof param.setValueAtTime === 'function') {
      param.cancelScheduledValues(context.currentTime);
      param.setValueAtTime(value, context.currentTime);
      return;
    }
    param.value = value;
  }

  /**
   * Reads the current listener world position from the context listener.
   *
   * @param listener Context listener.
   * @returns Position vector (origin when unavailable).
   */
  private readListenerPosition(listener: AudioListener): THREE.Vector3 {
    if (typeof listener.positionX !== 'undefined') {
      return new THREE.Vector3(listener.positionX.value, listener.positionY.value, listener.positionZ.value);
    }
    return new THREE.Vector3(0, 0, 0);
  }
}

/** Shared spatial bus after reverb and before speakers. */
export const audioSpatialBus = new AudioSpatialBus();
