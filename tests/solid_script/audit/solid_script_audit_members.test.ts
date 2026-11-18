import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptFlowMember } from '@/solid_script/document/solid_script_document_flow_kinds.js';
import {
  SOLID_SCRIPT_MEMBER_DECLS,
  solidScriptMemberHint,
  solidScriptMemberNames,
} from '@/solid_script/language/solid_script_members.js';
import { SOLID_SCRIPT_PASCAL_IDENT, solidScriptShownNameOk } from '@/solid_script/language/solid_script_shown_names.js';
import { SOLID_SCRIPT_SYSTEM_LISTED } from '@/solid_script/language/solid_script_system.js';

/** A member name that always yields a list of geometry or text. */
const SOLID_SCRIPT_AUDIT_LIST_MEMBERS: Readonly<Record<string, string>> = {
  Faces: 'Face List',
  Edges: 'Edge List',
  Vertices: 'Vertex List',
  Brushes: 'Brush List',
  Words: 'Text List',
};

/**
 * Collects files under a directory, or the file itself, that the member audit
 * should read.
 *
 * @param path File or directory.
 * @returns Paths of text files.
 */
function solidScriptAuditFiles(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) return /\.(ts|md)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((entry) => solidScriptAuditFiles(join(path, entry)));
}

/**
 * Collects dotted names written in a document, from [Name] and $Name paths.
 *
 * @param text Document text.
 * @returns Paths without brackets.
 */
function solidScriptAuditPaths(text: string): string[] {
  const bracketed = [...text.matchAll(/\[(\$?[A-Za-z_][\w.$()]*)\]/g)].map((match) => match[1] ?? '');
  const quoted = [...text.matchAll(/`(\$?[A-Za-z_][\w.$()]*)`/g)].map((match) => match[1] ?? '');
  return [...bracketed, ...quoted].filter((path) => path.includes('.'));
}

/**
 * Seeds the kinds of the start of a path, such as Face or $Selected.Faces.
 *
 * @param path Name, maybe starting with $.
 * @returns Kinds of the first parts already consumed, and the next part index.
 */
function solidScriptAuditSeed(path: string): { kinds: string[]; next: number } {
  const parts = path.replace(/^\$/, '').split('.');
  if (path.startsWith('$') && parts.length >= 2) {
    const second = parts[1] ?? '';
    const label = `$${parts[0]}.${second.replace(/\(.*\)$/, '')}`.toLowerCase();
    const listed = SOLID_SCRIPT_SYSTEM_LISTED.find(([name]) => name.toLowerCase() === label);
    if (listed) {
      const picks = /\(.*\)$/.test(second);
      const kind = listed[1];
      return { kinds: [picks && kind.endsWith(' List') ? kind.slice(0, -' List'.length) : kind], next: 2 };
    }
  }
  if (parts[0] && parts[0] in SOLID_SCRIPT_MEMBER_DECLS) return { kinds: [parts[0]], next: 1 };
  return { kinds: [], next: 0 };
}

/**
 * Checks that each member of a path uses the singular on one value and the
 * plural through a list, once the kinds are known.
 *
 * @param path Name as written.
 * @returns Problem, or undefined when the path is fine or its kinds are
 *   unknown.
 */
function solidScriptAuditPathProblem(path: string): string | undefined {
  const parts = path.replace(/^\$/, '').split('.');
  const seed = solidScriptAuditSeed(path);
  let kinds = seed.kinds;
  for (let index = seed.next; index < parts.length; index++) {
    const part = parts[index] ?? '';
    const word = part.replace(/\(.*\)$/, '');
    if (word === '') continue;
    if (kinds.length === 0) {
      const list = SOLID_SCRIPT_AUDIT_LIST_MEMBERS[word];
      if (list) kinds = [/\(.*\)$/.test(part) ? list.slice(0, -' List'.length) : list];
      continue;
    }
    if (word[0] !== word[0]?.toUpperCase()) return `${path}: .${word} must be PascalCase`;
    const hint = kinds.map((kind) => solidScriptMemberHint(kind, word)).find((text) => text !== undefined);
    const next = solidScriptFlowMember(kinds, part);
    if (next.length === 0)
      return hint
        ? `${path}: ${hint}`
        : kinds.some((kind) => solidScriptMemberNames(kind).length > 0)
          ? `${path}: ${kinds.join(' or ')} has no .${word}`
          : undefined;
    kinds = next;
  }
  return undefined;
}

describe('every member has a singular and a plural form', () => {
  it('declares both PascalCase names for every member of every kind', () => {
    const problems: string[] = [];
    for (const [kind, members] of Object.entries(SOLID_SCRIPT_MEMBER_DECLS)) {
      if (!SOLID_SCRIPT_PASCAL_IDENT.test(kind)) problems.push(`kind ${kind} is not PascalCase`);
      for (const [singular, decl] of Object.entries(members)) {
        if (!singular || !decl.plural) problems.push(`${kind} is missing a singular or plural name`);
        if (!solidScriptShownNameOk(singular) || !solidScriptShownNameOk(decl.plural))
          problems.push(`${kind}.${singular}/${decl.plural} is not PascalCase`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('uses the singular on one value and the plural through a list in examples and docs', () => {
    const roots = [
      'documentation/solidscript.md',
      'src/solid_script/reference/solid_script_reference.ts',
      'src/solid_script/examples',
      'src/ai/README.md',
      'src/ai/shared/mcp_instructions.ts',
    ];
    const texts = [
      ...roots.flatMap((path) => solidScriptAuditFiles(path)).map((path) => readFileSync(path, 'utf8')),
      ...solidScriptCommands.flatMap((command) => [
        command.manual,
        ...command.parameters.map((parameter) => parameter.hint),
      ]),
    ];
    const problems = [
      ...new Set(texts.flatMap((text) => solidScriptAuditPaths(text).map(solidScriptAuditPathProblem))),
    ].filter((problem): problem is string => problem !== undefined);
    expect(problems).toEqual([]);
  });
});
