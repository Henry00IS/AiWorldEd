import * as THREE from 'three';
import { EditorComponentMode, getEditorComponentModeLabel } from '@/types/editor_component_mode.js';
import { ManagerComponentSelection } from '@/edit/component/manager_component_selection.js';
import { convertComponentSelectionForMode } from '@/edit/component/component_selection_mode_convert.js';
import type { ComponentTopologyTarget } from '@/edit/component/component_selection_topology.js';
import { ensureMeshEditDocument, clearMeshEditDocumentBinding } from '@/edit/mesh/mesh_edit_binding.js';
import { buildEditSessionDomain, type EditDomainContentMesh, type EditDomainTarget } from './edit_session_domain.js';
import { EditModeObjectWireframeHide } from './edit_mode_object_wireframe_hide.js';

/** Live Edit Mode session: domain objects, component mode, and selection. */
export class EditSession {
  private active: boolean;
  private domain: EditDomainTarget[];
  private componentMode: EditorComponentMode;
  private readonly componentSelection: ManagerComponentSelection;
  private readonly objectWireframeHide: EditModeObjectWireframeHide;

  /** Creates an inactive edit session. */
  constructor() {
    this.active = false;
    this.domain = [];
    this.componentMode = EditorComponentMode.VERTEX;
    this.componentSelection = new ManagerComponentSelection();
    this.objectWireframeHide = new EditModeObjectWireframeHide();
  }

  /**
   * Returns whether Edit Mode is active.
   *
   * @returns True while a session is open.
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Returns the current component selection mode.
   *
   * @returns Component mode.
   */
  getComponentMode(): EditorComponentMode {
    return this.componentMode;
  }

  /**
   * Sets the component selection mode and converts selection so faces become
   * edges/verts (and the reverse contracts fully-selected loops).
   *
   * @param mode Component mode.
   * @param topologies Domain topologies used for conversion.
   */
  setComponentMode(mode: EditorComponentMode, topologies: readonly ComponentTopologyTarget[]): void {
    if (this.componentMode === mode) {
      return;
    }
    const previous = this.componentSelection.getSelected();
    this.componentMode = mode;
    const converted = convertComponentSelectionForMode(previous, mode, topologies);
    this.componentSelection.replaceAll(converted);
  }

  /**
   * Returns the component selection manager.
   *
   * @returns Selection manager.
   */
  getComponentSelection(): ManagerComponentSelection {
    return this.componentSelection;
  }

  /**
   * Returns domain targets for the open session.
   *
   * @returns Domain target list.
   */
  getDomain(): readonly EditDomainTarget[] {
    return this.domain;
  }

  /**
   * Returns content meshes in the domain.
   *
   * @returns Content mesh targets.
   */
  getContentMeshTargets(): EditDomainContentMesh[] {
    return this.domain.filter((target): target is EditDomainContentMesh => target.kind === 'content_mesh');
  }

  /**
   * Enters Edit Mode for the given object selection.
   *
   * @param selectedObjects Object Mode selection snapshot.
   * @returns True when the domain is non-empty and the session opened.
   */
  enter(selectedObjects: readonly THREE.Object3D[]): boolean {
    this.exit();
    const domain = buildEditSessionDomain(selectedObjects);
    if (domain.length === 0) {
      return false;
    }
    this.domain = domain;
    this.componentMode = EditorComponentMode.VERTEX;
    this.componentSelection.clear();
    this.bindContentMeshDocuments();
    this.suppressObjectModeWireframes();
    this.active = true;
    return true;
  }

  /**
   * Re-hides object-mode wireframes for the live domain after selection chrome
   * or shading systems may have recreated helpers.
   */
  suppressObjectModeWireframes(): void {
    if (this.domain.length === 0) {
      return;
    }
    this.objectWireframeHide.hideForDomain(this.domain);
  }

  /** Leaves Edit Mode and clears session state. */
  exit(): void {
    if (!this.active && this.domain.length === 0) {
      this.componentSelection.clear();
      return;
    }
    this.objectWireframeHide.restore();
    this.clearContentMeshBindings();
    this.domain = [];
    this.componentSelection.clear();
    this.componentMode = EditorComponentMode.VERTEX;
    this.active = false;
  }

  /**
   * Builds a short status label for the session.
   *
   * @returns Status text.
   */
  formatStatusLabel(): string {
    const modeLabel = getEditorComponentModeLabel(this.componentMode);
    const count = this.componentSelection.getSelectedCount();
    return `Edit Mode · ${modeLabel} · ${count} selected`;
  }

  /** Ensures MeshDocuments for all content meshes in the domain. */
  private bindContentMeshDocuments(): void {
    for (const target of this.getContentMeshTargets()) {
      ensureMeshEditDocument(target.mesh);
    }
  }

  /** Removes session MeshDocument bindings from domain content meshes. */
  private clearContentMeshBindings(): void {
    for (const target of this.getContentMeshTargets()) {
      clearMeshEditDocumentBinding(target.mesh);
    }
  }
}
