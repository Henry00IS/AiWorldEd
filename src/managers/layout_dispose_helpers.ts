/**
 * Disposes optional subsystems that own DOM listeners, GPU helpers, or stacks.
 * @param parts Objects with optional dispose methods.
 */
export function disposeLayoutOwnedResources(parts: {
  faceExtrusionController?: { dispose: () => void } | null;
  selectionVisualController?: { dispose: () => void } | null;
  selectionManager?: { dispose: () => void } | null;
  commandStack?: { dispose: () => void } | null;
  transformGizmo?: { dispose: () => void } | null;
  gizmoRaycaster?: { dispose: () => void } | null;
  primitiveTool?: { dispose: () => void } | null;
  propertiesPanel?: { dispose: () => void } | null;
  outlinerPanel?: { dispose: () => void } | null;
  toolbar?: { dispose: () => void } | null;
  statusBar?: { dispose: () => void } | null;
  uvEditor?: { dispose: () => void } | null;
  textureBrowserController?: { dispose: () => void } | null;
  textureBrowser?: { dispose: () => void } | null;
  toolsPalette?: { dispose: () => void } | null;
  aboutDialog?: { dispose: () => void } | null;
}): void {
  parts.faceExtrusionController?.dispose();
  parts.selectionVisualController?.dispose();
  parts.selectionManager?.dispose();
  parts.commandStack?.dispose();
  parts.transformGizmo?.dispose();
  parts.gizmoRaycaster?.dispose();
  parts.primitiveTool?.dispose();
  parts.propertiesPanel?.dispose();
  parts.outlinerPanel?.dispose();
  parts.toolbar?.dispose();
  parts.statusBar?.dispose();
  parts.uvEditor?.dispose();
  parts.textureBrowserController?.dispose();
  parts.textureBrowser?.dispose();
  parts.toolsPalette?.dispose();
  parts.aboutDialog?.dispose();
}
