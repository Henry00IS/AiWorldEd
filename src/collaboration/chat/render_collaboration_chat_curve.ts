import type { EntryCollaborationChatFile } from '@/collaboration/chat/entry_collaboration_chat.js';
import {
  renderCollaborationChatFile,
  renderCollaborationChatFileActions,
  renderCollaborationChatFileBoxCss,
  renderCollaborationChatFileName,
  renderCollaborationChatFileSizeLine,
} from '@/collaboration/chat/render_collaboration_chat_file.js';
import { CURVE_FILE_MAX_BYTES, curveFileRead } from '@/curve/model/curve_file.js';
import type { Curve } from '@/curve/model/curve_model.js';
import { curveDrawGraph } from '@/curve/ui/curve_draw_graph.js';
import { curveDragSet } from '@/curve/ui/curve_drag.js';
import { CURVE_UI_STRIP_HEIGHT_PX } from '@/curve/ui/curve_ui_style.js';

/** Marks drags that start in the chat, so dropping them back sends nothing. */
export const RENDER_COLLABORATION_CHAT_ORIGIN_DRAG_TYPE = 'application/x-aiworlded-chat-origin';

/** Width of the curve preview in a chat card, in CSS pixels. */
const RENDER_COLLABORATION_CHAT_CURVE_WIDTH_PX = 296;

/** Height of the curve preview: twice the inspector strip. */
const RENDER_COLLABORATION_CHAT_CURVE_HEIGHT_PX = CURVE_UI_STRIP_HEIGHT_PX * 2;

/** Cards already built, so re-rendered rows do not fetch a curve again. */
const renderCollaborationChatCurveCards = new WeakMap<EntryCollaborationChatFile, HTMLElement>();

/** A curve card's loaded file, once its text has arrived. */
interface RenderCollaborationChatCurveLoaded {
  text: string;
  curve: Curve;
}

/**
 * Returns the card of a shared .aicurve file: the curve as the curve editor
 * draws it, link and download buttons on hover, and draggable onto curve fields
 * like a project file.
 *
 * @param file Shared .aicurve file.
 * @param fetcher Fetch function.
 * @returns Card element.
 */
export function renderCollaborationChatCurve(
  file: EntryCollaborationChatFile,
  fetcher: (url: string) => Promise<Response> = fetch,
): HTMLElement {
  const known = renderCollaborationChatCurveCards.get(file);
  if (known !== undefined) return known;
  if (file.size > CURVE_FILE_MAX_BYTES) return renderCollaborationChatFile(file);
  const card = renderCollaborationChatCurveShell(file);
  const canvas = card.querySelector('canvas');
  let loaded: RenderCollaborationChatCurveLoaded | null = null;
  card.addEventListener('dragstart', (event) => renderCollaborationChatCurveDrag(event, file, loaded));
  void renderCollaborationChatCurveLoad(file, fetcher).then((result) => {
    if (result === null) return void card.replaceWith(renderCollaborationChatFile(file));
    loaded = result;
    if (canvas)
      curveDrawGraph(
        canvas,
        result.curve,
        RENDER_COLLABORATION_CHAT_CURVE_WIDTH_PX,
        RENDER_COLLABORATION_CHAT_CURVE_HEIGHT_PX,
      );
  });
  renderCollaborationChatCurveCards.set(file, card);
  return card;
}

/**
 * Builds the card without its curve: name, size, hover actions and an empty
 * preview canvas.
 *
 * @param file Shared file.
 * @returns Card element.
 */
function renderCollaborationChatCurveShell(file: EntryCollaborationChatFile): HTMLElement {
  const card = document.createElement('div');
  card.className = 'editor-chat-file editor-chat-file-curve editor-chat-file-box';
  card.style.cssText = `${renderCollaborationChatFileBoxCss()};flex-direction:column;gap:6px;position:relative;cursor:grab`;
  card.dataset['chatFile'] = file.link;
  card.draggable = true;
  card.title = `${file.name}: drag onto a curve field to use it`;
  const actions = renderCollaborationChatFileActions(file, true, card);
  actions.dataset['chatOverlay'] = '1';
  actions.style.cssText += ';position:absolute;top:8px;right:8px;opacity:0;transition:opacity 0.12s';
  card.addEventListener('mouseenter', () => (actions.style.opacity = '1'));
  card.addEventListener('mouseleave', () => (actions.style.opacity = '0'));
  const name = renderCollaborationChatFileName(file.name);
  name.style.paddingRight = '56px';
  card.append(name, renderCollaborationChatCurveCanvas(), renderCollaborationChatFileSizeLine(file.size), actions);
  return card;
}

/**
 * Builds the empty preview canvas at screen density.
 *
 * @returns Canvas.
 */
function renderCollaborationChatCurveCanvas(): HTMLCanvasElement {
  const ratio = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(RENDER_COLLABORATION_CHAT_CURVE_WIDTH_PX * ratio);
  canvas.height = Math.round(RENDER_COLLABORATION_CHAT_CURVE_HEIGHT_PX * ratio);
  canvas.style.cssText = `display:block;width:100%;height:${RENDER_COLLABORATION_CHAT_CURVE_HEIGHT_PX}px;border-radius:4px;background:#1b1b1b`;
  return canvas;
}

/**
 * Downloads and reads a shared curve.
 *
 * @param file Shared file.
 * @param fetcher Fetch function.
 * @returns Text and curve, or null when it cannot be read.
 */
async function renderCollaborationChatCurveLoad(
  file: EntryCollaborationChatFile,
  fetcher: (url: string) => Promise<Response>,
): Promise<RenderCollaborationChatCurveLoaded | null> {
  try {
    const response = await fetcher(file.url);
    if (!response.ok) return null;
    const text = await response.text();
    const result = curveFileRead(text);
    return 'error' in result ? null : { text, curve: result.curve };
  } catch {
    return null;
  }
}

/**
 * Starts dragging a chat curve: curve fields take it, the chat ignores it.
 *
 * @param event Drag start.
 * @param file Shared file.
 * @param loaded Loaded curve, or null while it is still downloading.
 */
function renderCollaborationChatCurveDrag(
  event: DragEvent,
  file: EntryCollaborationChatFile,
  loaded: RenderCollaborationChatCurveLoaded | null,
): void {
  if (!event.dataTransfer) return;
  if (loaded === null) return void event.preventDefault();
  curveDragSet(event.dataTransfer, { name: file.name, text: loaded.text });
  event.dataTransfer.setData(RENDER_COLLABORATION_CHAT_ORIGIN_DRAG_TYPE, file.link);
}
