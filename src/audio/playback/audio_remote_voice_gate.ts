import type * as THREE from 'three';
import type { NotificationRemoteSound } from '@/audio/notification/notification_frame_events.js';

/** Most remote player sounds playing at once. */
export const AUDIO_REMOTE_VOICES_MAXIMUM = 3;
/** How long one remote sound holds its voice, in milliseconds. */
export const AUDIO_REMOTE_VOICE_MS = 160;
/** Distance within which remote sounds play at full level. */
export const AUDIO_REMOTE_FULL_METERS = 4;
/** Distance beyond which remote sounds are silent. */
export const AUDIO_REMOTE_AUDIBLE_METERS = 40;
/** Level of remote sounds relative to the own footsteps. */
const AUDIO_REMOTE_LEVEL = 0.8;

/** A remote sound chosen to play, with its level. */
export interface AudioRemoteVoice {
  sound: NotificationRemoteSound;
  gain: number;
}

/**
 * Level of a remote sound at a distance from the listener: full nearby, then a
 * smooth fall to silence at AUDIO_REMOTE_AUDIBLE_METERS (on top of the spatial
 * bus's own gentle roll-off, which alone would let far players be heard across
 * the whole map).
 *
 * @param distance Distance in meters.
 * @returns Level in [0, 1].
 */
export function audioRemoteAttenuation(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  if (distance <= AUDIO_REMOTE_FULL_METERS) return 1;
  if (distance >= AUDIO_REMOTE_AUDIBLE_METERS) return 0;
  const t = (distance - AUDIO_REMOTE_FULL_METERS) / (AUDIO_REMOTE_AUDIBLE_METERS - AUDIO_REMOTE_FULL_METERS);
  return (1 - t) * (1 - t);
}

/**
 * Chooses which remote player sounds play: the nearest audible ones while fewer
 * than AUDIO_REMOTE_VOICES_MAXIMUM are still sounding, at most a given number
 * per frame (the editor's spatial bus has one panner, so sounds started in the
 * same frame would share a position).
 */
export class AudioRemoteVoiceGate {
  private readonly ends: number[];
  private readonly maximum: number;

  /**
   * Creates an empty gate.
   *
   * @param maximum Most voices at once.
   */
  constructor(maximum = AUDIO_REMOTE_VOICES_MAXIMUM) {
    this.ends = [];
    this.maximum = maximum;
  }

  /**
   * Picks the sounds to play now and reserves their voices.
   *
   * @param sounds Sounds raised this frame.
   * @param listener Listener world position.
   * @param nowMs Current time in milliseconds.
   * @param perFrame Most sounds started now.
   * @returns Chosen sounds with their level, nearest first.
   */
  select(
    sounds: readonly NotificationRemoteSound[],
    listener: THREE.Vector3,
    nowMs: number,
    perFrame = 1,
  ): AudioRemoteVoice[] {
    for (let index = this.ends.length - 1; index >= 0; index--) {
      if ((this.ends[index] ?? 0) <= nowMs) this.ends.splice(index, 1);
    }
    const free = Math.min(perFrame, this.maximum - this.ends.length);
    if (free <= 0) return [];
    const chosen = sounds
      .map((sound) => {
        const distance = Math.hypot(sound.x - listener.x, sound.y - listener.y, sound.z - listener.z);
        return { sound, distance, gain: audioRemoteAttenuation(distance) * AUDIO_REMOTE_LEVEL };
      })
      .filter((voice) => voice.gain > 0.01)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, free);
    chosen.forEach(() => this.ends.push(nowMs + AUDIO_REMOTE_VOICE_MS));
    return chosen.map(({ sound, gain }) => ({ sound, gain }));
  }

  /** Frees every voice. */
  reset(): void {
    this.ends.length = 0;
  }
}

/**
 * Maps a remote sound to the footstep sample's pitch and an extra level: jumps
 * are a lighter, higher push-off; landings are deeper and louder with the fall
 * speed.
 *
 * @param sound Remote sound.
 * @param footstepRate Pitch for a footstep at the sound's planar speed.
 * @returns Playback rate and level scale.
 */
export function audioRemoteSoundShape(
  sound: NotificationRemoteSound,
  footstepRate: number,
): { rate: number; level: number } {
  const strength = Number.isFinite(sound.strength) ? Math.max(0, sound.strength) : 0;
  if (sound.kind === 'jump') return { rate: 1.12, level: 0.6 };
  if (sound.kind === 'land')
    return { rate: Math.max(0.7, 0.95 - strength * 0.03), level: Math.min(1.4, 0.7 + strength * 0.08) };
  return { rate: footstepRate, level: 1 };
}
