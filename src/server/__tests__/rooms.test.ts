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
    const empty = reg.create(); // no seats at all: reaped on sight, regardless of timing
    t = 50; expect(reg.sweep(t)).toEqual([empty.code]);
    t = 60; busy.disconnect('c'); // starts busy's empty-room clock (`emptySince`) at t=60
    t = 150; expect(reg.sweep(t)).toEqual([]); // only 90ms empty, under emptyMs (100)
    t = 200; expect(reg.sweep(t)).toEqual([busy.code]); // 140ms empty, over emptyMs (100)
    const idle = reg.create(); idle.create('c', 'x'); // stays connected for the rest of this test
    t = 1300; expect(reg.sweep(t)).toEqual([idle.code]); // connected, but idle (no activity) > idleMs (1000)
  });
});
