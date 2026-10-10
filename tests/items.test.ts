import { describe, expect, it } from 'vitest';
import { compareEquip, equipJob, sameEquipJob } from '../src/proto3d/items';

describe('equip comparison jobs', () => {
  it('treats main-hand gear and fists as weapons, mail as armour', () => {
    expect(equipJob('axe')).toBe('weapon');
    expect(equipJob('ashmantle_hammer')).toBe('weapon');
    expect(equipJob('torch_lit')).toBe('weapon');
    expect(equipJob('empty_hand')).toBe('weapon');
    expect(equipJob('chain_mail')).toBe('armour');
  });

  it('does not assign a job to shields, pouches, scrolls, or lanterns', () => {
    expect(equipJob('iron_shield')).toBeNull();
    expect(equipJob('shield')).toBeNull();
    expect(equipJob('tricks_pouch')).toBeNull();
    expect(equipJob('scroll')).toBeNull();
    expect(equipJob('prayer_lantern')).toBeNull();
  });

  it('compares only weapon-vs-weapon and armour-vs-armour', () => {
    expect(sameEquipJob('ashmantle_hammer', 'axe')).toBe(true);
    expect(sameEquipJob('torch_lit', 'axe')).toBe(true);
    expect(sameEquipJob('axe', 'axe')).toBe(true);
    expect(sameEquipJob('chain_mail', undefined)).toBe(true);
    expect(sameEquipJob('iron_shield', 'tricks_pouch')).toBe(false);
    expect(sameEquipJob('iron_shield', 'scroll')).toBe(false);
    expect(sameEquipJob('iron_shield', 'shield')).toBe(false);
  });

  it('scores better / worse / same for matching jobs', () => {
    expect(compareEquip('ashmantle_hammer', 'axe')).toBe('better');
    expect(compareEquip('torch_lit', 'axe')).toBe('worse');
    expect(compareEquip('axe', 'axe')).toBe('same');
  });
});
