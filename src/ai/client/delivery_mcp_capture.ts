import type { McpImageDelivery } from './mode_mcp_image_delivery.js';
import type { McpImagePayload, McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

/** Shares a file as a public relay link. */
export interface McpImagePublisher {
  /**
   * Returns whether links can be created right now.
   *
   * @returns True when the relay connection is up.
   */
  available(): boolean;
  /**
   * Shares a file.
   *
   * @param file File bytes.
   * @param name File name.
   * @returns Public download URL.
   */
  share(file: Blob, name: string): Promise<string>;
}

/** File name of a capture shared as a link. */
const DELIVERY_MCP_CAPTURE_NAME = 'capture.png';

/**
 * Runs capture_view and delivers its image the chosen way. Link modes render a
 * lossless PNG; public links fall back to an embedded JPEG when the relay is
 * unavailable.
 *
 * @param mode Delivery mode.
 * @param publisher Relay link publisher, or null.
 * @param args Tool arguments from the MCP client.
 * @param invoke Runs capture_view with the given arguments.
 * @returns Tool result.
 */
export async function deliveryMcpCapture(
  mode: McpImageDelivery,
  publisher: McpImagePublisher | null,
  args: Record<string, unknown>,
  invoke: (args: Record<string, unknown>) => McpToolResult,
): Promise<McpToolResult> {
  const embed = (): McpToolResult => invoke({ ...args, lossless: false });
  if (mode === 'embed') return embed();
  if (mode === 'public' && publisher?.available() !== true) return deliveryMcpCaptureFallback(embed());
  const result = invoke({ ...args, lossless: true });
  const image = result.images?.[0];
  if (!result.ok || image === undefined) return result;
  const { images: _images, ...rest } = result;
  if (mode === 'localhost' || publisher === null) return { ...rest, files: [image] };
  try {
    const url = await publisher.share(deliveryMcpCaptureBlob(image), DELIVERY_MCP_CAPTURE_NAME);
    return { ...rest, links: [url], message: `${rest.message}\nImage (PNG, expires in 1 hour): ${url}` };
  } catch {
    return deliveryMcpCaptureFallback(embed());
  }
}

/**
 * Marks an embedded capture that replaced a public link.
 *
 * @param result Embedded capture result.
 * @returns Result with a warning.
 */
function deliveryMcpCaptureFallback(result: McpToolResult): McpToolResult {
  const warning = 'Relay unavailable: the image is embedded as JPEG instead of a public link.';
  return { ...result, warnings: [...(result.warnings ?? []), warning] };
}

/**
 * Decodes a base64 image payload.
 *
 * @param image Image payload.
 * @returns Blob with the image type.
 */
export function deliveryMcpCaptureBlob(image: McpImagePayload): Blob {
  const binary = atob(image.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: image.mimeType });
}
