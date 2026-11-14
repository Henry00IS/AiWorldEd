import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildViewportToolObjectMenuEntries } from '@/tools/chrome/options/viewport_tool_object_menu.js';
import { ObjectPivotPlacement } from '@/transform/pivot/object_pivot_point.js';
import { PivotMarker } from '@/transform/pivot/pivot_marker.js';
import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';

/** Object → Set Origin lists every placement, and the marker shows origins. */
describe('pivot menu and marker', () => {
  it('offers the origin placements under Object → Set Origin', () => {
    const chosen: ObjectPivotPlacement[] = [];
    const entries = buildViewportToolObjectMenuEntries(
      () => undefined,
      () => undefined,
      (placement) => chosen.push(placement),
    );
    const submenu = entries.find((entry) => 'label' in entry && entry.label === 'Set Origin') as
      { children: ToolbarMenuEntry[] } | undefined;
    const rows = (submenu?.children ?? []) as Array<{ label: string; onClick: () => void }>;
    expect(rows.map((row) => row.label)).toEqual([
      'Origin to Geometry Center',
      'Origin to Geometry Bottom',
      'Origin to World Origin',
    ]);
    rows.forEach((row) => row.onClick());
    expect(chosen).toEqual(Object.values(ObjectPivotPlacement));
  });

  it('draws one dot at each selected origin and hides with no selection', () => {
    const marker = new PivotMarker();
    const object = new THREE.Object3D();
    object.position.set(1, 2, 3);
    object.updateMatrixWorld(true);
    marker.sync([object]);
    const position = marker.object.geometry.getAttribute('position');
    expect(marker.object.geometry.drawRange.count).toBe(1);
    expect([position.getX(0), position.getY(0), position.getZ(0)]).toEqual([1, 2, 3]);
    marker.sync([]);
    expect(marker.object.visible).toBe(false);
    marker.dispose();
  });
});
