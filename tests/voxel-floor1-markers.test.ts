import { describe, expect, it, beforeEach } from 'vitest';
import { floor1 } from '../public/levels/floor1';
import { buildFloor1Markers, floor1SecretMarkers, markerUnlocked } from '../src/voxel-floor1/markers';
import { floor1Map, resetFloor1Doors, tileAt } from '../src/voxel-floor1/layout';

describe('voxel-floor1 secret placeholders match Classic contents', () => {
  beforeEach(() => resetFloor1Doors());

  it('places Classic floor-1 secret contents: carving at (5,1), journal at (4,13)', () => {
    expect(tileAt(floor1Map, 5, 1)?.secret).toBe(true);
    expect((floor1.tiles[1][5] as { carving?: string }).carving).toBe('carving_secret');
    expect((floor1.tiles[13][4] as { item?: string; journalPage?: number }).item).toBe('journal_page');
    expect((floor1.tiles[13][4] as { journalPage?: number }).journalPage).toBe(1);
    expect(floor1SecretMarkers.map((m) => m.id)).toEqual(['carving_secret', 'journal_page_1']);
    expect(floor1SecretMarkers[0]).toMatchObject({
      x: 5,
      y: 1,
      secretX: 5,
      secretY: 1,
      prompt: '"We gave much. We need more."'
    });
    expect(floor1SecretMarkers[1]).toMatchObject({
      x: 4,
      y: 13,
      secretX: 5,
      secretY: 13,
      prompt: "Orrun's journal. The ink still holds."
    });
  });

  it('hides markers until the matching secret opens, then returns Classic tap lines', () => {
    const markers = buildFloor1Markers(floor1Map);
    expect(markerUnlocked(floor1Map, floor1SecretMarkers[0])).toBe(false);
    expect(markers.group.children.every((child) => child.visible === false)).toBe(true);
    expect(markers.interact(5, 1, 0)).toBeNull();
    expect(markers.interact(6, 13, 3)).toBeNull();

    tileAt(floor1Map, 5, 1)!.secretOpen = true;
    tileAt(floor1Map, 5, 13)!.secretOpen = true;
    expect(markers.interact(5, 1, 0)).toBe('"We gave much. We need more."');
    expect(markers.interact(5, 13, 3)).toBe("Orrun's journal. The ink still holds.");
    expect(markers.interact(4, 13, 3)).toBe("Orrun's journal. The ink still holds.");
    expect(markers.group.getObjectByName('carving_secret')?.visible).toBe(true);
    expect(markers.group.getObjectByName('journal_page_1')?.visible).toBe(true);
  });
});
