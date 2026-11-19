import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_AUDIT_COMMANDS, solidScriptAuditScript } from './solid_script_audit_lines.js';
import { solidScriptAuditFuzz } from './solid_script_audit_fuzz.js';
import { solidScriptAuditUnsound } from './solid_script_audit_probe.js';

describe("the editor's kinds always include what a run holds", () => {
  it.each(SOLID_SCRIPT_AUDIT_COMMANDS)('%s writes what it declares', (_id, command) => {
    expect(solidScriptAuditUnsound(solidScriptAuditScript(command).lines)).toEqual([]);
  });
});

describe("the editor's kinds include what a run holds in random scripts", { timeout: 60_000 }, () => {
  const seeds = Array.from({ length: 1500 }, (_, index) => index + 1);
  it('holds for every seed', () => {
    const failures: string[] = [];
    for (const seed of seeds) {
      const lines = solidScriptAuditFuzz(seed);
      const problems = solidScriptAuditUnsound(lines);
      if (problems.length > 0) failures.push(`seed ${seed}: ${problems.join('; ')}\n${JSON.stringify(lines)}`);
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });
});
