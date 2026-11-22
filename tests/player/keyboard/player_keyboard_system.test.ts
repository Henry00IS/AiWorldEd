import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PLAYER_KEYBOARD_SETTINGS_STORAGE_KEY } from '@/player/keyboard/player_keyboard_settings.js';
import * as THREE from 'three';
import { audioSpaceProbe } from '@/audio/space/audio_space_probe.js';
import { audioViewportFocus } from '@/audio/spatial/audio_viewport_focus.js';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { PLAYER_KEYBOARD_PLAYBACK_DELAY_MS } from '@/player/keyboard/player_keyboard_constants.js';
import type { ManagerInput } from '@/input/manager_input.js';
import { PlayerKeyboardInput } from '@/player/keyboard/player_keyboard_input.js';
import { PlayerKeyboardSynth } from '@/player/keyboard/player_keyboard_synth.js';
import {
  PlayerBallFakeRoom,
  PLAYER_BALL_FAKE_FRAME_MS,
  type PlayerBallFakeClient,
} from '../ball/player_ball_fake_room.js';
import { playerKeyboardFakeAudio } from './player_keyboard_fake_audio.js';

/**
 * Returns a client's eye (1.6 m over its feet).
 *
 * @param client Client.
 * @returns Eye position.
 */
function eyeOf(client: PlayerBallFakeClient): THREE.Vector3 {
  return client.feet.clone().setY(client.feet.y + 1.6);
}

/**
 * Builds a room with a playing owner and a viewer that only watches, both with
 * recorded keyboard voices.
 *
 * @returns Room, owner, viewer and the made synths.
 */
function room(): {
  fake: PlayerBallFakeRoom;
  owner: PlayerBallFakeClient;
  viewer: PlayerBallFakeClient;
  synths: PlayerKeyboardSynth[];
} {
  const fake = new PlayerBallFakeRoom();
  const audio = playerKeyboardFakeAudio(() => fake.now / 1000);
  const synths: PlayerKeyboardSynth[] = [];
  fake.keyboardSynth = () =>
    synths[synths.push(new PlayerKeyboardSynth(() => audio.context)) - 1] as PlayerKeyboardSynth;
  const owner = fake.add(1);
  const viewer = fake.add(2);
  fake.setPlaying(viewer, false);
  fake.run(10);
  return { fake, owner, viewer, synths };
}

/**
 * Lists the keyboard models a client shows.
 *
 * @param client Client.
 * @returns Shown keyboard roots.
 */
function shownKeyboards(client: PlayerBallFakeClient): THREE.Object3D[] {
  return client.helpers.children.filter((child) => child.name === 'Keyboard Toy');
}

describe('PlayerKeyboardSystem in a room', () => {
  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.removeItem(PLAYER_KEYBOARD_SETTINGS_STORAGE_KEY);
  });

  it('shows the placed keyboard on its stand to the others, hands on it, next to a tennis ball', () => {
    const { fake, owner, viewer } = room();
    owner.system.throwFrom(eyeOf(owner), new THREE.Vector3(1, 0, 0), 'tennis');
    const pose = owner.system.placeKeyboard(eyeOf(owner), Math.PI / 2);
    fake.run(30);
    expect(pose?.position.y).toBeCloseTo(0, 1);
    expect(pose && pose.position.x - owner.feet.x).toBeCloseTo(0.42, 1);
    expect(shownKeyboards(viewer)).toHaveLength(1);
    expect(shownKeyboards(viewer)[0]?.position.distanceTo(pose?.position ?? new THREE.Vector3())).toBeLessThan(0.02);
    expect(viewer.hands).toEqual([[1, true]]);
    expect(viewer.system.getMeshes().size).toBe(1);
    expect(fake.frames.filter((frame) => frame.sender === 1).at(-1)?.held).toBe('keyboard');
  });

  it('keeps a remote note held beyond fifteen seconds until its release, with no arbitrary timeout', () => {
    const { fake, owner, viewer } = room();
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    owner.system.keyboardKey(60, true);
    fake.run(Math.ceil(16000 / PLAYER_BALL_FAKE_FRAME_MS));
    const remote = viewer.system.getKeyboards().getRemote(1);
    expect(remote?.getHeldPitches()).toEqual([60]);
    expect(remote?.synth.getVoiceCount()).toBe(1);
    owner.system.keyboardKey(60, false);
    fake.run(60);
    expect(remote?.getHeldPitches()).toEqual([]);
    expect(remote?.synth.getVoiceCount()).toBe(0);
  });

  it('keeps the highest toy id for the keyboard: at most three balls while it is placed', () => {
    const { fake, owner } = room();
    owner.system.placeKeyboard(eyeOf(owner), 0);
    for (let index = 0; index < 5; index++) owner.system.throwFrom(eyeOf(owner), new THREE.Vector3(1, 0, 0), 'tennis');
    fake.run(5);
    expect(
      owner.system
        .getAuthority()
        .getBodies()
        .map((body) => body.id)
        .sort(),
    ).toEqual([1, 2, 3]);
  });

  it('streams 18 events of one frame through a continuation entry: one keyboard on the viewer, every note heard once', () => {
    const { fake, owner, viewer } = room();
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    for (let index = 0; index < 9; index++) owner.system.keyboardKey(48 + index, true);
    for (let index = 0; index < 9; index++) owner.system.keyboardKey(48 + index, false);
    fake.run(80);
    const remote = viewer.system.getKeyboards().getRemote(1);
    expect(remote?.scheduled.filter((note) => note.down)).toHaveLength(9);
    expect(remote?.scheduled).toHaveLength(18);
    expect(remote?.receiver.stats.missing).toBe(0);
    expect(shownKeyboards(viewer)).toHaveLength(1);
    expect(remote?.getHeldPitches()).toEqual([]);
  });

  it('frees a toy id for the continuation by removing the oldest toy, as a new throw would', () => {
    const { fake, owner, viewer } = room();
    owner.system.placeKeyboard(eyeOf(owner), 0);
    ['tennis', 'soccer', 'plane'].forEach((kind) =>
      owner.system.throwFrom(eyeOf(owner), new THREE.Vector3(1, 0, 0), kind as 'tennis'),
    );
    fake.run(30);
    const ids = (): number[] =>
      owner.system
        .getAuthority()
        .getBodies()
        .map((body) => body.id);
    expect(ids().sort()).toEqual([1, 2, 3]);
    const oldest = ids()[0];
    owner.system.keyboardKey(48, true);
    for (let index = 0; index < 12; index++) owner.system.keyboardKey(50 + index, true);
    fake.run(80);
    expect(ids()).not.toContain(oldest);
    expect(ids()).toHaveLength(2);
    expect(
      viewer.system
        .getKeyboards()
        .getRemote(1)
        ?.scheduled.filter((note) => note.down),
    ).toHaveLength(13);
    expect(shownKeyboards(viewer)).toHaveLength(1);
  });

  it('schedules the notes once, in order, on the audio clock a fixed delay behind and spaced like they were played, sinking the keys', () => {
    const { fake, owner, viewer } = room();
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    const played: [number, boolean, number][] = [];
    [60, 64, 67].forEach((pitch, index) => {
      played.push([pitch, true, fake.now]);
      owner.system.keyboardKey(pitch, true);
      fake.run(6 + index);
    });
    const remote = viewer.system.getKeyboards().getRemote(1);
    fake.run(Math.ceil(PLAYER_KEYBOARD_PLAYBACK_DELAY_MS / PLAYER_BALL_FAKE_FRAME_MS));
    expect(remote?.getHeldPitches()).toEqual([60, 64, 67]);
    expect([12, 16, 19].map((index) => remote?.model.isKeyDown(index))).toEqual([true, true, true]);
    [60, 64, 67].forEach((pitch) => owner.system.keyboardKey(pitch, false));
    fake.run(60);
    const notes = remote?.scheduled ?? [];
    expect(notes.map((note) => [note.pitch, note.down])).toEqual([
      [60, true],
      [64, true],
      [67, true],
      [60, false],
      [64, false],
      [67, false],
    ]);
    const starts = notes.map((note) => (note.at ?? 0) * 1000);
    const gaps = starts.slice(1, 3).map((start, index) => start - (starts[index] ?? 0));
    const sentGaps = played.slice(1).map((note, index) => note[2] - (played[index]?.[2] ?? 0));
    gaps.forEach((gap, index) => expect(Math.abs(gap - (sentGaps[index] ?? 0))).toBeLessThanOrEqual(2));
    notes.forEach((note) => expect(note.at).toBeCloseTo((note.time + PLAYER_KEYBOARD_PLAYBACK_DELAY_MS) / 1000, 3));
    expect(remote?.receiver.stats).toMatchObject({ accepted: 6, missing: 0 });
    expect(remote?.receiver.stats.duplicates).toBeGreaterThan(0);
    expect(remote?.getHeldPitches()).toEqual([]);
  });

  it('streams a duplicate-key retrigger as same-time off/on and releases only once', () => {
    const { fake, owner, viewer } = room();
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    const keyboard = new PlayerKeyboardInput();
    const keys = new Set<string>(['KeyQ']);
    const input = { isPhysicalKeyDown: (code: string) => keys.has(code) } as unknown as ManagerInput;
    const sample = (now = owner.system.now()) =>
      keyboard.sample(input, (pitch, down) => owner.system.keyboardKey(pitch, down, now));
    sample();
    fake.run(6);
    keys.add('Comma');
    sample();
    fake.run(6);
    keys.delete('KeyQ');
    sample();
    keys.clear();
    sample();
    fake.run(60);
    const notes = viewer.system.getKeyboards().getRemote(1)?.scheduled ?? [];
    expect(notes.map(({ pitch, down }) => [pitch, down])).toEqual([
      [60, true],
      [60, false],
      [60, true],
      [60, false],
    ]);
    expect(notes[1]?.at).toBe(notes[2]?.at);
    expect(owner.system.getKeyboards().getLocal()?.synth.getVoiceCount()).toBe(0);
  });

  it('samples the reverb room of a remote keyboard at its stand from the first note, like the local one', () => {
    const { fake, owner, viewer } = room();
    vi.spyOn(audioViewportFocus, 'getPerspectiveCamera').mockReturnValue(new THREE.PerspectiveCamera());
    const rooms: THREE.Vector3[] = [];
    const probe = audioSpaceProbe.sampleRoomCharacterAt.bind(audioSpaceProbe);
    vi.spyOn(audioSpaceProbe, 'sampleRoomCharacterAt').mockImplementation((at) => (rooms.push(at.clone()), probe(at)));
    owner.feet.x += 6;
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    owner.system.keyboardKey(60, true);
    fake.run(60);
    const remote = viewer.system.getKeyboards().getRemote(1);
    const stand = remote?.model.keyWorld(16, new THREE.Vector3());
    expect(rooms).toHaveLength(2);
    rooms.forEach((at) => expect(at.distanceTo(stand ?? new THREE.Vector3())).toBeLessThan(1e-6));
  });

  it('recovers a note whose first frame was lost from its second copy, still on time', () => {
    const { fake, owner, viewer } = room();
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    fake.drop = 1;
    owner.system.keyboardKey(72, true);
    fake.run(60);
    const remote = viewer.system.getKeyboards().getRemote(1);
    expect(remote?.scheduled.map((note) => note.pitch)).toEqual([72]);
    expect(remote?.receiver.stats.missing).toBe(0);
  });

  it('switches the instrument as an event in the stream', () => {
    const { fake, owner, viewer } = room();
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    expect(owner.system.keyboardInstrumentStep(1)).toBe(1);
    owner.system.keyboardKey(60, true);
    fake.run(60);
    expect(
      viewer.system
        .getKeyboards()
        .getRemote(1)
        ?.scheduled.map((note) => note.instrument),
    ).toEqual([1]);
  });

  it('shifts the octave by stream position on both clients, a held note keeping its pitch and key, and ignores steps past the ends', () => {
    const { fake, owner, viewer } = room();
    const noteOn = vi.spyOn(PlayerKeyboardSynth.prototype, 'noteOn');
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    expect([owner.system.keyboardOctaveStep(-1), owner.system.keyboardOctaveStep(1)]).toEqual([false, true]);
    expect([owner.system.keyboardOctaveStep(1), owner.system.getKeyboards().getOctave()]).toEqual([false, 1]);
    owner.system.keyboardKey(60, true);
    owner.system.keyboardOctaveStep(-1);
    owner.system.keyboardKey(62, true);
    owner.system.keyboardKey(60, false);
    fake.run(60);
    const calls = noteOn.mock.calls.map(([pitch, , at, transpose]) => [at === undefined, pitch, transpose ?? 0]);
    const heard = [
      [60, 12],
      [62, 0],
    ];
    expect(calls.filter(([local]) => local).map(([, ...rest]) => rest)).toEqual(heard);
    expect(calls.filter(([local]) => !local).map(([, ...rest]) => rest)).toEqual(heard);
    const scheduled = viewer.system.getKeyboards().getRemote(1)?.scheduled ?? [];
    expect(scheduled.map((note) => [note.pitch, note.down])).toEqual([
      [60, true],
      [62, true],
      [60, false],
    ]);
  });

  it('remembers the picked instrument in the editor settings and plays the next placed keyboard on it, also for the others', () => {
    const first = room();
    first.owner.system.placeKeyboard(eyeOf(first.owner), 0);
    [1, 1, 1].forEach((step) => first.owner.system.keyboardInstrumentStep(step));
    first.owner.system.putAwayKeyboard();
    const { fake, owner, viewer } = room();
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    expect(owner.system.getKeyboards().getInstrument()).toBe(3);
    owner.system.keyboardKey(60, true);
    fake.run(60);
    expect(
      viewer.system
        .getKeyboards()
        .getRemote(1)
        ?.scheduled.map((note) => note.instrument),
    ).toEqual([3]);
  });

  it('puts the keyboard away on both clients, fading its notes and freeing its audio, the ball staying', () => {
    const { fake, owner, viewer, synths } = room();
    owner.system.throwFrom(eyeOf(owner), new THREE.Vector3(1, 0, 0), 'tennis');
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    owner.system.keyboardKey(60, true);
    fake.run(60);
    expect(synths.map((synth) => synth.getVoiceCount())).toEqual([1, 1]);
    owner.system.putAwayKeyboard();
    fake.run(30);
    expect([shownKeyboards(owner), shownKeyboards(viewer)].map((shown) => shown.length)).toEqual([0, 0]);
    expect(viewer.system.getKeyboards().getRemote(1)).toBeUndefined();
    expect(viewer.hands).toEqual([
      [1, true],
      [1, false],
    ]);
    expect(synths.map((synth) => [synth.getVoiceCount(), synth.hasOutput()])).toEqual([
      [0, false],
      [0, false],
    ]);
    expect(viewer.system.getMeshes().size).toBe(1);
  });

  it('removes the keyboard when its player leaves play mode or the room', () => {
    const { fake, owner, viewer } = room();
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    fake.setPlaying(owner, false);
    fake.run(30);
    expect([shownKeyboards(owner).length, shownKeyboards(viewer).length]).toEqual([0, 0]);
    fake.setPlaying(owner, true);
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    expect(shownKeyboards(viewer)).toHaveLength(1);
    viewer.listener?.memberLeft(1);
    expect(shownKeyboards(viewer)).toHaveLength(0);
  });

  it('eases the vibrato in and out on the viewer at the time the owner held Shift, a playback delay behind', () => {
    const { fake, owner, viewer, synths } = room();
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    owner.system.keyboardKey(60, true);
    fake.run(3);
    const on = fake.now;
    owner.system.keyboardVibrato(true);
    fake.run(20);
    const off = fake.now;
    owner.system.keyboardVibrato(false);
    fake.run(30);
    const remote = viewer.system.getKeyboards().getRemote(1);
    const vibrato = remote?.vibratoScheduled.map((change) => [change.vibrato, change.at]);
    expect(vibrato).toEqual([
      [true, expect.closeTo((on + PLAYER_KEYBOARD_PLAYBACK_DELAY_MS) / 1000, 1)],
      [false, expect.closeTo((off + PLAYER_KEYBOARD_PLAYBACK_DELAY_MS) / 1000, 1)],
    ]);
    expect(remote?.scheduled.map((note) => note.pitch)).toEqual([60]);
    expect(synths).toHaveLength(2);
  });

  it('releases a note whose release was lost in both frames once a frame says no key is held, never one still in flight', () => {
    const { fake, owner, viewer } = room();
    owner.system.placeKeyboard(eyeOf(owner), 0);
    fake.run(30);
    owner.system.keyboardKey(60, true);
    owner.system.keyboardKey(64, true);
    fake.run(30);
    const remote = viewer.system.getKeyboards().getRemote(1);
    expect(remote?.getHeldPitches()).toEqual([60, 64]);
    owner.system.keyboardKey(60, false);
    fake.drop = 2;
    fake.run(4);
    expect(remote?.stuckReleased).toEqual([]);
    owner.system.keyboardKey(64, false);
    fake.run(10);
    expect([remote?.getHeldPitches(), remote?.stuckReleased]).toEqual([[60, 64], []]);
    fake.run(Math.ceil((PLAYER_KEYBOARD_PLAYBACK_DELAY_MS + 600) / PLAYER_BALL_FAKE_FRAME_MS));
    expect(remote?.receiver.stats.missing).toBe(1);
    expect(remote?.stuckReleased).toEqual([60]);
    expect([remote?.getHeldPitches(), remote?.synth.getVoiceCount()]).toEqual([[], 0]);
  });
});
