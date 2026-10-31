import { describe, expect, it, vi } from 'vitest';
import {
  createToolbarShellActions,
  mergeLayoutShellActionSourceParts,
  type LayoutShellActionSource,
} from '@/layout/setup/layout_shell_action_builders.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import { ControllerSnapSettings } from '@/tools/snap/controller_snap_settings.js';

describe('mergeLayoutShellActionSourceParts', () => {
  it('keeps getters late-bound instead of snapshotting undefined handlers', () => {
    const holder: { controller: ControllerSnapSettings | undefined } = {
      controller: undefined,
    };
    const source = mergeLayoutShellActionSourceParts({
      get snapSettingsController() {
        return holder.controller as ControllerSnapSettings;
      },
    } as Partial<LayoutShellActionSource>);

    expect(source.snapSettingsController).toBeUndefined();

    const controller = {
      onTogglePositionLock: vi.fn(),
      onToggleStretchLock: vi.fn(),
    } as unknown as ControllerSnapSettings;
    holder.controller = controller;

    expect(source.snapSettingsController).toBe(controller);
  });
});

describe('createToolbarShellActions', () => {
  it('routes position and stretch lock toggles through the live snap controller', () => {
    const textureLock = new TextureLockSettings(true, false);
    const onTogglePositionLock = vi.fn();
    const onToggleStretchLock = vi.fn();
    const onOpenDocumentation = vi.fn();
    const holder: { controller: ControllerSnapSettings | undefined } = {
      controller: undefined,
    };
    const source = mergeLayoutShellActionSourceParts({
      textureLock,
      userSnapEnabled: true,
      get snapSettingsController() {
        return holder.controller as ControllerSnapSettings;
      },
      get primitiveCreationHandler() {
        return {} as LayoutShellActionSource['primitiveCreationHandler'];
      },
      get objectActionHandler() {
        return {} as LayoutShellActionSource['objectActionHandler'];
      },
      get csgActionHandler() {
        return {} as LayoutShellActionSource['csgActionHandler'];
      },
      onAddTerrain: () => undefined,
      onAddSolidModel: () => undefined,
      onUndo: () => undefined,
      onRedo: () => undefined,
      onToggleUvEditor: () => undefined,
      onToggleTextureBrowser: () => undefined,
      onToggleSolidModelPanel: () => undefined,
      onToggleSettingsDialog: () => undefined,
      onOpenDocumentation,
      onOpenAboutDialog: () => undefined,
      onDeleteSelected: () => undefined,
      onGroupSelected: () => undefined,
      onNewScene: () => undefined,
      onSaveScene: () => undefined,
      onLoadScene: () => undefined,
      onImportVmf: () => undefined,
      onImportObj: () => undefined,
      onExportGlb: () => undefined,
      onExportObj: () => undefined,
      onExportFbx: () => undefined,
      getShortcutLabel: () => '',
      onSetTransformSpaceGlobal: () => undefined,
      onSetTransformSpaceLocal: () => undefined,
      isTransformSpaceLocal: () => false,
    } as Partial<LayoutShellActionSource>);

    const actions = createToolbarShellActions(source as LayoutShellActionSource);
    holder.controller = {
      onTogglePositionLock,
      onToggleStretchLock,
      onToggleTextureLock: vi.fn(),
      onToggleSnap: vi.fn(),
      onSnapIntervalForward: vi.fn(),
      onSnapIntervalBackward: vi.fn(),
    } as unknown as ControllerSnapSettings;

    actions.onTogglePositionLock();
    actions.onToggleStretchLock();
    actions.onOpenDocumentation();

    expect(onTogglePositionLock).toHaveBeenCalledTimes(1);
    expect(onToggleStretchLock).toHaveBeenCalledTimes(1);
    expect(onOpenDocumentation).toHaveBeenCalledTimes(1);
  });
});
