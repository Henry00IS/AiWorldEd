import type { AudioRoomCharacter } from '@/audio/space/audio_room_character.js';
import { AUDIO_ROOM_CHARACTER_DRY_2D } from '@/audio/space/audio_room_character.js';
import { audioSpatialBus } from '@/audio/spatial/audio_spatial_bus.js';
import { mapRoomCharacterToFreeverbParameters } from './freeverb/audio_freeverb_room_map.js';
import { AudioFreeverbNetwork } from './freeverb/audio_freeverb_network.js';
import type { AudioFreeverbParameters } from './freeverb/audio_freeverb_parameters.js';

/** Soft reverb mix levels for the external dry path and Freeverb wet send. */
export interface AudioSoftReverbMix {
  /** Dry path gain (0–1), applied outside Freeverb for positional routing. */
  dryGain: number;
  /**
   * Wet-send gain (0–1) into Freeverb. Controls how much new signal enters the
   * reverb; Freeverb setWet is only armed when this is above zero.
   */
  wetGain: number;
}

/**
 * Boot default is fully dry so Freeverb stays silent until a 3D room character
 * arms the wet path (avoids a reverb flash on first unlock / 2D snaps).
 */
export const DEFAULT_AUDIO_SOFT_REVERB_MIX: Readonly<AudioSoftReverbMix> = Object.freeze({
  dryGain: AUDIO_ROOM_CHARACTER_DRY_2D.dryGain,
  wetGain: AUDIO_ROOM_CHARACTER_DRY_2D.wetGain,
});

/** SetTarget time constant for dry/send gains when smoothing is allowed. */
const PARAM_SMOOTH_SECONDS = 0.04;

/**
 * Soft room bus: positional dry path + sample-accurate Freeverb wet path. 2D /
 * zero wet hard-gates Freeverb; non-zero wet uses send gain so tails can ring
 * when room wetness changes modestly in 3D.
 */
export class AudioEffectSoftReverb {
  private boundContext: AudioContext | null;
  private inputGain: GainNode | null;
  private dryGain: GainNode | null;
  private wetSend: GainNode | null;
  private freeverb: AudioFreeverbNetwork | null;
  private mix: AudioSoftReverbMix;
  private freeverbParameters: AudioFreeverbParameters;

  /**
   * Creates a soft reverb effect with the given dry/send mix.
   *
   * @param mix Optional dry and wet-send gains (defaults to dry boot mix).
   */
  constructor(mix: AudioSoftReverbMix = DEFAULT_AUDIO_SOFT_REVERB_MIX) {
    this.boundContext = null;
    this.inputGain = null;
    this.dryGain = null;
    this.wetSend = null;
    this.freeverb = null;
    this.mix = { dryGain: mix.dryGain, wetGain: mix.wetGain };
    this.freeverbParameters = mapRoomCharacterToFreeverbParameters(AUDIO_ROOM_CHARACTER_DRY_2D);
  }

  /**
   * Returns the input node for this reverb on the given context, building the
   * graph once per context.
   *
   * @param context Live audio context.
   * @returns Input gain node that feeds dry and wet paths.
   */
  getInput(context: AudioContext): AudioNode {
    this.ensureGraph(context);
    const input = this.inputGain;
    if (!input) {
      return context.destination;
    }
    return input;
  }

  /**
   * Returns the wet send of the reverb (ambient tail only) for sources that pan
   * their own dry signal, building the graph once per context.
   *
   * @param context Live audio context.
   * @returns Wet send gain node.
   */
  getWetSendInput(context: AudioContext): AudioNode {
    this.ensureGraph(context);
    return this.wetSend ?? context.destination;
  }

  /**
   * Applies room character: external dry/send gains and Freeverb size/damp/wet.
   *
   * @param character Room character from the space probe.
   */
  applyRoomCharacter(character: AudioRoomCharacter): void {
    this.freeverbParameters = mapRoomCharacterToFreeverbParameters(character);
    this.mix.dryGain = character.dryGain;
    this.mix.wetGain = character.wetGain;
    if (!this.inputGain || !this.boundContext) {
      return;
    }
    this.configureGains();
    this.freeverb?.applyParameters(this.freeverbParameters);
    if (this.mix.wetGain <= 1e-6) {
      this.freeverb?.mute();
    }
  }

  /**
   * Builds the dry/Freeverb graph once for the active context.
   *
   * @param context Live audio context.
   */
  private ensureGraph(context: AudioContext): void {
    if (this.boundContext === context && this.inputGain) {
      return;
    }
    this.boundContext = context;
    this.buildGraph(context);
  }

  /**
   * Creates dry path, Freeverb network, and wet output.
   *
   * @param context Live audio context.
   */
  private buildGraph(context: AudioContext): void {
    this.createCoreNodes(context);
    this.freeverb = new AudioFreeverbNetwork(context);
    this.configureGains(true);
    this.freeverb.applyParameters(this.freeverbParameters);
    if (this.mix.wetGain <= 1e-6) {
      this.freeverb.mute();
    }
    this.wireGraph(context);
  }

  /**
   * Creates shared input, dry, and wet-send gains.
   *
   * @param context Live audio context.
   */
  private createCoreNodes(context: AudioContext): void {
    this.inputGain = context.createGain();
    this.dryGain = context.createGain();
    this.wetSend = context.createGain();
  }

  /**
   * Sets input, dry, and wet-send gains from the current mix.
   *
   * @param instant When true, writes gains immediately (graph construction).
   */
  private configureGains(instant = false): void {
    if (!this.inputGain || !this.dryGain || !this.wetSend) {
      return;
    }
    this.writeGain(this.inputGain.gain, 1, instant);
    this.writeGain(this.dryGain.gain, this.mix.dryGain, instant);
    this.writeWetSendGain(instant);
  }

  /**
   * Writes wet-send gain; zero is always hard-set so Freeverb cannot leak.
   *
   * @param instant When true, skip smoothing even for non-zero targets.
   */
  private writeWetSendGain(instant: boolean): void {
    if (!this.wetSend) {
      return;
    }
    if (this.mix.wetGain <= 1e-6) {
      this.writeGain(this.wetSend.gain, 0, true);
      this.freeverb?.setWetOutputEnabled(false);
      return;
    }
    this.freeverb?.setWetOutputEnabled(true);
    this.writeGain(this.wetSend.gain, this.mix.wetGain, instant);
  }

  /**
   * Writes an AudioParam either instantly or with a short smooth ramp.
   *
   * @param param Parameter to update.
   * @param value Target value.
   * @param instant When true, hard-set without setTarget.
   */
  private writeGain(param: AudioParam, value: number, instant: boolean): void {
    if (instant || value <= 1e-6) {
      this.setParamImmediate(param, value);
      return;
    }
    this.setParamTarget(param, value);
  }

  /**
   * Hard-sets an AudioParam at the current time.
   *
   * @param param Parameter to update.
   * @param value Target value.
   */
  private setParamImmediate(param: AudioParam, value: number): void {
    const context = this.boundContext;
    if (!context) {
      param.value = value;
      return;
    }
    const now = context.currentTime;
    this.cancelParamAutomation(param, now);
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(value, now);
      return;
    }
    param.value = value;
  }

  /**
   * Smoothly approaches an AudioParam target without stacking prior ramps.
   *
   * @param param Parameter to update.
   * @param value Target value.
   */
  private setParamTarget(param: AudioParam, value: number): void {
    const context = this.boundContext;
    if (!context || typeof param.setTargetAtTime !== 'function') {
      param.value = value;
      return;
    }
    const now = context.currentTime;
    this.cancelParamAutomation(param, now);
    param.setTargetAtTime(value, now, PARAM_SMOOTH_SECONDS);
  }

  /**
   * Clears scheduled automation and anchors the current value at now.
   *
   * @param param Parameter to reset.
   * @param now Context currentTime.
   */
  private cancelParamAutomation(param: AudioParam, now: number): void {
    if (typeof param.cancelScheduledValues === 'function') {
      param.cancelScheduledValues(now);
    }
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(param.value, now);
    }
  }

  /**
   * Wires dry (positional) and Freeverb wet (ambient) paths.
   *
   * @param context Live audio context.
   */
  private wireGraph(context: AudioContext): void {
    this.wireDryPath(context);
    this.wireWetPath(context);
  }

  /**
   * Connects input → dry → positional mix.
   *
   * @param context Live audio context.
   */
  private wireDryPath(context: AudioContext): void {
    if (!this.inputGain || !this.dryGain) {
      return;
    }
    this.inputGain.connect(this.dryGain);
    this.dryGain.connect(audioSpatialBus.getDryMixInput(context));
  }

  /**
   * Connects input → wet send → Freeverb → ambient mix.
   *
   * @param context Live audio context.
   */
  private wireWetPath(context: AudioContext): void {
    if (!this.inputGain || !this.wetSend || !this.freeverb) {
      return;
    }
    this.inputGain.connect(this.wetSend);
    this.wetSend.connect(this.freeverb.getWetInput());
    this.freeverb.getWetOutput().connect(audioSpatialBus.getWetMixInput(context));
  }
}

/** Shared soft reverb bus for editor sound feedback. */
export const audioEffectSoftReverb = new AudioEffectSoftReverb();
