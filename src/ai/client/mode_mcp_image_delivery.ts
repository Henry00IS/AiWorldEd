import { MCP_SETTINGS_SELECT_STYLE, mcpSettingsStorage } from './settings_mcp.js';
import type { McpServerMode } from './mode_mcp_server.js';

/**
 * How capture_view images reach the MCP client: inline JPEG, a lossless PNG
 * link served by the local MCP host, or a lossless PNG link on the relay.
 */
export type McpImageDelivery = 'embed' | 'localhost' | 'public';

/** Settings key of the delivery mode. */
export const MCP_IMAGE_DELIVERY_KEY = 'aiworlded.mcp.imageDelivery';

/** Delivery modes with their labels and descriptions, in menu order. */
export const MCP_IMAGE_DELIVERY_CHOICES: readonly {
  value: McpImageDelivery;
  label: string;
  description: string;
  descriptionBrowser?: string;
}[] = [
  {
    value: 'public',
    label: 'Online Link (PNG, Recommended)',
    description:
      'Full-quality image the AI downloads from a temporary public link. Falls back to embedding when offline.',
    descriptionBrowser: 'Full-quality image the AI downloads from a temporary public link.',
  },
  {
    value: 'embed',
    label: 'Embed in Response (JPEG)',
    description: "Smaller compressed image inside the reply. For AI that can't download images.",
  },
  {
    value: 'localhost',
    label: 'Local Link (PNG)',
    description: 'Full-quality image served by the local MCP server. Only works when the AI runs on this computer.',
  },
];

/**
 * Whether Local Link delivery is available: the desktop app with the local MCP
 * server.
 *
 * @param desktop Whether the desktop MCP bridge is present.
 * @param serverMode Selected server mode.
 * @returns True when Local Link can be offered.
 */
export function mcpImageDeliveryLocalAvailable(desktop: boolean, serverMode: McpServerMode): boolean {
  return desktop && serverMode === 'local';
}

/**
 * Delivery modes offered in the menu for the current host.
 *
 * @param localAvailable Whether Local Link can be offered.
 * @returns Menu choices.
 */
export function mcpImageDeliveryChoices(
  localAvailable: boolean,
): readonly { value: McpImageDelivery; label: string; description: string }[] {
  return localAvailable
    ? MCP_IMAGE_DELIVERY_CHOICES
    : MCP_IMAGE_DELIVERY_CHOICES.filter((choice) => choice.value !== 'localhost');
}

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
 * Delivery mode to show in the menu. Online links when Local Link is stored but
 * not available. Does not change the stored preference.
 *
 * @param localAvailable Whether Local Link can be offered.
 * @param storage Settings storage.
 * @returns Delivery mode to display.
 */
export function mcpImageDeliveryShown(localAvailable: boolean, storage = mcpSettingsStorage()): McpImageDelivery {
  const stored = mcpImageDeliveryGet(storage);
  return stored === 'localhost' && !localAvailable ? 'public' : stored;
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
 * Fills the delivery mode menu for the current host without writing storage.
 *
 * @param select Delivery select element.
 * @param localAvailable Whether Local Link can be offered.
 */
function mcpImageDeliverySelectFill(select: HTMLSelectElement, localAvailable: boolean): void {
  const selected = mcpImageDeliveryShown(localAvailable);
  select.replaceChildren();
  for (const choice of mcpImageDeliveryChoices(localAvailable)) select.add(new Option(choice.label, choice.value));
  select.value = selected;
}

/**
 * Creates the delivery mode menu; changes are stored right away.
 *
 * @param localAvailable Whether Local Link can be offered.
 * @returns Select element.
 */
export function mcpImageDeliverySelect(localAvailable: boolean): HTMLSelectElement {
  const select = document.createElement('select');
  select.dataset['mcpField'] = 'image-delivery';
  mcpImageDeliverySelectFill(select, localAvailable);
  select.addEventListener('change', () => mcpImageDeliverySet(select.value as McpImageDelivery));
  select.style.cssText = MCP_SETTINGS_SELECT_STYLE;
  return select;
}

/**
 * Returns the description of a delivery mode for the current build.
 *
 * @param value Delivery mode.
 * @param desktop Whether the desktop MCP bridge is present.
 * @returns One-line description.
 */
export function mcpImageDeliveryDescription(value: McpImageDelivery, desktop: boolean): string {
  const choice = MCP_IMAGE_DELIVERY_CHOICES.find((item) => item.value === value);
  if (!choice) return '';
  return desktop ? choice.description : (choice.descriptionBrowser ?? choice.description);
}

/**
 * Creates the delivery mode menu with the selected mode's description below it.
 *
 * @param localAvailable Whether Local Link can be offered.
 * @param desktop Whether the desktop MCP bridge is present.
 * @returns Field element.
 */
export function mcpImageDeliveryField(localAvailable: boolean, desktop: boolean): HTMLElement {
  const field = document.createElement('div');
  const select = mcpImageDeliverySelect(localAvailable);
  const note = document.createElement('div');
  note.dataset['mcpField'] = 'image-delivery-description';
  note.style.cssText = 'margin-top:6px;font-size:11px;line-height:1.4;color:#9a9a9a';
  note.textContent = mcpImageDeliveryDescription(select.value as McpImageDelivery, desktop);
  select.addEventListener('change', () => {
    note.textContent = mcpImageDeliveryDescription(select.value as McpImageDelivery, desktop);
  });
  field.append(select, note);
  return field;
}

/**
 * Replaces the delivery menu options when Local Link availability changes. A
 * stored Local Link preference is kept when the option is hidden.
 *
 * @param field Field returned by {@link mcpImageDeliveryField}.
 * @param localAvailable Whether Local Link can be offered.
 * @param desktop Whether the desktop MCP bridge is present.
 */
export function mcpImageDeliveryFieldSync(field: HTMLElement, localAvailable: boolean, desktop: boolean): void {
  const select = field.querySelector<HTMLSelectElement>('[data-mcp-field="image-delivery"]');
  const note = field.querySelector<HTMLElement>('[data-mcp-field="image-delivery-description"]');
  if (!select || !note) return;
  mcpImageDeliverySelectFill(select, localAvailable);
  note.textContent = mcpImageDeliveryDescription(select.value as McpImageDelivery, desktop);
}
