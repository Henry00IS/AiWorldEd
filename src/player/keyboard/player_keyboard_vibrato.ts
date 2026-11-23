/** Rate of the held-Shift vibrato (the organ's). */
export const PLAYER_KEYBOARD_SHIFT_VIBRATO_HZ = 6.4;
/** Depth of the held-Shift vibrato in cents. */
export const PLAYER_KEYBOARD_SHIFT_VIBRATO_CENTS = 14;
/** Time constant easing the vibrato in (about 95% after 150 ms). */
const PLAYER_KEYBOARD_VIBRATO_IN_SECONDS = 0.05;
/** Time constant easing the vibrato out (about 95% after 250 ms). */
const PLAYER_KEYBOARD_VIBRATO_OUT_SECONDS = 0.083;

/**
 * One shared pitch LFO per keyboard for every voice of every slot: a sine into
 * a depth gain that drives each voice's detune, eased in and out on the audio
 * clock so a toggle lands at its scheduled time without a step. The LFO starts
 * with the first toggle on, joining the voices already sounding.
 */
export class PlayerKeyboardVibrato {
  private lfo: OscillatorNode | null = null;
  private depth: GainNode | null = null;
  private readonly voices = new Map<AudioScheduledSourceNode, AudioParam[]>();

  /**
   * Drives the detune of a voice until its source ends.
   *
   * @param owner Source whose end disconnects the vibrato.
   * @param detunes Detune parameters of the voice.
   */
  drive(owner: AudioScheduledSourceNode, detunes: AudioParam[]): void {
    const listed = this.voices.get(owner) ?? [];
    this.voices.set(owner, [...listed, ...detunes]);
    detunes.forEach((detune) => this.depth?.connect(detune));
    if (listed.length === 0) owner.addEventListener('ended', () => this.voiceEnd(owner));
  }

  /**
   * Eases the vibrato in or out.
   *
   * @param context Audio context.
   * @param on New state.
   * @param at Audio time of the change (now when omitted or past).
   */
  set(context: AudioContext, on: boolean, at?: number): void {
    const depth = on ? this.depthFor(context) : this.depth;
    if (!depth) return;
    const start = Math.max(at ?? 0, depth.context.currentTime);
    const constant = on ? PLAYER_KEYBOARD_VIBRATO_IN_SECONDS : PLAYER_KEYBOARD_VIBRATO_OUT_SECONDS;
    depth.gain.setTargetAtTime(on ? PLAYER_KEYBOARD_SHIFT_VIBRATO_CENTS : 0, start, constant);
  }

  /** Stops the LFO and frees it from the voices. */
  dispose(): void {
    this.lfo?.stop();
    this.lfo?.disconnect();
    this.depth?.disconnect();
    this.lfo = null;
    this.depth = null;
    this.voices.clear();
  }

  /**
   * Forgets an ended voice, freeing its detunes from the LFO.
   *
   * @param owner Ended source.
   */
  private voiceEnd(owner: AudioScheduledSourceNode): void {
    const detunes = this.voices.get(owner) ?? [];
    this.voices.delete(owner);
    detunes.forEach((detune) => this.depth?.disconnect(detune));
  }

  /**
   * Returns the depth gain, starting the LFO at no depth on first use and
   * joining the sounding voices to it.
   *
   * @param context Audio context.
   * @returns Depth gain in cents.
   */
  private depthFor(context: AudioContext): GainNode {
    if (this.depth) return this.depth;
    const depth = context.createGain();
    depth.gain.value = 0;
    this.lfo = context.createOscillator();
    this.lfo.frequency.value = PLAYER_KEYBOARD_SHIFT_VIBRATO_HZ;
    this.lfo.connect(depth);
    this.lfo.start();
    this.voices.forEach((detunes) => detunes.forEach((detune) => depth.connect(detune)));
    this.depth = depth;
    return depth;
  }
}
