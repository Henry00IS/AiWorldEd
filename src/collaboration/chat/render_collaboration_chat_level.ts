import type { EntryCollaborationChatFile } from '@/collaboration/chat/entry_collaboration_chat.js';
import {
  renderCollaborationChatFile,
  renderCollaborationChatFileActions,
  renderCollaborationChatFileBoxCss,
  renderCollaborationChatFileName,
  renderCollaborationChatFileSizeLine,
} from '@/collaboration/chat/render_collaboration_chat_file.js';

/** Width of the level preview in a chat card, in CSS pixels. */
const RENDER_COLLABORATION_CHAT_LEVEL_WIDTH_PX = 296;

/** Height of the 1200 by 630 preview at the card width. */
const RENDER_COLLABORATION_CHAT_LEVEL_HEIGHT_PX = Math.round((RENDER_COLLABORATION_CHAT_LEVEL_WIDTH_PX * 630) / 1200);

/** Cards already built, so re-rendered rows do not fetch a preview again. */
const renderCollaborationChatLevelCards = new WeakMap<EntryCollaborationChatFile, HTMLElement>();

/**
 * Returns the card of a shared .aiworld file: the level thumbnail, link and
 * download buttons on hover. The preview is loaded from the transfer thumbnail
 * URL so the whole level is not downloaded just to show it.
 *
 * @param file Shared .aiworld file.
 * @returns Card element.
 */
export function renderCollaborationChatLevel(file: EntryCollaborationChatFile): HTMLElement {
  const known = renderCollaborationChatLevelCards.get(file);
  if (known !== undefined) return known;
  const card = renderCollaborationChatLevelShell(file);
  renderCollaborationChatLevelCards.set(file, card);
  return card;
}

/**
 * Builds the preview URL of a shared file (`?thumbnail`).
 *
 * @param url Download URL.
 * @returns Thumbnail URL.
 */
export function renderCollaborationChatLevelThumbnailUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}thumbnail`;
}

/**
 * Builds the card: name, preview image, size, and hover actions.
 *
 * @param file Shared file.
 * @returns Card element.
 */
function renderCollaborationChatLevelShell(file: EntryCollaborationChatFile): HTMLElement {
  const card = document.createElement('div');
  card.className = 'editor-chat-file editor-chat-file-level editor-chat-file-box';
  card.style.cssText = `${renderCollaborationChatFileBoxCss()};flex-direction:column;gap:6px;position:relative`;
  card.dataset['chatFile'] = file.link;
  const actions = renderCollaborationChatFileActions(file, true, card);
  actions.dataset['chatOverlay'] = '1';
  actions.style.cssText += ';position:absolute;top:8px;right:8px;opacity:0;transition:opacity 0.12s';
  card.addEventListener('mouseenter', () => (actions.style.opacity = '1'));
  card.addEventListener('mouseleave', () => (actions.style.opacity = '0'));
  const name = renderCollaborationChatFileName(file.name);
  name.style.paddingRight = '56px';
  card.append(
    name,
    renderCollaborationChatLevelImage(file, card),
    renderCollaborationChatFileSizeLine(file.size),
    actions,
  );
  return card;
}

/**
 * Builds the preview image that loads from `?thumbnail` and falls back to the
 * plain file card when the preview is missing.
 *
 * @param file Shared file.
 * @param card Card that holds the image.
 * @returns Image element.
 */
function renderCollaborationChatLevelImage(file: EntryCollaborationChatFile, card: HTMLElement): HTMLImageElement {
  const image = document.createElement('img');
  image.alt = `Preview of ${file.name}`;
  image.width = RENDER_COLLABORATION_CHAT_LEVEL_WIDTH_PX;
  image.height = RENDER_COLLABORATION_CHAT_LEVEL_HEIGHT_PX;
  image.style.cssText =
    `display:block;width:100%;height:${RENDER_COLLABORATION_CHAT_LEVEL_HEIGHT_PX}px;` +
    'border-radius:4px;background:#232323;object-fit:contain';
  image.src = renderCollaborationChatLevelThumbnailUrl(file.url);
  image.addEventListener('error', () => card.replaceWith(renderCollaborationChatFile(file)), { once: true });
  return image;
}
