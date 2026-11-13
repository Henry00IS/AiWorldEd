import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsLevelJobQueue } from '@/physics/level/physics_level_job_queue.js';
import { PhysicsLevelSyncReport } from '@/physics/level/physics_level_sync_report.js';

/** Fake time in milliseconds that jobs advance by their cost. */
const clock = { now: 0 };

/**
 * Queues a job at an x position that logs its key when it runs.
 *
 * @param queue Queue.
 * @param key Job key.
 * @param x Center x of its 1 m extent.
 * @param log Receives keys of jobs that ran.
 * @param cost Milliseconds the job takes on the fake clock.
 */
function put(queue: PhysicsLevelJobQueue, key: string, x: number, log: string[], cost = 0): void {
  const bounds = new THREE.Box3(new THREE.Vector3(x - 0.5, 0, -0.5), new THREE.Vector3(x + 0.5, 1, 0.5));
  queue.put(key, {
    bounds,
    run: () => {
      clock.now += cost;
      log.push(key);
    },
  });
}

describe('PhysicsLevelJobQueue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces a pending job of the same collider and forgets dropped ones', () => {
    const queue = new PhysicsLevelJobQueue();
    const log: string[] = [];
    put(queue, 'a', 0, log);
    put(queue, 'a', 5, log);
    put(queue, 'b', 1, log);
    queue.drop('b');
    expect(queue.size()).toBe(1);
    expect(queue.runAll(new PhysicsLevelSyncReport())).toBe(1);
    expect(log).toEqual(['a']);
    expect(queue.size()).toBe(0);
  });

  it('runs every job touching a region at once, regardless of any budget', () => {
    const queue = new PhysicsLevelJobQueue();
    const log: string[] = [];
    [0, 3, 10, 30].forEach((x) => put(queue, `x${x}`, x, log));
    const region = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(3, 2, 1));
    expect(queue.runInside(region, new PhysicsLevelSyncReport())).toBe(2);
    expect(log).toEqual(['x0', 'x3']);
  });

  it('runs nearest jobs first within the time budget, at least one per call', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
    const queue = new PhysicsLevelJobQueue();
    const log: string[] = [];
    [40, 2, 20, 8].forEach((x) => put(queue, `x${x}`, x, log, 2));
    const focus = [new THREE.Vector3(0, 0, 0)];
    expect(queue.runNearest(focus, 0, new PhysicsLevelSyncReport())).toBe(1);
    expect(queue.runNearest(focus, 3, new PhysicsLevelSyncReport())).toBe(2);
    expect(log).toEqual(['x2', 'x8', 'x20']);
    expect(
      queue.runNearest([new THREE.Vector3(100, 0, 0), new THREE.Vector3(39, 0, 0)], 0, new PhysicsLevelSyncReport()),
    );
    expect(log.at(-1)).toBe('x40');
  });
});
