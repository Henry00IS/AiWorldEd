import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { describe, expect, it, vi } from 'vitest';
import {
  collaborationIdentityMatches,
  COLLABORATION_EDITOR_HOME,
  COLLABORATION_EDITOR_VERSION,
} from '@/collaboration/forks/identity_collaboration_editor.js';
import { SOCKET_COLLABORATION_EDITOR_BUILD } from '@/collaboration/net/socket_collaboration_client.js';
import { compatibilityHomeUrl } from '@/collaboration/shared/compatibility_identity.js';
import { DialogCollaborationIncompatible } from '@/collaboration/ui/dialog_collaboration_incompatible.js';

/**
 * CI substitutes this module's package-derived version; the network must use it
 * too.
 */
vi.mock('@/application_identity.js', () => ({ APPLICATION_VERSION: '9.8.7' }));

describe('exact URL and real build identity', () => {
  it('requires exact home URL and real application version', () => {
    expect(COLLABORATION_EDITOR_VERSION).toBe('9.8.7');
    expect(SOCKET_COLLABORATION_EDITOR_BUILD).toBe('aiworlded-editor/9.8.7');
    expect(collaborationIdentityMatches({ homeUrl: COLLABORATION_EDITOR_HOME, version: '9.8.7' })).toBe(true);
    expect(collaborationIdentityMatches({ homeUrl: COLLABORATION_EDITOR_HOME + '/', version: '9.8.7' })).toBe(false);
    expect(collaborationIdentityMatches({ homeUrl: COLLABORATION_EDITOR_HOME, version: '1.0.0' })).toBe(false);
  });
});

describe('untrusted owner editor URLs', () => {
  it('accepts bounded HTTP(S), rejecting active schemes, credentials and malformed URLs', () => {
    expect(compatibilityHomeUrl('https://owner.invalid/editor')).toBe('https://owner.invalid/editor');
    expect(compatibilityHomeUrl('http://owner.invalid/editor')).toBe('http://owner.invalid/editor');
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//owner.invalid',
      'https://%',
      'https://user:pass@owner.invalid',
      'https://owner.invalid/' + 'x'.repeat(256),
      'https://owner.invalid/\n',
    ])
      expect(compatibilityHomeUrl(value)).toBeNull();
  });
  it('renders a plain URL and opt-in safe link, never HTML or automatic navigation', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const dialog = new DialogCollaborationIncompatible(host, 'Incompatible', 'https://owner.invalid/editor');
    void dialog.open();
    const link = host.querySelector('a');
    expect(link?.href).toBe('https://owner.invalid/editor');
    expect(link?.style.color).toBe(hexToRgb(Theme.selectionColor));
    link?.dispatchEvent(new MouseEvent('mouseover'));
    expect(link?.style.color).toBe(hexToRgb(Theme.selectionColor));
    expect(link?.rel).toBe('noopener noreferrer');
    expect(host.textContent).toContain('room owner');
    expect(host.textContent).toContain('https://owner.invalid/editor');
    dialog.dispose();
    host.remove();
  });
  it('rejects an executable URL and displays owner text only through textContent', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const dialog = new DialogCollaborationIncompatible(host, '<img src=x onerror=alert(1)>', 'javascript:alert(1)');
    void dialog.open();
    expect(host.querySelector('a')).toBeNull();
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('<img');
    dialog.dispose();
    host.remove();
  });
});
