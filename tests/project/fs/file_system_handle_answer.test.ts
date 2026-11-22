import { afterEach, describe, expect, it, vi } from 'vitest';
import { FILE_SYSTEM_HANDLE_ANSWER_MS, fileSystemHandleAnswer } from '@/project/fs/file_system_handle_answer.js';

describe('fileSystemHandleAnswer', () => {
  afterEach(() => vi.useRealTimers());

  it('passes on the answer of the browser', async () => {
    expect(await fileSystemHandleAnswer(Promise.resolve('granted'))).toBe('granted');
  });

  it('passes on a failure of the browser', async () => {
    await expect(fileSystemHandleAnswer(Promise.reject(new Error('stale')))).rejects.toThrow('stale');
  });

  it('fails once the browser did not answer in time', async () => {
    vi.useFakeTimers();
    const answer = fileSystemHandleAnswer(new Promise<PermissionState>(() => undefined));
    const failed = expect(answer).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(FILE_SYSTEM_HANDLE_ANSWER_MS);
    await failed;
  });
});
