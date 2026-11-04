/**
 * How capture_view images reach the MCP client: inline JPEG, a lossless PNG
 * link served by the local MCP host, or a lossless PNG link on the relay.
 */
export type McpImageDelivery = 'embed' | 'localhost' | 'public';

/** Settings key of the delivery mode. */
export const MCP_IMAGE_DELIVERY_KEY = 'aiworlded.mcp.imageDelivery';

/** Delivery modes with their labels, in menu order. */
export const MCP_IMAGE_DELIVERY_CHOICES: readonly { value: McpImageDelivery; label: string }[] = [
  { value: 'embed', label: 'Embed images (JPEG)' },
  { value: 'localhost', label: 'Localhost links (PNG)' },
  { value: 'public', label: 'Public links via relay (PNG)' },
];

/** Settings storage surface. */
export type McpImageDeliveryStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Returns the browser storage when available.
 *
 * @returns Local storage, or null.
 */
function mcpImageDeliveryStorage(): McpImageDeliveryStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Returns the stored delivery mode; embed when unset or unknown.
 *
 * @param storage Settings storage.
 * @returns Delivery mode.
 */
export function mcpImageDeliveryGet(storage = mcpImageDeliveryStorage()): McpImageDelivery {
  const stored = storage?.getItem(MCP_IMAGE_DELIVERY_KEY);
  return MCP_IMAGE_DELIVERY_CHOICES.find((choice) => choice.value === stored)?.value ?? 'embed';
}

/**
 * Stores the delivery mode.
 *
 * @param value Delivery mode.
 * @param storage Settings storage.
 */
export function mcpImageDeliverySet(value: McpImageDelivery, storage = mcpImageDeliveryStorage()): void {
  storage?.setItem(MCP_IMAGE_DELIVERY_KEY, value);
}

/**
 * Creates the delivery mode menu; changes are stored right away.
 *
 * @returns Select element.
 */
export function mcpImageDeliverySelect(): HTMLSelectElement {
  const select = document.createElement('select');
  select.dataset['mcpField'] = 'image-delivery';
  for (const choice of MCP_IMAGE_DELIVERY_CHOICES) select.add(new Option(choice.label, choice.value));
  select.value = mcpImageDeliveryGet();
  select.addEventListener('change', () => mcpImageDeliverySet(select.value as McpImageDelivery));
  select.style.cssText =
    'width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:#1b1b1b;color:#e8e8e8;font-size:12px';
  return select;
}
