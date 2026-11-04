import { describe, expect, it, vi } from 'vitest';
import { deliveryMcpCapture, deliveryMcpCaptureBlob } from '@/ai/client/delivery_mcp_capture.js';
import {
  MCP_IMAGE_DELIVERY_KEY,
  mcpImageDeliveryField,
  mcpImageDeliveryGet,
  mcpImageDeliverySelect,
  mcpImageDeliverySet,
} from '@/ai/client/mode_mcp_image_delivery.js';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

/**
 * Fake capture_view that reports the format it was asked for.
 *
 * @param args Tool arguments.
 * @returns Result with one image.
 */
function capture(args: Record<string, unknown>): McpToolResult {
  const mimeType = args['lossless'] === true ? 'image/png' : 'image/jpeg';
  return { ok: true, message: 'Captured view', images: [{ mimeType, data: btoa('img') }] };
}

/** Capture_view delivery modes, the public link fallback and the stored mode. */
describe('delivery_mcp_capture', () => {
  it('embeds a JPEG in embed mode even when the client asks for lossless', async () => {
    const result = await deliveryMcpCapture('embed', null, { lossless: true }, capture);
    expect(result.images?.[0]?.mimeType).toBe('image/jpeg');
    expect(result.files).toBeUndefined();
  });

  it('hands a lossless PNG to the local host in localhost mode', async () => {
    const result = await deliveryMcpCapture('localhost', null, {}, capture);
    expect(result.images).toBeUndefined();
    expect(result.files?.[0]?.mimeType).toBe('image/png');
  });

  it('shares a lossless PNG through the relay in public mode', async () => {
    const share = vi.fn(async () => 'https://relay.test/ws/transfer/abc');
    const result = await deliveryMcpCapture('public', { available: () => true, share }, {}, capture);
    expect(result.links).toEqual(['https://relay.test/ws/transfer/abc']);
    expect(result.message).toContain('https://relay.test/ws/transfer/abc');
    expect(result.images).toBeUndefined();
    expect(share).toHaveBeenCalledWith(expect.any(Blob), 'capture.png');
  });

  it('falls back to an embedded JPEG when the relay is unavailable or the share fails', async () => {
    const offline = await deliveryMcpCapture('public', { available: () => false, share: vi.fn() }, {}, capture);
    expect(offline.images?.[0]?.mimeType).toBe('image/jpeg');
    expect(offline.warnings?.[0]).toContain('Relay unavailable');
    const failing = { available: () => true, share: vi.fn(async () => Promise.reject(new Error('x'))) };
    const failed = await deliveryMcpCapture('public', failing, {}, capture);
    expect(failed.images?.[0]?.mimeType).toBe('image/jpeg');
    expect(await deliveryMcpCapture('public', null, {}, capture)).toMatchObject({ ok: true });
  });

  it('keeps failed captures unchanged', async () => {
    const result = await deliveryMcpCapture('localhost', null, {}, () => ({ ok: false, message: 'no scene' }));
    expect(result).toEqual({ ok: false, message: 'no scene' });
  });

  it('decodes the image payload into a typed blob', async () => {
    const blob = deliveryMcpCaptureBlob({ mimeType: 'image/png', data: btoa('abc') });
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(3);
  });

  it('stores the mode and defaults to online links', () => {
    localStorage.removeItem(MCP_IMAGE_DELIVERY_KEY);
    expect(mcpImageDeliveryGet()).toBe('public');
    localStorage.setItem(MCP_IMAGE_DELIVERY_KEY, 'bogus');
    expect(mcpImageDeliveryGet()).toBe('public');
    mcpImageDeliverySet('embed');
    expect(mcpImageDeliveryGet()).toBe('embed');
    mcpImageDeliverySet('public');
    expect(mcpImageDeliveryGet()).toBe('public');
    const select = mcpImageDeliverySelect();
    expect(select.value).toBe('public');
    select.value = 'localhost';
    select.dispatchEvent(new Event('change'));
    expect(localStorage.getItem(MCP_IMAGE_DELIVERY_KEY)).toBe('localhost');
  });

  it('describes the selected mode under the menu', () => {
    mcpImageDeliverySet('embed');
    const field = mcpImageDeliveryField();
    const select = field.querySelector('select') as HTMLSelectElement;
    const note = field.querySelector('[data-mcp-field="image-delivery-description"]') as HTMLElement;
    expect(note.textContent).toContain('Works without a connection');
    select.value = 'localhost';
    select.dispatchEvent(new Event('change'));
    expect(note.textContent).toContain('Only works when the AI runs on this computer');
  });
});
