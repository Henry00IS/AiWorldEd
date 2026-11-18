import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentNames,
  solidScriptDocumentNamesAt,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptSentence, solidScriptSentencePlain } from '@/solid_script/language/solid_script_sentence.js';
import { solidScriptExplorerEntries } from '@/solid_script/ui/solid_script_editor_explorer.js';
import { SOLID_SCRIPT_AUDIT_COMMANDS, solidScriptAuditScript } from './solid_script_audit_lines.js';
import { solidScriptAuditFuzz } from './solid_script_audit_fuzz.js';

/**
 * Checks that the hint of every name, at every line, tells the kinds the
 * analysis found there, each with the line of a write that reaches, and that
 * the Variables tab tells the same as the hint at the end of the script.
 *
 * @param lines Lines.
 * @returns Disagreements in plain words.
 */
function disagreements(lines: readonly SolidScriptLine[]): string[] {
  const document = solidScriptDocumentCreate([...lines]);
  const problems: string[] = [];
  for (let position = 0; position <= lines.length; position++) {
    for (const entry of solidScriptDocumentNamesAt(document, position)) {
      const where = `line ${position + 1}, ${entry.name}`;
      const kinds = entry.kinds ?? [];
      if (kinds.length > 0 && entry.reaches === undefined)
        problems.push(`${where}: kinds ${kinds.join('|')} but no hint`);
      const reaches = entry.reaches ?? '';
      const sentences = reaches.split(/(?<=\)\.)\s+/).filter((sentence) => sentence !== '');
      const told = new Set(sentences.flatMap((sentence) => (/^([^:]+):/.exec(sentence)?.[1] ?? '').split(' or ')));
      for (const kind of kinds) if (!told.has(kind)) problems.push(`${where}: ${kind} missing from "${reaches}"`);
      for (const kind of told)
        if (!kinds.includes(kind)) problems.push(`${where}: "${reaches}" tells ${kind}, the analysis does not`);
      const shown = sentences.map((sentence) => Number(/\(line (\d+)\)\.$/.exec(sentence)?.[1] ?? 0) - 1);
      if (JSON.stringify(shown) !== JSON.stringify(entry.reachLines ?? []))
        problems.push(
          `${where}: lines ${shown.join(',')} in "${reaches}", reach lines ${(entry.reachLines ?? []).join(',')}`,
        );
      if (/passed in by/i.test(reaches) && !/^local\./i.test(entry.name))
        problems.push(`${where}: "${reaches}" says passed in, but it is no input`);
      if (/undefined|\{\w+\}|\[object/.test(reaches)) problems.push(`${where}: "${reaches}"`);
      // The hover text of a suggestion and of a Variables row is this hint in plain words.
      const hover = solidScriptSentencePlain(solidScriptSentence(reaches));
      for (const kind of kinds) if (!hover.includes(kind)) problems.push(`${where}: hover "${hover}" lacks ${kind}`);
      if (/[*{}]|undefined/.test(hover)) problems.push(`${where}: hover "${hover}"`);
    }
  }
  const end = new Map(solidScriptDocumentNames(document).map((entry) => [`${entry.category}:${entry.name}`, entry]));
  for (const entry of solidScriptExplorerEntries(document, [], []))
    if ((entry.reaches ?? '') !== (end.get(`${entry.category}:${entry.name}`)?.reaches ?? ''))
      problems.push(`Variables tab, ${entry.name}: "${entry.reaches}"`);
  return [...new Set(problems)];
}

describe('hints, the Variables tab and hover tell what the analysis found, for every write', () => {
  it.each(SOLID_SCRIPT_AUDIT_COMMANDS)('%s', (_id, command) => {
    expect(disagreements(solidScriptAuditScript(command).lines)).toEqual([]);
  });

  it('agrees in random scripts', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 300; seed++) {
      const problems = disagreements(solidScriptAuditFuzz(seed));
      if (problems.length > 0) failures.push(`seed ${seed}: ${problems.slice(0, 3).join('; ')}`);
    }
    expect(failures.slice(0, 8)).toEqual([]);
  });
});
