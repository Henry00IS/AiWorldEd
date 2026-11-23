import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AUDIO_LISTENER_SMOOTHING, syncAudioListenerFromCamera } from '@/audio/spatial/audio_listener_camera_sync.js';

describe('syncAudioListenerFromCamera', () => {
  it('writes camera world position and orientation onto the context listener', () => {
    const listener = {
      positionX: { value: 0 },
      positionY: { value: 0 },
      positionZ: { value: 0 },
      forwardX: { value: 0 },
      forwardY: { value: 0 },
      forwardZ: { value: 0 },
      upX: { value: 0 },
      upY: { value: 0 },
      upZ: { value: 0 },
    };
    const context = { listener } as unknown as AudioContext;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    camera.lookAt(1, 2, 0);
    camera.updateMatrixWorld(true);
    syncAudioListenerFromCamera(context, camera);
    expect(listener.positionX.value).toBeCloseTo(1, 4);
    expect(listener.positionY.value).toBeCloseTo(2, 4);
    expect(listener.positionZ.value).toBeCloseTo(3, 4);
    expect(listener.forwardZ.value).toBeLessThan(0);
  });

  it('glides every listener parameter from the audio clock instead of stepping it each frame', () => {
    const targets: [string, number, number, number][] = [];
    const param = (name: string) => ({
      value: 0,
      setTargetAtTime: (value: number, at: number, constant: number) => targets.push([name, value, at, constant]),
    });
    const names = ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'];
    const listener = Object.fromEntries(names.map((name) => [name, param(name)]));
    const context = { listener, currentTime: 2.5 } as unknown as AudioContext;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    syncAudioListenerFromCamera(context, camera);
    expect(targets.map(([name]) => name)).toEqual(names);
    expect(targets.slice(0, 3).map(([, value]) => value)).toEqual([1, 2, 3]);
    expect(targets.every(([, , at, constant]) => at === 2.5 && constant === AUDIO_LISTENER_SMOOTHING)).toBe(true);
    expect(listener['positionX']?.value).toBe(0);
  });
});
