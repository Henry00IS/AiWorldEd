import * as THREE from 'three';
import { SKIP_FACE_PICK_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { DecalProjectorSettingsStore, type DecalProjectorSettings } from '@/decal/settings/decal_projector_settings.js';

/** Translucent box color of decal projectors. */
export const DECAL_PROJECTOR_VOLUME_COLOR = 0x9b59b6;

/** Creates the scene volumes that project decals. */
export class DecalProjectorVolume {
  /**
   * Creates a decal projector: a unit box whose local -Y axis is the projection
   * direction and whose local X and -Z axes span the image.
   *
   * @param settings Initial settings; missing fields take their defaults.
   * @returns Unnamed projector mesh.
   */
  static create(settings: Partial<DecalProjectorSettings> = {}): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
      color: DECAL_PROJECTOR_VOLUME_COLOR,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.userData[SKIP_FACE_PICK_USERDATA_KEY] = true;
    DecalProjectorSettingsStore.write(mesh, settings);
    DecalProjectorVolume.outlineAdd(mesh);
    return mesh;
  }

  /**
   * Adds the box outline that keeps the projector visible without its fill.
   *
   * @param mesh Projector mesh.
   */
  private static outlineAdd(mesh: THREE.Mesh): void {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: DECAL_PROJECTOR_VOLUME_COLOR }),
    );
    outline.userData['isModifierVolumeEdge'] = true;
    outline.raycast = () => undefined;
    mesh.add(outline);
  }
}
