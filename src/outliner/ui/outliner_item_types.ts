import type * as THREE from 'three';

/**
 * Callback type for item selection events.
 *
 * @param obj The Three.js object that was selected.
 * @param event The mouse event that triggered selection (for modifiers).
 */
export type ItemSelectCallback = (obj: THREE.Object3D, event?: MouseEvent) => void;

/**
 * Callback type for visibility toggle events.
 *
 * @param obj The Three.js object whose visibility toggled.
 */
export type ItemVisibilityCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for lock toggle events.
 *
 * @param obj The Three.js object whose lock state toggled.
 */
export type ItemLockCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for expand/collapse toggle events.
 *
 * @param obj The Three.js object that was expanded or collapsed.
 */
export type ItemExpandCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for double-click rename events.
 *
 * @param obj The Three.js object that was double-clicked.
 * @param newName The new name entered by the user.
 */
export type ItemRenameCallback = (obj: THREE.Object3D, newName: string) => void;

/**
 * Callback type for context menu requests.
 *
 * @param obj The Three.js object for the context menu.
 * @param x The horizontal screen coordinate.
 * @param y The vertical screen coordinate.
 */
export type ItemContextMenuCallback = (obj: THREE.Object3D, x: number, y: number) => void;

/**
 * Callback type for drag-start events on an outliner row.
 *
 * @param obj The Three.js object being dragged.
 * @param event The native drag event.
 */
export type ItemDragStartCallback = (obj: THREE.Object3D, event: DragEvent) => void;

/**
 * Callback type for drag-hover events on an outliner row (insert line updates).
 *
 * @param target The Three.js object under the pointer.
 * @param event The native drag event.
 */
export type ItemDragHoverCallback = (target: THREE.Object3D, event: DragEvent) => void;

/**
 * Callback type for drop events on an outliner row.
 *
 * @param target The Three.js object under the drop.
 * @param event The native drop event.
 */
export type ItemDropCallback = (target: THREE.Object3D, event: DragEvent) => void;

/**
 * Callback type for drag-end events on an outliner row.
 *
 * @param obj The Three.js object that was dragged.
 */
export type ItemDragEndCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for a Shift press on an outliner row, which starts painting a
 * selection over the rows the pointer then crosses.
 *
 * @param obj The Three.js object under the press.
 * @param event The native mouse event.
 */
export type ItemPaintStartCallback = (obj: THREE.Object3D, event: MouseEvent) => void;
