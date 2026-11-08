import { describe, expect, it } from 'vitest';
import { collaborationCompatibilityPolicy } from '@/collaboration/forks/policy_collaboration_compatibility.js';
import { compatibilityHomeUrl } from '@/collaboration/shared/compatibility_identity.js';
import { DialogCollaborationIncompatible } from '@/collaboration/ui/dialog_collaboration_incompatible.js';

const owner = { version: '1.2', schema: 3, caps: ['scene', 'terrain'] };

describe('owner compatibility policy hook', () => {
  it('allows compatible editors independently of fork home URL', () => {
    expect(collaborationCompatibilityPolicy({ ...owner }, owner, ['scene'])).toEqual({ allow: true });
  });
  it('refuses schema, version and missing required capabilities with bounded reasons', () => {
    expect(collaborationCompatibilityPolicy({ ...owner, schema: 4 }, owner, ['scene']).reason).toBe('schema_mismatch');
    expect(collaborationCompatibilityPolicy({ ...owner, version: '2' }, owner, ['scene']).reason).toBe(
      'version_mismatch',
    );
    expect(collaborationCompatibilityPolicy({ ...owner, caps: ['terrain'] }, owner, ['scene']).reason).toBe(
      'missing_caps',
    );
  });
  it('accepts additive capabilities without requiring identical lists', () => {
    expect(collaborationCompatibilityPolicy({ ...owner, caps: ['extra', 'scene'] }, owner, ['scene']).allow).toBe(true);
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
