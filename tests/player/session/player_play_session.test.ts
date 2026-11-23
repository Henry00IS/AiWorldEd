import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_KEYBOARD_SETTINGS_STORAGE_KEY } from '@/player/keyboard/player_keyboard_settings.js';
import * as THREE from 'three';
import { PhysicsRapierRuntime } from '@/physics/rapier/physics_rapier_runtime.js';
import { PlayerSystem, type PlayerSystemHost } from '@/player/player_system.js';
import type { PlayerBallSystem } from '@/player/ball/player_ball_system.js';
import type { PlayerPlaySession } from '@/player/session/player_play_session.js';
import type { ManagerInput } from '@/input/manager_input.js';
import type { Viewport3D } from '@/viewports/core/viewport_3d.js';
import type { EditorWindow } from '@/editor/window/editor_window.js';
import type { Tool } from '@/editor/tools/tool.js';

/** Fake clock of play mode in milliseconds. */
let clock = 0;

/** Play mode over one pane, with the physical keys a test holds. */
interface Play {
  system: PlayerSystem;
  session: PlayerPlaySession;
  balls: PlayerBallSystem;
  tool: Tool;
  keys: Set<string>;
  helpers: THREE.Group;
  shown: string[];
}

/**
 * Builds a floor level.
 *
 * @returns World root.
 */
function levelBuild(): THREE.Group {
  const world = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20), new THREE.MeshStandardMaterial());
  floor.position.set(0, -0.5, 0);
  world.add(floor);
  world.updateMatrixWorld(true);
  return world;
}

/**
 * Builds one perspective pane over a level.
 *
 * @param world Level root.
 * @returns Viewport stub.
 */
function viewportBuild(world: THREE.Group): Viewport3D {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 2, 0);
  camera.updateMatrixWorld(true);
  const content = document.createElement('div');
  document.body.appendChild(content);
  return {
    getCamera: () => camera,
    getContentElement: () => content,
    getWorldGroup: () => world,
    getViewportToolbar: () => ({ getElement: () => content, insertControlAfterTitle: () => undefined }),
    setFlyingCameraEnabled: () => undefined,
    syncFlyingCameraOrientation: () => undefined,
    setOverlayRender: () => undefined,
  } as unknown as Viewport3D;
}

/**
 * Builds an editor window that activates the tools it is given.
 *
 * @returns Window stub and its active tool.
 */
function editorWindowBuild(): { editorWindow: EditorWindow; active: () => Tool | null } {
  let tool: Tool | null = null;
  const editorWindow = {
    get activeTool(): Tool | null {
      return tool;
    },
    useTool: (next: Tool) => {
      tool = next;
      next.onActivate();
    },
  } as unknown as EditorWindow;
  return { editorWindow, active: () => tool };
}

/**
 * Builds input that reports the physical keys a test holds.
 *
 * @param keys Held key codes.
 * @returns Input stub.
 */
function inputBuild(keys: Set<string>): ManagerInput {
  return {
    isKeyDown: () => false,
    isPhysicalKeyDown: (code: string) => keys.has(code),
    isCtrlDown: () => false,
    isShiftDown: () => keys.has('ShiftLeft') || keys.has('ShiftRight'),
  } as unknown as ManagerInput;
}

/**
 * Enters play mode on a floor.
 *
 * @returns Play mode.
 */
function playEnter(): Play {
  const world = levelBuild();
  const helpers = new THREE.Group();
  const viewport = viewportBuild(world);
  const { editorWindow, active } = editorWindowBuild();
  const keys = new Set<string>();
  const shown: string[] = [];
  const system = new PlayerSystem({
    ...{ worldRoot: world, inputManager: inputBuild(keys), getEditorWindow: () => editorWindow },
    ...{
      getPerspectiveViewports: () => [viewport],
      getInteractiveViewports: () => [],
      showStatusMessage: (message) => shown.push(message),
    },
    ...{ helperAdd: (object) => helpers.add(object), helperRemove: (object) => helpers.remove(object) },
  } satisfies PlayerSystemHost);
  system.tryHandleGlobalKeyDown(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
  const inner = system as unknown as { session: PlayerPlaySession; ballSystem: PlayerBallSystem };
  const tool = active();
  if (!tool) throw new Error('play tool not active');
  return { system, session: inner.session, balls: inner.ballSystem, tool, keys, helpers, shown };
}

/**
 * Advances play mode a few frames.
 *
 * @param play Play mode.
 * @param frames Frames.
 */
function frames(play: Play, frames = 3): void {
  for (let frame = 0; frame < frames; frame++) {
    clock += 16;
    play.tool.onRender();
  }
}

/**
 * Clicks a mouse button a while after the last click.
 *
 * @param play Play mode.
 * @param button Button index.
 */
function click(play: Play, button = 0): void {
  clock += 100;
  play.tool.onMouseDown(button);
}

/**
 * Returns the look yaw relative to a facing, wrapped to [-PI, PI].
 *
 * @param play Play mode.
 * @param facing Facing yaw.
 * @returns Relative yaw.
 */
function lookFrom(play: Play, facing: number): number {
  const yaw = play.session.getPresencePose()?.lookYawRadians ?? Number.NaN;
  return Math.atan2(Math.sin(yaw - facing), Math.cos(yaw - facing));
}

describe('PlayerPlaySession toys and keyboard', () => {
  beforeAll(async () => {
    await PhysicsRapierRuntime.ensureLoaded();
  });

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
    window.localStorage.removeItem(PLAYER_KEYBOARD_SETTINGS_STORAGE_KEY);
  });

  it('steps toys with the wheel in first person and zooms with it in third person; digits pick in both', () => {
    const play = playEnter();
    play.session.applyWheel(100);
    expect(play.session.getSelectedToy()).toBe('tennis');
    play.session.toggleViewMode();
    play.session.applyWheel(100);
    play.session.applyWheel(-100);
    expect(play.session.getSelectedToy()).toBe('tennis');
    play.tool.onKeyDown('Digit5');
    expect(play.session.getSelectedToy()).toBe('keyboard');
    play.system.dispose();
  });

  it('fires the grapple beam with a left click, pulls while held and lets go on release or another toy', () => {
    const play = playEnter();
    play.tool.onKeyDown('Digit6');
    frames(play, 1);
    expect(play.session.getSelectedToy()).toBe('grapple');
    expect(play.balls.getHeld()).toBeNull();
    expect(play.shown.at(-1)).toContain('hold LMB grapple, let go to fly');
    const beams = () => play.helpers.children.filter((child) => child.name === 'Grapple Beam');
    const grapple = (play.session as unknown as { grapple: { getAnchor(): THREE.Vector3 | null } }).grapple;
    play.session.applyLookDelta(0, 300);
    click(play);
    expect(grapple.getAnchor()).not.toBeNull();
    frames(play, 2);
    expect(beams()).toHaveLength(1);
    expect(play.session.getBodyMotion()?.velocity.length()).toBeGreaterThan(5);
    play.session.releaseToy();
    expect(grapple.getAnchor()).toBeNull();
    frames(play, 10);
    expect(beams()).toHaveLength(0);
    click(play);
    expect(grapple.getAnchor()).not.toBeNull();
    play.tool.onKeyDown('Digit2');
    expect(grapple.getAnchor()).toBeNull();
    play.system.dispose();
  });

  it('places the keyboard with a left click and puts it away with the next, in both views', () => {
    const play = playEnter();
    play.tool.onKeyDown('Digit5');
    click(play);
    expect(play.session.getKeyboard().isPlaced()).toBe(true);
    expect(play.helpers.children.some((child) => child.name === 'Keyboard Toy')).toBe(true);
    click(play, 2);
    click(play);
    expect(play.session.getKeyboard().isPlaced()).toBe(false);
    expect(play.helpers.children.some((child) => child.name === 'Keyboard Toy')).toBe(false);
    play.session.toggleViewMode();
    click(play);
    expect(play.session.getKeyboard().isPlaced()).toBe(true);
    play.system.dispose();
  });

  it('plays the typing keys while placed instead of moving, jumping or switching toys', () => {
    const play = playEnter();
    play.tool.onKeyDown('Digit5');
    frames(play, 40);
    click(play);
    const feet = play.session.getPresencePose()?.feet.clone();
    ['KeyZ', 'KeyW', 'Digit2', 'Space'].forEach((code) => play.keys.add(code));
    play.tool.onKeyDown('Digit2');
    frames(play, 20);
    expect(play.session.getSelectedToy()).toBe('keyboard');
    expect(play.balls.getKeyboards().getLocal()?.getHeldPitches()).toEqual([48, 61, 62]);
    expect(play.session.getPresencePose()?.feet.distanceTo(feet ?? new THREE.Vector3())).toBeLessThan(0.01);
    play.keys.clear();
    frames(play);
    expect(play.balls.getKeyboards().getLocal()?.getHeldPitches()).toEqual([]);
    play.tool.onKeyDown('ArrowRight');
    play.keys.add('KeyX');
    frames(play);
    expect(play.balls.getKeyboards().getLocal()?.getHeldPitches()).toEqual([50]);
    play.system.dispose();
  });

  it('turns the vibrato on while Shift is held without playing a note, and off on release', () => {
    const play = playEnter();
    play.tool.onKeyDown('Digit5');
    frames(play, 40);
    click(play);
    const keyboards = play.balls.getKeyboards();
    const vibrato = vi.spyOn(keyboards.getLocal()?.synth ?? ({} as never), 'vibratoSet');
    play.keys.add('ShiftLeft');
    frames(play);
    expect([keyboards.getVibrato(), keyboards.getLocal()?.getHeldPitches()]).toEqual([true, []]);
    play.keys.add('KeyQ');
    frames(play);
    expect(keyboards.getLocal()?.getHeldPitches()).toEqual([60]);
    play.keys.clear();
    frames(play);
    expect(vibrato.mock.calls.map(([on]) => on)).toEqual([true, false]);
    expect(keyboards.getVibrato()).toBe(false);
    play.system.dispose();
  });

  it('clamps the first-person look to 60 degrees around the keyboard; third person turns freely', () => {
    const play = playEnter();
    play.tool.onKeyDown('Digit5');
    click(play);
    const facing = play.balls.getKeyboards().getLocal()?.getPose()?.yaw ?? 0;
    play.session.applyLookDelta(4000, 0);
    frames(play);
    expect(Math.abs(lookFrom(play, facing))).toBeCloseTo(Math.PI / 3, 3);
    play.session.toggleViewMode();
    play.session.applyLookDelta(4000, 0);
    frames(play);
    expect(Math.abs(lookFrom(play, facing))).toBeGreaterThan(Math.PI / 2);
    play.system.dispose();
  });

  it('puts the keyboard away when the wheel picks another toy in first person, or the player is moved off the spot', () => {
    const play = playEnter();
    play.tool.onKeyDown('Digit5');
    click(play);
    play.session.applyWheel(-100);
    expect([play.session.getSelectedToy(), play.session.getKeyboard().isPlaced()]).toEqual(['plane', false]);
    play.tool.onKeyDown('Digit5');
    click(play);
    play.session.getPresencePose()?.feet.add(new THREE.Vector3(1, 0, 0));
    frames(play);
    expect(play.session.getKeyboard().isPlaced()).toBe(false);
    play.keys.add('KeyW');
    const before = play.session.getPresencePose()?.feet.clone();
    frames(play, 10);
    expect(play.session.getPresencePose()?.feet.distanceTo(before ?? new THREE.Vector3())).toBeGreaterThan(0.01);
    play.system.dispose();
  });

  it('hints the keyboard controls while it is out, and how toys are picked in each view', () => {
    const play = playEnter();
    expect(play.shown.at(-1)).toContain('1-6 or wheel pick toy');
    play.session.toggleViewMode();
    expect(play.shown.at(-1)).toBe('Third-person — ESC exit, LMB throw, 1-6 pick toy, RMB first-person');
    play.tool.onKeyDown('Digit5');
    click(play);
    frames(play, 1);
    expect(play.shown.at(-1)).toBe(
      'Keyboard: Sine, octave 1 — LMB put away (then 1-6 pick toy), ←/→ instrument, ↑/↓ octave, Shift vibrato, RMB first-person',
    );
    play.session.toggleViewMode();
    expect(play.shown.at(-1)).toBe(
      'Keyboard: Sine, octave 1 — LMB put away, ←/→ instrument, ↑/↓ octave, Shift vibrato, wheel pick toy, RMB third-person',
    );
    play.tool.onKeyDown('ArrowRight');
    play.tool.onKeyDown('ArrowUp');
    expect(play.shown.at(-1)).toBe(
      'Keyboard: Square, octave 2 — LMB put away, ←/→ instrument, ↑/↓ octave, Shift vibrato, wheel pick toy, RMB third-person',
    );
    play.tool.onKeyDown('ArrowUp');
    play.tool.onKeyDown('ArrowDown');
    expect(play.shown.at(-1)).toMatch(/^Keyboard: Square, octave 1 — /);
    click(play);
    frames(play, 1);
    expect(play.shown.at(-1)).toContain('Play mode — ESC exit');
    play.system.dispose();
  });

  it('still leaves play mode with Escape, taking the keyboard away', () => {
    const play = playEnter();
    play.tool.onKeyDown('Digit5');
    click(play);
    play.tool.onKeyDown('Escape');
    expect([play.system.getIsPlaying(), play.session.getKeyboard().isPlaced()]).toEqual([false, false]);
    play.system.dispose();
  });
});
