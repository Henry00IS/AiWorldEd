import { describe, expect, it } from 'vitest';
import {
  buildElectrobunPortableFileName,
  buildElectrobunUpdateJsonFileName,
  buildElectrobunUpdateJsonV2FileName,
  buildPublicPortableFileName,
  buildPublicSetupFileName,
  isElectrobunUpdaterArtifactKind,
  parseElectrobunArtifactFileName,
  toPublicReleasePlatform,
} from '@/desktop/release_asset_naming.js';

describe('desktop release asset naming', () => {
  it('builds versioned public Setup names for human downloads', () => {
    expect(buildPublicSetupFileName('1.0.42', 'win', 'x64')).toBe('AiWorldEd-1.0.42-Win-x64-Setup.zip');
    expect(buildPublicSetupFileName('1.0.42', 'linux', 'x64')).toBe('AiWorldEd-1.0.42-Linux-x64-Setup.zip');
    expect(buildPublicSetupFileName('1.0.42', 'macos', 'arm64')).toBe('AiWorldEd-1.0.42-MacOS-arm64-Setup.zip');
  });

  it('documents portable naming helpers without requiring a second published copy', () => {
    expect(buildPublicPortableFileName('1.0.42', 'linux', 'x64')).toBe('AiWorldEd-1.0.42-Linux-x64-Portable.tar.zst');
    expect(buildPublicPortableFileName('1.0.42', 'macos', 'arm64')).toBe(
      'AiWorldEd-1.0.42-MacOS-arm64-Portable.tar.zst',
    );
  });

  it('keeps Electrobun auto-update file names stable for every platform', () => {
    expect(buildElectrobunUpdateJsonFileName('stable', 'win', 'x64')).toBe('stable-win-x64-update.json');
    expect(buildElectrobunUpdateJsonFileName('stable', 'linux', 'x64')).toBe('stable-linux-x64-update.json');
    expect(buildElectrobunUpdateJsonFileName('stable', 'macos', 'arm64')).toBe('stable-macos-arm64-update.json');
    expect(buildElectrobunUpdateJsonV2FileName('stable', 'win', 'x64')).toBe('stable-win-x64-update-v2.json');
    expect(buildElectrobunPortableFileName('stable', 'win', 'x64')).toBe('stable-win-x64-AiWorldEd.tar.zst');
    expect(buildElectrobunPortableFileName('stable', 'linux', 'x64')).toBe('stable-linux-x64-AiWorldEd.tar.zst');
    expect(buildElectrobunPortableFileName('stable', 'macos', 'arm64')).toBe(
      'stable-macos-arm64-AiWorldEd.app.tar.zst',
    );
  });

  it('parses Electrobun artifact kinds and marks patches as droppable', () => {
    expect(parseElectrobunArtifactFileName('stable-win-x64-AiWorldEd-Setup.zip')).toMatchObject({
      os: 'win',
      arch: 'x64',
      kind: 'setup',
    });
    expect(parseElectrobunArtifactFileName('stable-linux-x64-AiWorldEd-Setup.tar.gz')).toMatchObject({
      kind: 'setup',
    });
    expect(parseElectrobunArtifactFileName('stable-linux-x64-AiWorldEd.tar.zst')).toMatchObject({
      kind: 'portable',
    });
    expect(parseElectrobunArtifactFileName('stable-macos-arm64-AiWorldEd.app.tar.zst')).toMatchObject({
      kind: 'portable',
      os: 'macos',
      arch: 'arm64',
    });
    expect(parseElectrobunArtifactFileName('stable-win-x64-update.json')).toMatchObject({
      kind: 'update-json',
    });
    expect(parseElectrobunArtifactFileName('stable-win-x64-update-v2.json')).toMatchObject({
      kind: 'update-json',
    });
    expect(parseElectrobunArtifactFileName('stable-win-x64-1a42wpx0i4p0k.patch')).toMatchObject({
      kind: 'patch',
    });
    expect(isElectrobunUpdaterArtifactKind('patch')).toBe(false);
    expect(isElectrobunUpdaterArtifactKind('portable')).toBe(true);
    expect(isElectrobunUpdaterArtifactKind('update-json')).toBe(true);
  });

  it('parses stable installers, which carry no channel prefix, as the stable channel', () => {
    expect(parseElectrobunArtifactFileName('win-x64-AiWorldEd-Setup.zip')).toMatchObject({
      channel: 'stable',
      os: 'win',
      arch: 'x64',
      kind: 'setup',
    });
    expect(parseElectrobunArtifactFileName('linux-x64-AiWorldEd-Setup.tar.gz')).toMatchObject({
      channel: 'stable',
      os: 'linux',
      kind: 'setup',
    });
    expect(parseElectrobunArtifactFileName('canary-win-x64-AiWorldEd-Setup-canary.zip')).toMatchObject({
      channel: 'canary',
      kind: 'setup',
    });
  });

  it('maps Electrobun OS tokens to public platform labels', () => {
    expect(toPublicReleasePlatform('win')).toBe('Win');
    expect(toPublicReleasePlatform('linux')).toBe('Linux');
    expect(toPublicReleasePlatform('macos')).toBe('MacOS');
  });
});
