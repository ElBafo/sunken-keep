import { describe, expect, it } from 'vitest';
import { applyShadowToggle, type ShadowLight } from '../src/voxel-lab/shadows';

type FakeMat = { needsUpdate: boolean };

function mesh(opts: {
  cast?: boolean;
  receive?: boolean;
  noShadow?: boolean;
  material?: FakeMat | FakeMat[];
}) {
  const obj = {
    isMesh: true,
    castShadow: opts.cast ?? false,
    receiveShadow: opts.receive ?? false,
    userData: { noShadow: opts.noShadow },
    material: opts.material ?? { needsUpdate: false }
  };
  return obj;
}

function group(children: ReturnType<typeof mesh>[]) {
  return {
    traverse(fn: (obj: unknown) => void) {
      for (const child of children) fn(child);
    }
  };
}

describe('applyShadowToggle', () => {
  it('enables renderer.shadowMap, light.castShadow, mesh flags, and material.needsUpdate', () => {
    const renderer = { shadowMap: { enabled: false, needsUpdate: false } };
    const light: ShadowLight = { castShadow: false, shadow: { map: null } };
    const mat: FakeMat = { needsUpdate: false };
    const crate = mesh({ material: mat });
    const counts = applyShadowToggle({
      on: true,
      renderer,
      lights: [{ light, active: true }],
      roots: [group([crate])] as never
    });
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    expect(light.castShadow).toBe(true);
    expect(crate.castShadow).toBe(true);
    expect(crate.receiveShadow).toBe(true);
    expect(mat.needsUpdate).toBe(true);
    expect(counts.lightCast).toBe(1);
    expect(counts.meshCast).toBe(1);
    expect(counts.meshReceive).toBe(1);
  });

  it('disables everything, skips noShadow meshes, and disposes shadow maps', () => {
    let disposed = 0;
    const renderer = { shadowMap: { enabled: true, needsUpdate: false } };
    const light: ShadowLight = {
      castShadow: true,
      shadow: { map: { dispose: () => { disposed += 1; } } }
    };
    const wall = mesh({ cast: true, receive: true, material: { needsUpdate: false } });
    const hit = mesh({
      cast: true,
      receive: true,
      noShadow: true,
      material: { needsUpdate: false }
    });
    const inactive: ShadowLight = { castShadow: true, shadow: { map: null } };
    applyShadowToggle({
      on: false,
      renderer,
      lights: [
        { light, active: true },
        { light: inactive, active: false }
      ],
      roots: [group([wall, hit])] as never
    });
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    expect(light.castShadow).toBe(false);
    expect(inactive.castShadow).toBe(false);
    expect(light.shadow?.map).toBeNull();
    expect(disposed).toBe(1);
    expect(wall.castShadow).toBe(false);
    expect(wall.receiveShadow).toBe(false);
    expect(hit.castShadow).toBe(false);
    expect(hit.receiveShadow).toBe(false);
    expect(wall.material).toMatchObject({ needsUpdate: true });
  });

  it('does not let inactive lights cast even when shadows are on', () => {
    const renderer = { shadowMap: { enabled: false, needsUpdate: false } };
    const lamp: ShadowLight = { castShadow: false, shadow: { map: null } };
    applyShadowToggle({
      on: true,
      renderer,
      lights: [{ light: lamp, active: false }],
      roots: []
    });
    expect(lamp.castShadow).toBe(false);
    expect(renderer.shadowMap.enabled).toBe(true);
  });
});
