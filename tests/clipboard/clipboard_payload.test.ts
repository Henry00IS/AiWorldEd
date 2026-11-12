import { describe, it, expect } from 'vitest';
import { clipboardPayloadParse, clipboardPayloadText } from '@/clipboard/clipboard_payload.js';

describe('clipboard payload', () => {
  it('round-trips data of the same type', () => {
    const text = clipboardPayloadText('modifiers', { modifiers: [1, 2] });
    expect(JSON.parse(text)).toMatchObject({ format: 'aiworlded-clipboard', version: 1, type: 'modifiers' });
    expect(clipboardPayloadParse(text, 'modifiers')).toEqual({ modifiers: [1, 2] });
  });

  it('rejects other types, versions and plain text', () => {
    const text = clipboardPayloadText('modifiers', {});
    expect(clipboardPayloadParse(text, 'scene-objects')).toBeNull();
    expect(clipboardPayloadParse(text.replace('"version":1', '"version":2'), 'modifiers')).toBeNull();
    expect(clipboardPayloadParse('hello', 'modifiers')).toBeNull();
    expect(clipboardPayloadParse('{"a":1}', 'modifiers')).toBeNull();
  });
});
