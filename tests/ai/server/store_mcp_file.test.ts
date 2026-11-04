// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { STORE_MCP_FILE_LIFETIME_MS, StoreMcpFile } from '@/ai/server/store_mcp_file.js';

const ORIGIN = 'http://127.0.0.1:3845';

/** Loopback capture links of the localhost image delivery mode. */
describe('store_mcp_file', () => {
  it('turns result files into links and serves them with headers', async () => {
    const store = new StoreMcpFile();
    const result = store.publish(
      { ok: true, message: 'Captured view', files: [{ mimeType: 'image/png', data: btoa('png!') }] },
      ORIGIN,
    );
    expect(result.files).toBeUndefined();
    const link = result.links?.[0] ?? '';
    expect(link).toMatch(/^http:\/\/127\.0\.0\.1:3845\/transfer\/[A-Za-z0-9_-]{43}$/);
    expect(result.message).toContain(link);
    const response = store.serve(new Request(link));
    expect(response?.status).toBe(200);
    expect(response?.headers.get('content-type')).toBe('image/png');
    expect(response?.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response?.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response?.text()).toBe('png!');
    const head = store.serve(new Request(link, { method: 'HEAD' }));
    expect(head?.headers.get('content-length')).toBe('4');
  });

  it('ignores other paths and answers 404 for unknown or expired ids', () => {
    let now = 0;
    const store = new StoreMcpFile(() => now);
    expect(store.serve(new Request(`${ORIGIN}/mcp`))).toBeNull();
    expect(store.serve(new Request(`${ORIGIN}/transfer/nope`))?.status).toBe(404);
    const link = store.publish({ ok: true, message: '', files: [{ mimeType: 'image/png', data: 'AA==' }] }, ORIGIN)
      .links?.[0];
    now += STORE_MCP_FILE_LIFETIME_MS;
    expect(store.serve(new Request(link ?? ''))?.status).toBe(404);
  });

  it('passes results without files through', () => {
    expect(new StoreMcpFile().publish({ ok: true, message: 'm' }, ORIGIN)).toEqual({ ok: true, message: 'm' });
  });
});
