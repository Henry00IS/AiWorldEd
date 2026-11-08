import { describe, expect, it } from 'vitest';
import { SyncCollaborationSession } from '@/collaboration/session/session_collaboration_sync.js';
import { HistoryCollaborationObserver } from '@/collaboration/session/session_collaboration_history.js';
import { MemberCollaborationRoster } from '@/collaboration/sync/member_collaboration_roster.js';
import { SOCKET_COLLABORATION_LIMITS_DEFAULT } from '@/collaboration/net/socket_collaboration_types.js';
import { HarnessCollaborationEditor } from '../runtime/harness_collaboration_editor.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';

/** Builds a disconnected edit loop with a real scene and collaboration host. */
function fixture() {
  const editor = new HarnessCollaborationEditor('Viewer');
  const box = editor.boxAdd('Seed');
  const sent: object[] = [];
  const transport = {
    limits: SOCKET_COLLABORATION_LIMITS_DEFAULT,
    send: (message: object) => {
      sent.push(message);
    },
    request: async () => ({ t: 'lock.result', ok: true }),
    sendBinary: () => undefined,
    sendPresence: () => true,
  };
  const sync = new SyncCollaborationSession(editor.host, transport);
  sync.replica.locks.selfSet(1);
  sync.ownerStart();
  const history = new HistoryCollaborationObserver(editor.host, sync, new MemberCollaborationRoster());
  return { editor, box, sync, sent, history };
}

describe('connection-scoped viewer boundary', () => {
  it('reverts sequential transforms, properties, creates, deletes, generators and hierarchy moves without sending', () => {
    const { editor, box, sync, sent } = fixture();
    const agreed = JSON.stringify([...sync.replica.baselines.values()].map((entry) => entry.state));
    sync.permissionSet(false);
    for (let index = 0; index < 5; index++) {
      const current = sync.replica.applier.nodes().get(box.uuid)?.object;
      if (!current) throw new Error('missing restored box');
      current.position.x += 5;
      current.name = 'Unauthorized';
      sync.commit();
      expect(current.position.x).toBe(0);
      expect(current.name).toBe('Seed');
      const added = editor.boxAdd('Unauthorized new brush');
      sync.commit();
      expect(added.parent).toBe(null);
      const generator = modifierGeneratorNodeCreate('column');
      editor.world.add(generator);
      sync.commit();
      expect(generator.parent).toBe(null);
      current.removeFromParent();
      sync.commit();
      expect(sync.replica.applier.nodes().get(box.uuid)).toBeDefined();
    }
    expect(sent).toEqual([]);
    expect(JSON.stringify([...sync.replica.baselines.values()].map((entry) => entry.state))).toBe(agreed);
    expect(sync.history.count(false)).toBe(0);
    sync.clear();
  });

  it('blocks commands and undo while allowing inspection, then admits fresh edits after a grant', () => {
    const { editor, box, sync, history, sent } = fixture();
    editor.commandStack.observerSet(history);
    sync.permissionSet(false);
    let executed = false;
    editor.commandStack.push({
      execute: () => {
        executed = true;
      },
      undo: () => undefined,
    } as never);
    expect(executed).toBe(false);
    editor.selection.selectObject(box);
    expect(editor.selection.getLastSelectedObject()).toBe(box);
    expect(editor.commandStack.undo()).toBe(false);
    expect(editor.commandStack.redo()).toBe(false);
    sync.permissionSet(true);
    box.position.x = 7;
    sync.commit();
    expect(sent.some((message) => (message as { t?: string }).t === 'edit')).toBe(true);
    expect(box.position.x).toBe(7);
    sync.clear();
  });

  it('revocation cancels local live changes and discards queued writes rather than flushing them on regrant', () => {
    const { box, sync, sent } = fixture();
    for (let index = 0; index < 45; index++) {
      box.position.x = index + 1;
      sync.commit();
    }
    const sentCount = sent.length;
    box.position.x = 1000;
    sync.permissionSet(false);
    expect(box.position.x).not.toBe(1000);
    expect(sync.canEdit()).toBe(false);
    sync.permissionSet(true);
    expect(sent.length).toBe(sentCount);
    sync.clear();
  });
});
