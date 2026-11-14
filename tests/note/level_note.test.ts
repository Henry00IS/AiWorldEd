import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { ReplicaCollaborationScene } from '@/collaboration/sync/replica_collaboration_scene.js';
import { TrackerCollaboration } from '@/collaboration/sync/tracker_collaboration_commit.js';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { CommandLevelNoteSet } from '@/note/command_level_note_set.js';
import { LEVEL_NOTE_TEXT_MAX, LevelNote } from '@/note/level_note.js';
import { levelNoteLabelBody, levelNoteLabelOf } from '@/note/level_note_label.js';
import { PanelPropertiesLevelNoteSection } from '@/note/ui/panel_properties_level_note_section.js';
import { playerCollisionIsCollidableMesh } from '@/player/collision/player_collision_world.js';
import { isEditableContentMesh } from '@/edit/session/edit_session_domain.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { setObjectLocked } from '@/utils/object_lock.js';
import { clipboardSceneCopy } from '@/clipboard/scene/clipboard_scene_data.js';
import { CommandClipboardScenePaste } from '@/clipboard/scene/command_clipboard_scene_paste.js';
import { FactoryObjectIcon } from '@/outliner/ui/factory_object_icon.js';

/**
 * Builds a world with one cube and one note.
 *
 * @returns World, note and cube.
 */
function worldWithNote() {
  const world = new THREE.Group();
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  cube.name = 'Cube';
  const note = LevelNote.create({ text: 'Guard spawns here' }, 0x3b82f6);
  note.name = 'Guard Note';
  note.position.set(1, 2, 3);
  world.add(cube, note);
  return { world, note, cube };
}

/**
 * Returns the joiner's copy of an object.
 *
 * @param replica Replica.
 * @param uuid Node id.
 * @returns Object.
 */
function replicaObject(replica: ReplicaCollaborationScene, uuid: string): THREE.Object3D {
  replica.applier.invalidate();
  const object = replica.applier.nodes().get(uuid)?.object;
  if (!object) throw new Error(`missing ${uuid}`);
  return object;
}

describe('level notes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is a pin marker with an unpickable label that is never edited as geometry', () => {
    const note = LevelNote.create({ text: 'Hello' });
    expect(LevelNote.is(note)).toBe(true);
    expect(LevelNote.read(note)).toEqual({ text: 'Hello' });
    expect(isEditableContentMesh(note)).toBe(false);
    const label = levelNoteLabelOf(note);
    expect(label).not.toBeNull();
    expect(isEditorHelperObject(label!)).toBe(true);
    const hits: THREE.Intersection[] = [];
    label!.raycast(new THREE.Raycaster(), hits);
    expect(hits).toEqual([]);
    note.geometry.computeBoundingBox();
    expect(note.geometry.boundingBox!.min.y).toBeCloseTo(0);
    expect(LevelNote.is(new THREE.Mesh())).toBe(false);
    expect(FactoryObjectIcon.getIcon(LevelNote.create({ text: '' }, 0x3b82f6))).toEqual({
      character: '✎',
      color: '#3b82f6',
    });
  });

  it('normalizes untrusted text', () => {
    expect(LevelNote.normalize(null)).toEqual({ text: '' });
    expect(LevelNote.normalize({ text: 5 })).toEqual({ text: '' });
    expect(LevelNote.normalize({ text: 'a\r\nb\rc' })).toEqual({ text: 'a\nb\nc' });
    expect(LevelNote.normalize({ text: 'x'.repeat(LEVEL_NOTE_TEXT_MAX + 9) }).text).toHaveLength(LEVEL_NOTE_TEXT_MAX);
  });

  it('saves and loads its text, color, name and transform', () => {
    const { world, note } = worldWithNote();
    const json = JSON.parse(JSON.stringify(new SceneSerializer().serialize(world)));
    const entry = json.objects.find((candidate: { uuid: string }) => candidate.uuid === note.uuid);
    expect(entry.levelNote).toEqual({ text: 'Guard spawns here' });
    expect(entry.geometryData).toBeUndefined();
    const loaded = new THREE.Group();
    new SceneDeserializer().deserialize(json, loaded);
    const copy = loaded.getObjectByProperty('uuid', note.uuid)!;
    expect(LevelNote.is(copy)).toBe(true);
    expect(LevelNote.read(copy).text).toBe('Guard spawns here');
    expect(LevelNote.color(copy)).toBe(0x3b82f6);
    expect(copy.name).toBe('Guard Note');
    expect(copy.position.toArray()).toEqual([1, 2, 3]);
    expect(levelNoteLabelOf(copy)).not.toBeNull();
  });

  it('copies and pastes as an independent note', () => {
    const { world, note } = worldWithNote();
    const { data } = clipboardSceneCopy([note]);
    const command = new CommandClipboardScenePaste(world, JSON.parse(JSON.stringify(data)));
    command.execute();
    const pasted = command.pasted()[0]!;
    expect(pasted).not.toBe(note);
    expect(pasted.uuid).not.toBe(note.uuid);
    expect(LevelNote.read(pasted).text).toBe('Guard spawns here');
    LevelNote.write(pasted, { text: 'Changed copy' });
    expect(LevelNote.read(note).text).toBe('Guard spawns here');
    command.undo();
    expect(pasted.parent).toBeNull();
  });

  it('is left out of game exports and player collision', () => {
    const { world, note } = worldWithNote();
    const exported = buildExportScene(world);
    const names: string[] = [];
    exported.traverse((object) => names.push(object.name));
    expect(names).toContain('Cube');
    expect(names).not.toContain('Guard Note');
    let sprites = 0;
    exported.traverse((object) => {
      if (object instanceof THREE.Sprite) sprites++;
    });
    expect(sprites).toBe(0);
    expect(playerCollisionIsCollidableMesh(note)).toBe(false);
  });

  it('edits text through an undoable command', () => {
    const note = LevelNote.create({ text: 'Before' });
    const stack = new CommandStack(8);
    stack.push(new CommandLevelNoteSet(note, LevelNote.read(note), { text: 'After' }));
    expect(LevelNote.read(note).text).toBe('After');
    stack.undo();
    expect(LevelNote.read(note).text).toBe('Before');
    stack.redo();
    expect(LevelNote.read(note).text).toBe('After');
  });

  it('edits in the inspector as one undo step per edit and respects locks', () => {
    const section = new PanelPropertiesLevelNoteSection(
      () => document.createElement('section'),
      (title) => Object.assign(document.createElement('header'), { textContent: title }),
    );
    const stack = new CommandStack(8);
    section.setCommandStack(stack);
    document.body.appendChild(section.getElement());
    const note = LevelNote.create({ text: 'First' });
    section.updateFromObjects([new THREE.Group()]);
    expect(section.getElement().style.display).toBe('none');
    section.updateFromObjects([note]);
    const root = section.getElement();
    expect(root.style.display).toBe('');
    expect(root.querySelector('header')?.textContent).toBe('Note');
    const field = root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note Text"]')!;
    expect(field.value).toBe('First');
    field.value = 'Second line\nThird line';
    field.dispatchEvent(new Event('change'));
    expect(LevelNote.read(note).text).toBe('Second line\nThird line');
    stack.undo();
    expect(LevelNote.read(note).text).toBe('First');
    section.updateFromObjects([note]);
    expect(field.value).toBe('First');
    section.updateFromObjects([note, LevelNote.create({ text: '' })]);
    expect(root.style.display).toBe('none');
    setObjectLocked(note, true);
    section.updateFromObjects([note]);
    expect(field.disabled).toBe(true);
  });

  it('syncs creation and text edits to collaborators in place', () => {
    const owner = new ReplicaCollaborationScene(new THREE.Group());
    owner.locks.selfSet(1);
    owner.baselineInitialize();
    const joiner = new ReplicaCollaborationScene(new THREE.Group());
    joiner.locks.selfSet(2);
    joiner.snapshotApply(JSON.parse(JSON.stringify(owner.snapshotStates())));
    const tracker = new TrackerCollaboration(owner, 1 << 22);
    const note = LevelNote.create({ text: 'Light here' }, 0x22c55e);
    note.name = 'Light Note';
    owner.world.add(note);
    joiner.remoteApply(JSON.parse(JSON.stringify(tracker.commit().ops)));
    const remote = replicaObject(joiner, note.uuid);
    expect(LevelNote.is(remote)).toBe(true);
    expect(LevelNote.read(remote).text).toBe('Light here');
    expect(LevelNote.color(remote)).toBe(0x22c55e);
    LevelNote.write(note, { text: 'Light here, warm' });
    const ops = tracker.commit().ops;
    expect(ops.length).toBeGreaterThan(0);
    joiner.remoteApply(JSON.parse(JSON.stringify(ops)));
    expect(replicaObject(joiner, note.uuid)).toBe(remote);
    expect(LevelNote.read(remote).text).toBe('Light here, warm');
    expect(tracker.commit().ops).toEqual([]);
  });

  it('wraps label text into a few lines and marks a cut', () => {
    expect(levelNoteLabelBody('')).toEqual([]);
    expect(levelNoteLabelBody('short\n\nnext')).toEqual(['short', 'next']);
    const long = levelNoteLabelBody('word '.repeat(60));
    expect(long).toHaveLength(4);
    expect(long[3]!.endsWith('…')).toBe(true);
    for (const line of long) expect(line.length).toBeLessThanOrEqual(36);
  });
});
