import { RoomRegistry, generateCode } from '../rooms';
import '../../engine/cards';

const deps = () => ({ send: () => {}, now: () => 0, random: Math.random, token: () => Math.random().toString(16).slice(2) });

describe('RoomRegistry', () => {
  it('generates 4-letter codes without I or O', () => {
    for (let i = 0; i < 200; i++) expect(generateCode(Math.random)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  });
  it('creates unique rooms up to the max and finds them case-insensitively', () => {
    const reg = new RoomRegistry(deps(), { max: 3 });
    const a = reg.create(); reg.create(); reg.create();
    expect(() => reg.create()).toThrow(/Too many/);
    expect(reg.get(a.code.toLowerCase())).toBe(a);
  });
  it('sweeps idle and empty rooms', () => {
    let t = 0; const d = { ...deps(), now: () => t };
    const reg = new RoomRegistry(d, { idleMs: 1000, emptyMs: 100 });
    const busy = reg.create(); busy.create('c', 'x');
    const empty = reg.create();
    t = 150; expect(reg.sweep(t)).toEqual([empty.code]);
    busy.disconnect('c'); t = 300; expect(reg.sweep(t)).toEqual([busy.code]);   // nobody connected for > emptyMs
    const idle = reg.create(); idle.create('c', 'x'); t = 2000; expect(reg.sweep(t)).toEqual([idle.code]);
  });
});
