import type { SolidScriptValue } from './solid_script_value.js';

/** Where a script runs. */
export type SolidScriptRunContext = 'generator' | 'preview' | 'handler' | 'assistant';

/** What the editor around a script knows; filled in by the editor. */
export interface SolidScriptSystemHost {
  /** Editor name, such as AI World Editor. */
  editorName: string;
  /** Editor version. */
  editorVersion: string;
  /** Address of the editor page, without its query. */
  editorUrl: string;
  /** Desktop app or browser. */
  platform: 'desktop' | 'browser';
  /** Name of the open level file, or empty. */
  levelName: string;
  /** Joined room name, or empty when offline. */
  roomName: string;
  /** Display name of this user, or empty. */
  userName: string;
}

/** Host values when no editor filled them in, such as in tests. */
const SOLID_SCRIPT_SYSTEM_HOST_EMPTY: SolidScriptSystemHost = {
  editorName: '',
  editorVersion: '',
  editorUrl: '',
  platform: 'browser',
  levelName: '',
  roomName: '',
  userName: '',
};

/** Reads what the editor knows, set once by the editor at start. */
let solidScriptSystemHostRead: () => SolidScriptSystemHost = () => SOLID_SCRIPT_SYSTEM_HOST_EMPTY;

/** Counts the people in the joined room, or null offline. */
let solidScriptSystemPlayersRead: (() => number) | null = null;

/**
 * Lets the joined room tell scripts how many people are in it.
 *
 * @param read Counts the people, or null when the room is left.
 */
export function solidScriptSystemPlayersSet(read: (() => number) | null): void {
  solidScriptSystemPlayersRead = read;
}

/** Runs of scripts in this window so far. */
let solidScriptSystemRuns = 0;

/** Time of the previous run, in milliseconds, or null before the first. */
let solidScriptSystemLastRun: number | null = null;

/**
 * Lets the editor tell scripts about itself.
 *
 * @param read Reads the current values.
 */
export function solidScriptSystemHostSet(read: () => SolidScriptSystemHost): void {
  solidScriptSystemHostRead = read;
}

/**
 * One built-in value every script can read, for the variable explorer and the
 * docs.
 */
export interface SolidScriptSystemValue {
  /** Name as fields read it, such as Time.Year. */
  name: string;
  /** Friendly type. */
  type: string;
  /** What it holds, in a few words. */
  detail: string;
}

/** Every built-in value, by group. */
export const SOLID_SCRIPT_SYSTEM_GLOBALS: readonly SolidScriptSystemValue[] = [
  { name: 'Run.Context', type: 'Text', detail: 'where the script runs: generator, preview, handler or assistant' },
  { name: 'Run.Count', type: 'Number', detail: 'how many scripts ran in this window, this one included' },
  { name: 'Run.Seed', type: 'Number', detail: 'a new random whole number every run' },
  { name: 'Box.Width', type: 'Number', detail: 'width of the generator box in metres (X)' },
  { name: 'Box.Depth', type: 'Number', detail: 'depth of the generator box in metres (Y)' },
  { name: 'Box.Height', type: 'Number', detail: 'height of the generator box in metres (Z)' },
  { name: 'Box.Size', type: 'Vector', detail: 'width, depth and height of the generator box' },
  { name: 'Editor.Name', type: 'Text', detail: 'name of the editor' },
  { name: 'Editor.Version', type: 'Text', detail: 'version of the editor, such as 1.2.3' },
  { name: 'Editor.Url', type: 'Text', detail: 'address of the editor page' },
  { name: 'Editor.Platform', type: 'Text', detail: 'desktop or browser' },
  { name: 'Level.Name', type: 'Text', detail: 'name of the open level file, or empty' },
  { name: 'Room.Online', type: 'Yes/No', detail: 'Yes in a multiplayer room, No offline' },
  { name: 'Room.Name', type: 'Text', detail: 'name of the room, or empty offline' },
  { name: 'Room.Players', type: 'Number', detail: 'people in the room, 1 offline' },
  { name: 'User.Name', type: 'Text', detail: 'your display name, or empty' },
  { name: 'Time.Now', type: 'Number', detail: 'seconds since 1 January 1970, for time_text()' },
  { name: 'Time.Delta', type: 'Number', detail: 'seconds since the run before this one' },
  { name: 'Time.Text', type: 'Text', detail: 'date and time now, such as 2026-11-16 09:30:00' },
  { name: 'Time.Date', type: 'Text', detail: 'date now, such as 2026-11-16' },
  { name: 'Time.Clock', type: 'Text', detail: 'time of day now, such as 09:30' },
  { name: 'Time.Year', type: 'Number', detail: 'year now' },
  { name: 'Time.Month', type: 'Number', detail: 'month now, 1 to 12' },
  { name: 'Time.Day', type: 'Number', detail: 'day of the month now, 1 to 31' },
  { name: 'Time.Weekday', type: 'Text', detail: 'day of the week now, such as Monday' },
  { name: 'Time.Hour', type: 'Number', detail: 'hour now, 0 to 23' },
  { name: 'Time.Minute', type: 'Number', detail: 'minute now, 0 to 59' },
  { name: 'Time.Second', type: 'Number', detail: 'second now, 0 to 59' },
  { name: 'Math.Pi', type: 'Number', detail: 'half a turn in radians, 3.14159…' },
  { name: 'Math.Tau', type: 'Number', detail: 'a whole turn in radians, 6.28318…' },
  { name: 'Math.E', type: 'Number', detail: 'the growth number e, 2.71828…' },
  { name: 'Math.Golden', type: 'Number', detail: 'the golden ratio, 1.61803…' },
  { name: 'Math.Sqrt2', type: 'Number', detail: 'square root of 2, 1.41421…' },
  { name: 'Math.Epsilon', type: 'Number', detail: 'a tiny number for comparing, 0.000001' },
];

/** Names of the week days, Sunday first, as Date counts them. */
export const SOLID_SCRIPT_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Names of the months, January first. */
export const SOLID_SCRIPT_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Writes a time as text with a pattern: YYYY or YY year, MMMM month name, MMM
 * short month, MM or M month, DD or D day, dddd weekday, ddd short weekday, HH
 * or H hour, hh or h hour on a 12-hour clock, mm minute, ss second, A AM or PM.
 * Text in quotes is kept as it is.
 *
 * @param seconds Seconds since 1 January 1970.
 * @param pattern Pattern.
 * @returns Text in local time.
 */
export function solidScriptTimeText(seconds: number, pattern: string): string {
  const date = new Date(seconds * 1000);
  const two = (value: number): string => String(value).padStart(2, '0');
  const hour12 = date.getHours() % 12 || 12;
  const parts: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: two(date.getFullYear() % 100),
    MMMM: SOLID_SCRIPT_MONTHS[date.getMonth()] ?? '',
    MMM: (SOLID_SCRIPT_MONTHS[date.getMonth()] ?? '').slice(0, 3),
    MM: two(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    dddd: SOLID_SCRIPT_WEEKDAYS[date.getDay()] ?? '',
    ddd: (SOLID_SCRIPT_WEEKDAYS[date.getDay()] ?? '').slice(0, 3),
    DD: two(date.getDate()),
    D: String(date.getDate()),
    HH: two(date.getHours()),
    H: String(date.getHours()),
    hh: two(hour12),
    h: String(hour12),
    mm: two(date.getMinutes()),
    ss: two(date.getSeconds()),
    A: date.getHours() < 12 ? 'AM' : 'PM',
  };
  return pattern.replace(/'[^']*'|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|hh|h|mm|ss|A/g, (token) =>
    token.startsWith("'") ? token.slice(1, -1) : (parts[token] ?? token),
  );
}

/** Reads the built-in values of one run. */
export interface SolidScriptSystemReader {
  /**
   * Reads one value.
   *
   * @param name Name, such as Time.Year.
   * @returns Value, or undefined when there is none of that name.
   */
  get(name: string): SolidScriptValue;
}

/**
 * Gives the built-in values of one run. Each value is worked out the first time
 * a script reads it, so runs that read none cost nothing.
 *
 * @param context Where the script runs.
 * @param box Generator box size, or null when the run has no box.
 * @param count True counts this run in Run.Count and Time.Delta; false only
 *   looks, as the variable explorer does.
 * @returns Values by name.
 */
export function solidScriptSystemValues(
  context: SolidScriptRunContext,
  box: readonly [number, number, number] | null,
  count = true,
): SolidScriptSystemReader {
  const now = Date.now();
  const delta = solidScriptSystemLastRun === null ? 0 : (now - solidScriptSystemLastRun) / 1000;
  if (count) {
    solidScriptSystemRuns += 1;
    solidScriptSystemLastRun = now;
  }
  const runs = Math.max(1, solidScriptSystemRuns);
  const seconds = now / 1000;
  let host: SolidScriptSystemHost | null = null;
  const editor = (): SolidScriptSystemHost => (host ??= solidScriptSystemHostRead());
  let date: Date | null = null;
  const time = (): Date => (date ??= new Date(now));
  const read: Readonly<Record<string, () => SolidScriptValue>> = {
    'Run.Context': () => context,
    'Run.Count': () => runs,
    'Run.Seed': () => Math.floor(Math.random() * 1_000_000),
    'Editor.Name': () => editor().editorName,
    'Editor.Version': () => editor().editorVersion,
    'Editor.Url': () => editor().editorUrl,
    'Editor.Platform': () => editor().platform,
    'Level.Name': () => editor().levelName,
    'Room.Online': () => editor().roomName !== '',
    'Room.Name': () => editor().roomName,
    'Room.Players': () => Math.max(1, solidScriptSystemPlayersRead?.() ?? 1),
    'User.Name': () => editor().userName,
    'Time.Now': () => seconds,
    'Time.Delta': () => delta,
    'Time.Text': () => solidScriptTimeText(seconds, 'YYYY-MM-DD HH:mm:ss'),
    'Time.Date': () => solidScriptTimeText(seconds, 'YYYY-MM-DD'),
    'Time.Clock': () => solidScriptTimeText(seconds, 'HH:mm'),
    'Time.Year': () => time().getFullYear(),
    'Time.Month': () => time().getMonth() + 1,
    'Time.Day': () => time().getDate(),
    'Time.Weekday': () => SOLID_SCRIPT_WEEKDAYS[time().getDay()] ?? '',
    'Time.Hour': () => time().getHours(),
    'Time.Minute': () => time().getMinutes(),
    'Time.Second': () => time().getSeconds(),
    'Math.Pi': () => Math.PI,
    'Math.Tau': () => Math.PI * 2,
    'Math.E': () => Math.E,
    'Math.Golden': () => (1 + Math.sqrt(5)) / 2,
    'Math.Sqrt2': () => Math.SQRT2,
    'Math.Epsilon': () => 0.000001,
    ...(box
      ? {
          'Box.Width': () => box[0],
          'Box.Depth': () => box[1],
          'Box.Height': () => box[2],
          'Box.Size': () => [box[0], box[1], box[2]],
        }
      : {}),
  };
  const known = new Map<string, SolidScriptValue>();
  return {
    get: (name) => {
      if (known.has(name)) return known.get(name);
      const value = Object.hasOwn(read, name) ? read[name]!() : undefined;
      known.set(name, value);
      return value;
    },
  };
}
