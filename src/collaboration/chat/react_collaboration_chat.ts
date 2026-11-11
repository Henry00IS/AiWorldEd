import type { ActionsCollaborationChatAction } from '@/collaboration/chat/actions_collaboration_chat.js';
import { EmojiCollaborationChatPicker } from '@/collaboration/chat/emoji_collaboration_chat.js';
import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';
import type { ListCollaborationChat } from '@/collaboration/chat/list_collaboration_chat.js';
import {
  ReactionCollaborationChatLimiter,
  reactionCollaborationChatApply,
  reactionCollaborationChatParse,
} from '@/collaboration/chat/reaction_collaboration_chat.js';
import { renderCollaborationChatReactions } from '@/collaboration/chat/render_collaboration_chat_reactions.js';
import {
  SocketCollaborationError,
  type SocketCollaborationMessage,
} from '@/collaboration/net/socket_collaboration_types.js';

/** Smiling face with a plus, drawn in a 16 by 16 box. */
const REACT_COLLABORATION_CHAT_ICON =
  'M7 1.5a5.5 5.5 0 1 0 5.4 6.5h-1.5A4 4 0 1 1 7 3zM4.6 6.2a.9.9 0 1 0 0 .1zm3.2 0a.9.9 0 1 0 0 .1zM4.2 8.5a3 3 0 0 0 5.6 0zM12 1h1.4v2.1h2.1v1.4h-2.1v2.1H12V4.5H9.9V3.1H12z';
/** Space the reaction picker needs above its button before it opens below. */
const REACT_COLLABORATION_CHAT_PICKER_HEIGHT_PX = 232;

/** Relay services reactions use. */
export interface ReactCollaborationChatLink {
  /**
   * Adds or removes the own reaction on a message.
   *
   * @param id Message id.
   * @param emoji One emoji.
   * @param on True to add, false to remove.
   * @returns The relay's `chat.reaction` reply; rejects with
   *   SocketCollaborationError.
   */
  chatReact(id: number, emoji: string, on: boolean): Promise<SocketCollaborationMessage>;
  /**
   * Returns whether the relay agreed on reactions.
   *
   * @returns True when reactions can be sent.
   */
  chatReactAvailable(): boolean;
  /**
   * Returns the relay user id of this connection.
   *
   * @returns User id.
   */
  user(): number;
  /**
   * Resolves user ids of current members to display names.
   *
   * @param users User ids.
   * @returns Names of the known ones.
   */
  typingNames(users: readonly number[]): string[];
}

/**
 * Explains why the relay refused a reaction.
 *
 * @param error Error from chatReact.
 * @returns Text shown above the message field.
 */
export function reactCollaborationChatErrorText(error: unknown): string {
  if (!(error instanceof SocketCollaborationError)) return 'The reaction could not be sent. Check your connection.';
  const reason = error.details['reason'];
  if (error.code === 'chat_rate_limited') return 'Slow down: too many reactions at once.';
  if (error.code === 'chat_react_refused' && reason === 'too_many') return 'That message has too many reactions.';
  if (error.code === 'chat_react_refused' && reason === 'unsupported') return 'This server has no reactions.';
  if (error.code === 'chat_react_refused') return 'That message can no longer get reactions.';
  return `The server refused the reaction (${error.code}).`;
}

/**
 * Emoji reactions on chat messages: the Add Reaction action with its picker,
 * the pills under messages and the checked application of reactions of other
 * members.
 */
export class ReactCollaborationChat {
  private readonly list: ListCollaborationChat;
  private readonly link: ReactCollaborationChatLink;
  private readonly clock: () => number;
  private readonly notice: (text: string) => void;
  private readonly limiter: ReactionCollaborationChatLimiter;
  private readonly picker: EmojiCollaborationChatPicker;
  private readonly pickerHost: HTMLElement;
  private target: EntryCollaborationChat | null;

  /**
   * Creates the reactions of a chat list.
   *
   * @param list Message list.
   * @param link Relay services.
   * @param clock Returns the current time (epoch ms).
   * @param notice Shows why a reaction was refused.
   */
  constructor(
    list: ListCollaborationChat,
    link: ReactCollaborationChatLink,
    clock: () => number,
    notice: (text: string) => void,
  ) {
    this.list = list;
    this.link = link;
    this.clock = clock;
    this.notice = notice;
    this.limiter = new ReactionCollaborationChatLimiter();
    this.target = null;
    this.picker = new EmojiCollaborationChatPicker((emoji) => this.picked(emoji));
    this.pickerHost = document.createElement('div');
    this.pickerHost.className = 'editor-chat-react-host';
    this.pickerHost.style.cssText = 'position:absolute;width:0;height:0;z-index:3';
    this.pickerHost.append(this.picker.element);
    list.root.append(this.pickerHost);
    list.rowDecorate = (row, entry) => this.decorate(row, entry);
  }

  /**
   * Returns the Add Reaction action of the message toolbar.
   *
   * @returns Action.
   */
  action(): ActionsCollaborationChatAction {
    return {
      label: 'Add Reaction',
      icon: REACT_COLLABORATION_CHAT_ICON,
      shown: () => this.link.chatReactAvailable(),
      run: (entry) => this.pickerOpen(entry),
    };
  }

  /**
   * Adds or removes the own reaction once the relay accepts it.
   *
   * @param entry Message.
   * @param emoji Emoji.
   * @param on True to add, false to remove.
   */
  async toggle(entry: EntryCollaborationChat, emoji: string, on: boolean): Promise<void> {
    if (!this.link.chatReactAvailable()) return;
    try {
      this.received(await this.link.chatReact(entry.id, emoji, on));
    } catch (error) {
      this.notice(reactCollaborationChatErrorText(error));
    }
  }

  /**
   * Applies a reaction the relay delivered once it passes every check.
   *
   * @param message Untrusted `chat.reaction` message.
   * @returns True when the reactions changed.
   */
  received(message: SocketCollaborationMessage): boolean {
    const reaction = reactionCollaborationChatParse(message);
    if (reaction === null) return false;
    const entry = this.list.entry(reaction.id);
    if (entry === undefined || !this.limiter.admit(reaction.from, this.clock())) return false;
    if (!reactionCollaborationChatApply(entry, reaction, this.name(entry, reaction.from))) return false;
    this.list.refresh(entry.id);
    return true;
  }

  /** Closes the picker and forgets the rate of every member. */
  clear(): void {
    this.picker.openSet(false);
    this.target = null;
    this.limiter.clear();
  }

  /**
   * Returns the display name of a member who reacted, kept with the reaction so
   * it stays after the member left.
   *
   * @param entry Message.
   * @param user Relay user id.
   * @returns Display name.
   */
  private name(entry: EntryCollaborationChat, user: number): string {
    const [known] = this.link.typingNames([user]);
    if (known !== undefined) return known;
    return user === entry.from ? entry.name : 'Someone';
  }

  /**
   * Adds the reaction pills to a message row.
   *
   * @param row Message row.
   * @param entry Its message.
   */
  private decorate(row: HTMLElement, entry: EntryCollaborationChat): void {
    const pills = renderCollaborationChatReactions(entry, this.link.user(), (emoji, on) => {
      void this.toggle(entry, emoji, on);
    });
    if (pills !== null) row.append(pills);
  }

  /**
   * Opens the picker beside the hovered message's toolbar.
   *
   * @param entry Message to react to.
   */
  private pickerOpen(entry: EntryCollaborationChat): void {
    this.target = entry;
    const root = this.list.root.getBoundingClientRect();
    const bar = this.list.actions.element.getBoundingClientRect();
    const below = bar.top - root.top < REACT_COLLABORATION_CHAT_PICKER_HEIGHT_PX;
    this.pickerHost.style.right = `${Math.max(0, root.right - bar.right)}px`;
    this.pickerHost.style.top = `${(below ? bar.bottom : bar.top) - root.top}px`;
    const style = this.picker.element.style;
    style.right = '0';
    style.bottom = below ? 'auto' : '100%';
    style.top = below ? '0' : 'auto';
    style.marginBottom = below ? '0' : '4px';
    style.marginTop = below ? '4px' : '0';
    this.picker.openSet(true);
  }

  /**
   * Adds the picked emoji to the message the picker was opened for.
   *
   * @param emoji Picked emoji.
   */
  private picked(emoji: string): void {
    const target = this.target;
    this.picker.openSet(false);
    this.target = null;
    if (target === null) return;
    const own = target.reactions?.get(emoji)?.has(this.link.user()) ?? false;
    if (!own) void this.toggle(target, emoji, true);
  }
}
