import type { FbxExportEncoding } from '@/io/fbx/fbx_export_types.js';

/** Model file formats the Export dialog writes. */
export type ModelExportFormat = 'fbx' | 'gltf' | 'glb' | 'obj';

/**
 * Where a model's textures go: inside the model file, or copied into a folder
 * beside it.
 */
export type ModelExportTextureMode = 'embedded' | 'copy';

/** One format of the Export dialog. */
export interface ModelExportFormatInfo {
  id: ModelExportFormat;
  label: string;
  /** Extension without the dot. */
  extension: string;
  /** Texture modes the format supports, the first being its default. */
  textureModes: readonly ModelExportTextureMode[];
}

/** Formats in menu order. */
export const MODEL_EXPORT_FORMATS: readonly ModelExportFormatInfo[] = Object.freeze([
  { id: 'fbx', label: 'FBX (.fbx)', extension: 'fbx', textureModes: ['embedded', 'copy'] },
  { id: 'gltf', label: 'glTF (.gltf)', extension: 'gltf', textureModes: ['embedded', 'copy'] },
  { id: 'glb', label: 'glTF Binary (.glb)', extension: 'glb', textureModes: ['embedded'] },
  { id: 'obj', label: 'Wavefront OBJ (.obj)', extension: 'obj', textureModes: ['copy'] },
]);

/** Labels of the texture modes. */
export const MODEL_EXPORT_TEXTURE_MODE_LABELS: Readonly<Record<ModelExportTextureMode, string>> = Object.freeze({
  embedded: 'Embedded',
  copy: 'Copy Into Directory',
});

/** Export dialog choices kept between exports. */
export interface ModelExportSettings {
  /** Target program id. */
  targetId: string;
  format: ModelExportFormat;
  fbxEncoding: FbxExportEncoding;
  /**
   * Texture mode the user chose, per format that has a choice; a format without
   * one uses its default for the target.
   */
  textureModes: Partial<Record<'fbx' | 'gltf' | 'obj', ModelExportTextureMode>>;
  /**
   * Textures folder of Copy Into Directory, relative to the model; '' is the
   * model's own folder.
   */
  texturesFolder: string;
  /** Whether OBJ exports write a .mtl with their textures. */
  objMaterials: boolean;
}

/** Default textures folder name. */
const MODEL_EXPORT_TEXTURES_FOLDER_DEFAULT = 'Textures';

/** Default file name without extension. */
export const MODEL_EXPORT_FILE_NAME_DEFAULT = 'scene';

/** Longest file or folder name accepted, in characters. */
const MODEL_EXPORT_NAME_MAXIMUM = 100;

/** Names Windows reserves for devices. */
const MODEL_EXPORT_RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** Characters allowed in names (after spaces became underscores). */
const MODEL_EXPORT_NAME_CHARACTERS = /^[\p{L}\p{N}_.-]+$/u;

/**
 * Returns a format's description.
 *
 * @param format Format id.
 * @returns Format info.
 */
export function modelExportFormatInfo(format: ModelExportFormat): ModelExportFormatInfo {
  return MODEL_EXPORT_FORMATS.find((info) => info.id === format) ?? MODEL_EXPORT_FORMATS[0]!;
}

/**
 * Returns the texture mode an export uses until the user picks one: Copy Into
 * Directory for Unity FBX (Unity ignores embedded FBX textures until they are
 * extracted), otherwise the format's first mode.
 *
 * @param targetId Target id.
 * @param format Format.
 * @returns Mode.
 */
export function modelExportTextureModeDefault(targetId: string, format: ModelExportFormat): ModelExportTextureMode {
  if (targetId === 'unity' && format === 'fbx') return 'copy';
  return modelExportFormatInfo(format).textureModes[0]!;
}

/**
 * Returns the texture mode an export of `format` uses with `settings`: the
 * user's choice, or the target's default.
 *
 * @param settings Export settings.
 * @param format Format.
 * @returns Mode (always one the format supports).
 */
export function modelExportTextureMode(
  settings: ModelExportSettings,
  format: ModelExportFormat,
): ModelExportTextureMode {
  const chosen = format === 'glb' ? undefined : settings.textureModes[format];
  return chosen !== undefined && modelExportFormatInfo(format).textureModes.includes(chosen)
    ? chosen
    : modelExportTextureModeDefault(settings.targetId, format);
}

/**
 * Creates the default export settings.
 *
 * @param targetId Default target id.
 * @returns Settings.
 */
export function modelExportSettingsDefault(targetId: string): ModelExportSettings {
  return {
    targetId,
    format: 'fbx',
    fbxEncoding: 'binary',
    textureModes: {},
    texturesFolder: MODEL_EXPORT_TEXTURES_FOLDER_DEFAULT,
    objMaterials: true,
  };
}

/**
 * Reads stored export settings, keeping the defaults for anything missing or
 * invalid.
 *
 * @param raw Stored JSON, or null.
 * @param defaults Default settings.
 * @returns Settings.
 */
export function modelExportSettingsParse(raw: string | null, defaults: ModelExportSettings): ModelExportSettings {
  if (raw === null) return defaults;
  let parsed: Partial<ModelExportSettings>;
  try {
    parsed = JSON.parse(raw) as Partial<ModelExportSettings>;
  } catch {
    return defaults;
  }
  if (typeof parsed !== 'object' || parsed === null) return defaults;
  const isFormat = (value: unknown): value is ModelExportFormat =>
    MODEL_EXPORT_FORMATS.some((info) => info.id === value);
  const textureModes: ModelExportSettings['textureModes'] = { ...defaults.textureModes };
  for (const format of ['fbx', 'gltf', 'obj'] as const) {
    const value = (parsed.textureModes as Record<string, unknown> | undefined)?.[format];
    if (modelExportFormatInfo(format).textureModes.includes(value as ModelExportTextureMode)) {
      textureModes[format] = value as ModelExportTextureMode;
    }
  }
  const folder = typeof parsed.texturesFolder === 'string' ? modelExportFolderCheck(parsed.texturesFolder) : null;
  return {
    targetId: typeof parsed.targetId === 'string' && parsed.targetId !== '' ? parsed.targetId : defaults.targetId,
    format: isFormat(parsed.format) ? parsed.format : defaults.format,
    fbxEncoding:
      parsed.fbxEncoding === 'ascii' || parsed.fbxEncoding === 'binary' ? parsed.fbxEncoding : defaults.fbxEncoding,
    textureModes,
    texturesFolder: folder !== null && folder.error === null ? folder.value : defaults.texturesFolder,
    objMaterials: typeof parsed.objMaterials === 'boolean' ? parsed.objMaterials : defaults.objMaterials,
  };
}

/** A checked name: the cleaned value, or why it cannot be used. */
export interface ModelExportNameCheck {
  value: string;
  error: string | null;
}

/**
 * Cleans one file or folder name: trims it and turns spaces into underscores.
 *
 * @param name Typed name.
 * @returns Checked name.
 */
function modelExportNameClean(name: string): ModelExportNameCheck {
  const value = name.trim().replace(/\s+/g, '_');
  if (value.length > MODEL_EXPORT_NAME_MAXIMUM)
    return { value, error: `Use at most ${MODEL_EXPORT_NAME_MAXIMUM} characters.` };
  if (value === '.' || value === '..') return { value, error: 'Names cannot be "." or "..".' };
  if (value.startsWith('.')) return { value, error: 'Names cannot start with a dot.' };
  if (!MODEL_EXPORT_NAME_CHARACTERS.test(value)) return { value, error: 'Use letters, digits, _, - and . only.' };
  if (MODEL_EXPORT_RESERVED_NAMES.test(value.replace(/\..*$/, '')))
    return { value, error: `"${value}" is a reserved name on Windows.` };
  return { value, error: null };
}

/**
 * Checks a model file name and adds the format's extension. A typed extension
 * of the same format is not doubled.
 *
 * @param name Typed name.
 * @param extension Extension without the dot.
 * @returns File name with extension, or an error.
 */
export function modelExportFileNameCheck(name: string, extension: string): ModelExportNameCheck {
  const stem = name.trim().replace(new RegExp(`\\.${extension}$`, 'i'), '');
  if (stem.trim() === '') return { value: '', error: 'Enter a file name.' };
  const checked = modelExportNameClean(stem);
  return checked.error === null ? { value: `${checked.value}.${extension}`, error: null } : checked;
}

/**
 * Checks a textures folder: a path inside the model's folder, separated by "/"
 * or "". Blank means the model's own folder.
 *
 * @param folder Typed folder.
 * @returns Folder with "/" separators ('' for the model's folder), or an error.
 */
export function modelExportFolderCheck(folder: string): ModelExportNameCheck {
  const trimmed = folder.trim();
  if (trimmed === '') return { value: '', error: null };
  if (/^([a-z]:)?[\\/]/i.test(trimmed) || /^[a-z]:/i.test(trimmed))
    return { value: trimmed, error: 'Use a folder inside the model\u2019s folder, not an absolute path.' };
  const parts = trimmed.split(/[\\/]+/).filter((part) => part !== '');
  const cleaned: string[] = [];
  for (const part of parts) {
    const checked = modelExportNameClean(part);
    if (checked.error !== null) return { value: trimmed, error: checked.error };
    cleaned.push(checked.value);
  }
  return { value: cleaned.join('/'), error: null };
}

/**
 * Joins a folder and a file name into a model-relative path.
 *
 * @param folder Folder ('' for the model's folder).
 * @param fileName File name.
 * @returns Path.
 */
export function modelExportPathJoin(folder: string, fileName: string): string {
  return folder === '' ? fileName : `${folder}/${fileName}`;
}
