import { textCount } from '@/utils/utils_plural.js';
import type { ProjectHistoryIndex, ProjectHistoryNode } from '@/project/history/tree/project_history_tree.js';
import { projectHistoryNodeFind } from '@/project/history/tree/project_history_tree.js';

/**
 * Names a node: its name, else what it holds.
 *
 * @param node Node.
 * @returns Display name.
 */
export function dialogProjectHistoryNodeName(node: ProjectHistoryNode): string {
  if (node.name !== '') return node.name;
  return node.kind === 'snapshot' ? 'Snapshot' : 'Editing Session';
}

/**
 * Refers to a node in a sentence: named ones by name, others by name and time.
 *
 * @param node Node.
 * @returns Reference.
 */
export function dialogProjectHistoryNodeRef(node: ProjectHistoryNode): string {
  const name = `\u201c${dialogProjectHistoryNodeName(node)}\u201d`;
  return node.name !== '' ? name : `${name}, ${dialogProjectHistoryClock(node.time)}`;
}

/**
 * Words the object change of a node against the state it grew from.
 *
 * @param index Tree index.
 * @param node Node.
 * @returns +3 objects , "−1 object", "Same object count" or "First saved
 *   state".
 */
export function dialogProjectHistoryChange(index: ProjectHistoryIndex, node: ProjectHistoryNode): string {
  const parent = projectHistoryNodeFind(index, node.parent);
  if (parent === null) return 'First saved state';
  const delta = node.objectCount - parent.objectCount;
  if (delta === 0) return 'Same object count';
  const amount = textCount(Math.abs(delta), 'object');
  return delta > 0 ? `+${amount}` : `\u2212${amount}`;
}

/**
 * Words the second line of a node row.
 *
 * @param index Tree index.
 * @param node Node.
 * @returns Line.
 */
export function dialogProjectHistoryNodeLine(index: ProjectHistoryIndex, node: ProjectHistoryNode): string {
  const change = dialogProjectHistoryChange(index, node);
  if (node.kind === 'session' && node.autosaves > 1)
    return `${textCount(node.autosaves, 'autosave')}, ${dialogProjectHistorySpan(node)} \u00b7 ${change}`;
  return `${change} \u00b7 ${textCount(node.objectCount, 'object')}`;
}

/**
 * Words the time span of a session ("09:40\u201310:55").
 *
 * @param node Session node.
 * @returns Span.
 */
export function dialogProjectHistorySpan(node: ProjectHistoryNode): string {
  return `${dialogProjectHistoryClock(node.started)}\u2013${dialogProjectHistoryClock(node.time)}`;
}

/**
 * Words a clock time.
 *
 * @param time Time in milliseconds.
 * @returns Hours and minutes.
 */
export function dialogProjectHistoryClock(time: number): string {
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Words a date and time.
 *
 * @param time Time in milliseconds.
 * @returns Weekday, date and time.
 */
export function dialogProjectHistoryAbsolute(time: number): string {
  return new Date(time).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Words the day heading of a time.
 *
 * @param time Time in milliseconds.
 * @param now Current time.
 * @returns Today , "Yesterday" or the date.
 */
export function dialogProjectHistoryDay(time: number, now: number): string {
  const day = (value: number) => new Date(value).toDateString();
  if (day(time) === day(now)) return 'Today';
  if (day(time) === day(now - 86_400_000)) return 'Yesterday';
  return new Date(time).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Words the introduction.
 *
 * @param projectName Project name, or empty without a project.
 * @returns Introduction.
 */
export function dialogProjectHistoryIntro(projectName: string): string {
  const where = projectName === '' ? 'this session' : `project \u201c${projectName}\u201d`;
  return (
    `Every autosave and snapshot kept in ${where}. Restoring never overwrites anything: the work you leave stays ` +
    'at the end of its branch, and new changes grow a new branch. Named snapshots are kept until you delete them; ' +
    'the newest 20 unnamed states of each level and room are kept.'
  );
}

/**
 * Words the footer summary.
 *
 * @param indexes Tree indexes.
 * @returns Summary.
 */
export function dialogProjectHistorySummary(indexes: readonly ProjectHistoryIndex[]): string {
  const nodes = indexes.flatMap((index) => index.nodes);
  const named = nodes.filter((node) => node.name !== '').length;
  const trees = textCount(indexes.length, 'history', 'histories');
  return `${trees} \u00b7 ${textCount(nodes.length, 'saved state')} \u00b7 ${textCount(named, 'named snapshot')}`;
}
