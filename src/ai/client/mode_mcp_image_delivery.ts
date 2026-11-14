import { MCP_SETTINGS_SELECT_STYLE, mcpSettingsStorage } from './settings_mcp.js';

/**
 * How capture_view images reach the MCP client: inline JPEG, a lossless PNG
 * link served by the local MCP host, or a lossless PNG link on the relay.
 */
export type McpImageDelivery = 'embed' | 'localhost' | 'public';

/** Settings key of the delivery mode. */
export const MCP_IMAGE_DELIVERY_KEY = 'aiworlded.mcp.imageDelivery';

/** Delivery modes with their labels and descriptions, in menu order. */
export const MCP_IMAGE_DELIVERY_CHOICES: readonly { value: McpImageDelivery; label: string; description: string }[] = [
  {
    value: 'public',
    label: 'Online Link (PNG, Recommended)',
    description:
      'Full-quality image the AI downloads from a temporary public link. Falls back to embedding when offline.',
  },
  {
    value: 'embed',
    label: 'Embed in Response (JPEG)',
    description: 'Smaller compressed image inside the reply. Works without a connection.',
  },
  {
    value: 'localhost',
    label: 'Local Link (PNG)',
    description: 'Full-quality image served by the local MCP server. Only works when the AI runs on this computer.',
  },
];

/**
 * Returns the stored delivery mode; online links when unset or unknown.
 *
 * @param storage Settings storage.
 * @returns Delivery mode.
 */
export function mcpImageDeliveryGet(storage = mcpSettingsStorage()): McpImageDelivery {
  const stored = storage?.getItem(MCP_IMAGE_DELIVERY_KEY);
  return MCP_IMAGE_DELIVERY_CHOICES.find((choice) => choice.value === stored)?.value ?? 'public';
}

/**
 * Stores the delivery mode.
 *
 * @param value Delivery mode.
 * @param storage Settings storage.
 */
export function mcpImageDeliverySet(value: McpImageDelivery, storage = mcpSettingsStorage()): void {
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
  select.style.cssText = MCP_SETTINGS_SELECT_STYLE;
  return select;
}

/**
 * Returns the description of a delivery mode.
 *
 * @param value Delivery mode.
 * @returns One-line description.
 */
export function mcpImageDeliveryDescription(value: McpImageDelivery): string {
  return MCP_IMAGE_DELIVERY_CHOICES.find((choice) => choice.value === value)?.description ?? '';
}

/**
 * Creates the delivery mode menu with the selected mode's description below it.
 *
 * @returns Field element.
 */
export function mcpImageDeliveryField(): HTMLElement {
  const field = document.createElement('div');
  const select = mcpImageDeliverySelect();
  const note = document.createElement('div');
  note.dataset['mcpField'] = 'image-delivery-description';
  note.style.cssText = 'margin-top:6px;font-size:11px;line-height:1.4;color:#9a9a9a';
  note.textContent = mcpImageDeliveryDescription(select.value as McpImageDelivery);
  select.addEventListener('change', () => {
    note.textContent = mcpImageDeliveryDescription(select.value as McpImageDelivery);
  });
  field.append(select, note);
  return field;
}
