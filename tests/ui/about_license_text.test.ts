import { describe, it, expect } from 'vitest';
import {
  HENRYS_TOOLS_DISCORD_URL,
  PROJECT_DISPLAY_NAME,
  getAboutLicenseText
} from '../../src/ui/about_license_text.js';

describe('about_license_text', () => {
  it('should expose the project display name', () => {
    expect(PROJECT_DISPLAY_NAME).toBe('AI World Editor');
  });

  it('should expose the Henry\'s Tools Discord invite URL', () => {
    expect(HENRYS_TOOLS_DISCORD_URL).toBe('https://discord.gg/sKEvrBwHtq');
  });

  it('should combine Chisel, RealtimeCSG, and SabreCSG MIT licenses', () => {
    const text = getAboutLicenseText();
    expect(text).toContain('=== Chisel Editor (MIT) ===');
    expect(text).toContain('=== RealtimeCSG (MIT) ===');
    expect(text).toContain('=== SabreCSG (MIT) ===');
    expect(text).toContain('Permission is hereby granted, free of charge');
    expect(text).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
  });
});
