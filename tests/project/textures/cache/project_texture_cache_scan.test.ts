import { describe, expect, it } from 'vitest';
import {
  ProjectTextureHashScanner,
  ProjectTextureScanCancelled,
  ProjectTextureScanPace,
  projectTextureScanBlob,
} from '@/project/textures/cache/project_texture_cache_scan.js';
import { UserIdle } from '@/utils/user_idle.js';

describe('ProjectTextureHashScanner', () => {
  it('finds 64-character lowercase hex runs only, across chunk boundaries', () => {
    const a = 'a'.repeat(64);
    const b = '0123456789abcdef'.repeat(4);
    const text = `{"t":"embedded:${a}.png","u":"${b}","x":"${'c'.repeat(65)}","y":"${'D'.repeat(64)}"}${'e'.repeat(64)}`;
    const bytes = new TextEncoder().encode(text);
    for (const step of [1, 7, 64, 1000]) {
      const scanner = new ProjectTextureHashScanner();
      for (let i = 0; i < bytes.length; i += step) scanner.push(bytes.subarray(i, i + step));
      expect([...scanner.end()].sort()).toEqual([a, b, 'e'.repeat(64)].sort());
    }
  });

  it('streams a file in chunks and yields between them', async () => {
    const hash = 'f'.repeat(64);
    const blob = new Blob([' '.repeat(300_000), hash, ' '.repeat(300_000)]);
    let yields = 0;
    let time = 0;
    const pace = new ProjectTextureScanPace({
      sliceMs: 1,
      clock: () => (time += 1),
      yieldNow: async () => void (yields += 1),
    });
    expect([...(await projectTextureScanBlob(blob, pace))]).toEqual([hash]);
    expect(yields).toBeGreaterThanOrEqual(9);
  });
});

describe('ProjectTextureScanPace', () => {
  it('throws once cancelled', async () => {
    const abort = new AbortController();
    const pace = new ProjectTextureScanPace({ signal: abort.signal, sliceMs: 0, yieldNow: async () => undefined });
    await pace.pace();
    abort.abort();
    await expect(pace.pace()).rejects.toBeInstanceOf(ProjectTextureScanCancelled);
  });

  it('pauses on user input until the idle window passed', async () => {
    const target = new EventTarget();
    const idleMs = 100;
    const idle = new UserIdle({ target, idleMs, hidden: () => false });
    const pace = new ProjectTextureScanPace({ idle, sliceMs: 0, yieldNow: async () => undefined });
    target.dispatchEvent(new Event('pointermove'));
    const started = performance.now();
    await pace.pace();
    expect(performance.now() - started).toBeGreaterThanOrEqual(idleMs - 5);
    expect(pace.pauses).toBe(1);
    idle.dispose();
  });
});
