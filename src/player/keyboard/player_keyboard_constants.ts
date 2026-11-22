import { PLAYER_BALL_RENDER_DELAY_MS } from '@/player/ball/player_ball_constants.js';

/**
 * MIDI pitch of the lowest key, KeyZ (FL Studio's C4, so KeyQ plays C5 = MIDI
 * 60, middle C, the root of the sample slots).
 */
export const PLAYER_KEYBOARD_LOWEST_PITCH = 48;

/** Keys on the keyboard (C4 to G6 in FL Studio names, the typing keys it maps). */
export const PLAYER_KEYBOARD_KEY_COUNT = 32;

/**
 * Most events in one keyboard entry (22 payload bytes: 3 header bytes and 9
 * events of 2 bytes).
 */
export const PLAYER_KEYBOARD_EVENTS_PER_ENTRY = 9;

/**
 * Header bytes of a keyboard payload: base counter, yaw and the instrument
 * before the first event.
 */
export const PLAYER_KEYBOARD_PAYLOAD_HEADER_BYTES = 3;

/**
 * Milliseconds per step of an event age (8 bits reach 510 ms before the frame
 * tick).
 */
export const PLAYER_KEYBOARD_AGE_STEP_MS = 2;

/** Largest stored event age in steps. */
export const PLAYER_KEYBOARD_AGE_STEPS_MAXIMUM = 255;

/** Oldest event age that still fits a frame. */
export const PLAYER_KEYBOARD_AGE_MAXIMUM_MS = PLAYER_KEYBOARD_AGE_STEP_MS * PLAYER_KEYBOARD_AGE_STEPS_MAXIMUM;

/** Frames every event rides in (the second copy covers one lost frame). */
export const PLAYER_KEYBOARD_SENDS_PER_EVENT = 2;

/** Range of the wrapping event counter. */
export const PLAYER_KEYBOARD_COUNTER_RANGE = 256;

/**
 * How far behind the player's clock other members hear the keyboard: a ball's
 * render delay plus 100 ms, so the second copy of an event still arrives in
 * time when the first frame was lost.
 */
export const PLAYER_KEYBOARD_PLAYBACK_DELAY_MS = PLAYER_BALL_RENDER_DELAY_MS + 100;

/** Largest look yaw away from the keyboard's facing in first person. */
export const PLAYER_KEYBOARD_LOOK_YAW_LIMIT_RADIANS = Math.PI / 3;

/**
 * Horizontal distance from the playing spot after which the keyboard is put
 * away.
 */
export const PLAYER_KEYBOARD_MOVED_OFF_METERS = 0.3;

/** Vertical distance from the playing spot after which the keyboard is put away. */
export const PLAYER_KEYBOARD_MOVED_OFF_HEIGHT_METERS = 0.4;

/** Horizontal distance from the feet to the keyboard's center. */
export const PLAYER_KEYBOARD_PLACE_FORWARD_METERS = 0.42;

/** Radius of the sphere swept to find the keyboard's spot (stand width). */
export const PLAYER_KEYBOARD_STAND_RADIUS_METERS = 0.1;

/** Height of the white key tops above the ground. */
export const PLAYER_KEYBOARD_PLAY_HEIGHT_METERS = 1.0;

/** Toy id of the keyboard entry (the balls use the others). */
export const PLAYER_KEYBOARD_TOY_ID = 4;

/** Release fade when a keyboard is put away (no click). */
export const PLAYER_KEYBOARD_FADE_SECONDS = 0.012;

/**
 * First event value that switches the instrument (value - first is the slot;
 * pitches stay below it).
 */
export const PLAYER_KEYBOARD_INSTRUMENT_EVENT_FIRST = 120;

/**
 * Event value that shifts the keys up an octave (sent down, like a switch;
 * pitches stay below it).
 */
export const PLAYER_KEYBOARD_OCTAVE_EVENT_UP = 116;

/** Event value that shifts the keys back to the lowest octave. */
export const PLAYER_KEYBOARD_OCTAVE_EVENT_DOWN = 117;

/** Semitones the octave shift adds to every key. */
export const PLAYER_KEYBOARD_OCTAVE_SEMITONES = 12;

/**
 * Event value that turns the vibrato on (sent down, like a switch; pitches stay
 * below it).
 */
export const PLAYER_KEYBOARD_VIBRATO_EVENT_ON = 118;

/** Event value that turns the vibrato off. */
export const PLAYER_KEYBOARD_VIBRATO_EVENT_OFF = 119;
