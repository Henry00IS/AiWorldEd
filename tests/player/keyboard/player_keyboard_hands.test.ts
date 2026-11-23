import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlayerKeyboardHands } from '@/player/keyboard/player_keyboard_hands.js';
import { PlayerKeyboardModel } from '@/player/keyboard/player_keyboard_model.js';

describe('PlayerKeyboardHands', () => {
  it('rests each wrist over the middle of its half, the left hand on the low keys', () => {
    const model = new PlayerKeyboardModel(0xff0000);
    model.place(new THREE.Vector3(0, 0, 1), 0);
    const hands = new PlayerKeyboardHands();
    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    expect(hands.copyHandTargetsTo(left, right)).toBe(false);
    hands.update(model, new Set(), 0);
    expect(hands.copyHandTargetsTo(left, right)).toBe(true);
    expect(left.x).toBeCloseTo(model.keyWorld(8, new THREE.Vector3()).x, 5);
    expect(right.x).toBeCloseTo(model.keyWorld(24, new THREE.Vector3()).x, 5);
    expect(left.x).toBeGreaterThan(right.x);
    expect(left.z).toBeLessThan(1);
    model.dispose();
  });

  it('moves a wrist smoothly to the average pressed key of its half and sinks the keys', () => {
    const model = new PlayerKeyboardModel(0xff0000);
    model.place(new THREE.Vector3(), Math.PI / 2);
    const hands = new PlayerKeyboardHands();
    hands.update(model, new Set(), 0);
    const held = new Set([0, 4]);
    model.setHeld(held);
    expect([0, 1, 4].map((index) => model.isKeyDown(index))).toEqual([true, false, true]);
    const goal = model.keyWorld(0, new THREE.Vector3()).add(model.keyWorld(4, new THREE.Vector3())).multiplyScalar(0.5);
    const start = hands.left.distanceTo(goal);
    hands.update(model, held, 1 / 60);
    const step = hands.left.distanceTo(goal);
    expect(step).toBeLessThan(start);
    expect(step).toBeGreaterThan(start * 0.5);
    for (let frame = 0; frame < 60; frame++) hands.update(model, held, 1 / 60);
    expect(hands.left.distanceTo(goal)).toBeLessThan(0.12);
    model.dispose();
  });

  it('lifts a released wrist to hover where it last played, then moves on from there to the next keys', () => {
    const model = new PlayerKeyboardModel(0xff0000);
    model.place(new THREE.Vector3(), 0);
    const hands = new PlayerKeyboardHands();
    const settle = (held: Set<number>) => {
      for (let frame = 0; frame < 120; frame++) hands.update(model, held, 1 / 60);
      return { left: hands.left.clone(), right: hands.right.clone() };
    };
    const rest = settle(new Set());
    const low = model.keyWorld(0, new THREE.Vector3());
    const pressed = settle(new Set([0]));
    const hovering = settle(new Set());
    expect(Math.abs(hovering.left.x - low.x)).toBeLessThan(Math.abs(rest.left.x - low.x) / 10);
    expect(hovering.left.y).toBeGreaterThan(pressed.left.y);
    expect(hovering.left.distanceTo(pressed.left)).toBeLessThan(0.02);
    expect(hovering.right.distanceTo(rest.right)).toBeLessThan(1e-6);
    const next = model.keyWorld(12, new THREE.Vector3());
    hands.update(model, new Set([12]), 1 / 60);
    expect(Math.abs(hands.left.x - next.x)).toBeLessThan(Math.abs(hovering.left.x - next.x));
    const later = settle(new Set());
    expect(Math.abs(later.left.x - next.x)).toBeLessThan(Math.abs(low.x - next.x) / 10);
    model.dispose();
  });
});
