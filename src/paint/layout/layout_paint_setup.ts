import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { textureChoicesList } from '@/texture/library/texture_choices.js';
import { LocalSettingsStorage } from '@/settings/storage/settings_storage.js';
import type { PaintSceneSystem } from '@/paint/scene/paint_scene_system.js';
import type { PaintImageSource } from '@/paint/raster/paint_image.js';
import { CommandPaintClear, type PaintClearTarget } from '@/paint/commands/command_paint_clear.js';
import { PaintTool } from '@/paint/tool/paint_tool.js';
import { PaintToolSettings } from '@/paint/tool/paint_tool_settings.js';
import { PaintPalette } from '@/paint/ui/paint_palette.js';

/** What the paint tool setup needs from the layout. */
export interface LayoutPaintDependencies {
  /** Element the palette floats in. */
  readonly container: HTMLElement;
  /** Returns the paint scene system. */
  paintSystem(): PaintSceneSystem | null;
  /** Resolves stamp images. */
  readonly images: PaintImageSource;
  /** Returns the world root. */
  worldObject(): THREE.Object3D;
  /** Returns the shared scene. */
  scene(): THREE.Scene | null;
  /** Returns the undo stack. */
  commandStack(): CommandStack;
  /** Returns the selected objects. */
  selectedObjects(): readonly THREE.Object3D[];
  /**
   * Shows a status message.
   *
   * @param message Message.
   */
  showStatus(message: string): void;
}

/** Paint tool, its settings and palette. */
export interface LayoutPaintSystem {
  readonly tool: PaintTool;
  readonly settings: PaintToolSettings;
  readonly palette: PaintPalette;
  dispose(): void;
}

/**
 * Returns the brushes of the selected objects: a selected brush, or every brush
 * of a selected solid model.
 *
 * @param objects Selected objects.
 * @returns Brush targets.
 */
export function paintSelectedBrushTargets(objects: readonly THREE.Object3D[]): PaintClearTarget[] {
  const targets: PaintClearTarget[] = [];
  const seen = new Set<string>();
  const add = (model: SolidModel, brushId: string): void => {
    const key = `${model.root.uuid}/${brushId}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ model, brushId });
  };
  for (const object of objects) {
    const model = SolidModelRegistry.fromObject(object);
    if (model === null) continue;
    const brush = model.findBrushByMesh(object);
    if (brush !== undefined) {
      add(model, brush.id);
      continue;
    }
    for (const id of model.hierarchyBrushIdsCollectUnder(object)) add(model, id);
  }
  return targets;
}

/**
 * Tells whether the user asked for reduced motion.
 *
 * @returns True to avoid animations.
 */
function paintReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Creates the paint tool, its saved settings and its palette.
 *
 * @param deps Layout access.
 * @returns Paint system.
 */
export function setupLayoutPaint(deps: LayoutPaintDependencies): LayoutPaintSystem {
  const storage =
    typeof window !== 'undefined' && window.localStorage ? new LocalSettingsStorage(window.localStorage) : null;
  const settings = new PaintToolSettings(storage);
  const palette = new PaintPalette(deps.container, settings, {
    textureChoices: () => textureChoicesList(),
    onClearPaint: () => {
      const command = new CommandPaintClear(paintSelectedBrushTargets(deps.selectedObjects()));
      if (!command.hasPaint()) {
        deps.showStatus('Select painted brushes to clear');
        return;
      }
      deps.commandStack().push(command);
      deps.showStatus('Paint cleared');
    },
  });
  const tool = new PaintTool({
    settings,
    images: deps.images,
    paintSystem: () => deps.paintSystem(),
    worldObject: () => deps.worldObject(),
    scene: () => deps.scene(),
    commandStack: () => deps.commandStack(),
    reducedMotion: paintReducedMotion,
    onActiveChanged: (active) => palette.setVisible(active),
  });
  return {
    tool,
    settings,
    palette,
    dispose: () => {
      tool.dispose();
      palette.dispose();
    },
  };
}
