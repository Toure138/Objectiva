import { describe, expect, it } from 'vitest';
import { formatHlc, initialHlc, isHlc, parseHlc, receiveHlc, tickHlc } from '../../../shared/src/hlc.ts';

describe('horloge hybride', () => {
  it('se formate et se relit sans perte, et se compare comme du texte', () => {
    const h = { wall: 1_762_246_800_000, counter: 7, node: 'phone-a' };
    expect(formatHlc(h)).toBe('001762246800000.00007.phone-a');
    expect(parseHlc(formatHlc(h))).toEqual(h);
    expect(isHlc(formatHlc(h))).toBe(true);
    for (const bad of ['', 'abc', '1.2.3', '001762246800000.7.phone', 42, null]) expect(isHlc(bad)).toBe(false);
    const a = formatHlc({ wall: 999, counter: 0, node: 'z' });
    const b = formatHlc({ wall: 1000, counter: 0, node: 'a' });
    const c = formatHlc({ wall: 1000, counter: 1, node: 'a' });
    expect([c, a, b].sort()).toEqual([a, b, c]);
  });

  it('avance toujours, même si l’horloge de l’appareil recule ou fait du surplace', () => {
    let h = initialHlc('phone-a');
    h = tickHlc(h, 5000);
    expect(h).toMatchObject({ wall: 5000, counter: 0 });
    const same = tickHlc(h, 5000);
    expect(formatHlc(same) > formatHlc(h)).toBe(true);
    const back = tickHlc(same, 100);
    expect(back.wall).toBe(5000);
    expect(formatHlc(back) > formatHlc(same)).toBe(true);
    const forward = tickHlc(back, 9000);
    expect(forward).toMatchObject({ wall: 9000, counter: 0 });
  });

  it('intègre une valeur vue ailleurs : la suivante lui est strictement supérieure', () => {
    const local = tickHlc(initialHlc('phone-a'), 1000);
    const remote = { wall: 8000, counter: 3, node: 'server' };
    const next = receiveHlc(local, remote, 2000);
    expect(next.node).toBe('phone-a');
    expect(next.wall).toBe(8000);
    expect(next.counter).toBe(4);
    const after = tickHlc(next, 2500);
    expect(formatHlc(after) > formatHlc(remote)).toBe(true);
    // Si l'horloge locale est la plus avancée, le compteur repart de zéro.
    expect(receiveHlc(local, { wall: 10, counter: 9, node: 'x' }, 50_000)).toMatchObject({ wall: 50_000, counter: 0 });
  });
});
