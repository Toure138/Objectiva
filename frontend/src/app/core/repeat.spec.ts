import { describe, expect, it } from 'vitest';

import { modeOf, repeatLabel, weekdaysFor } from './repeat';

describe('répétition : libellés et choix du formulaire', () => {
  it('libellés lisibles', () => {
    const r = (weekdays: number[], until: string | null = null) => ({ weekdays, startDate: '2026-11-04', until });
    expect(repeatLabel(r([1, 2, 3, 4, 5, 6, 7]))).toBe('Chaque jour');
    expect(repeatLabel(r([1, 2, 3, 4, 5]))).toBe('En semaine');
    expect(repeatLabel(r([4]))).toBe('Chaque jeudi');
    expect(repeatLabel(r([1, 3, 5]))).toBe('Lun, mer, ven');
    expect(repeatLabel(r([4], '2026-12-31'))).toBe('Chaque jeudi jusqu’au 31 déc.');
  });

  it('jours envoyés et choix retrouvé', () => {
    // Le 5 novembre 2026 est un jeudi.
    expect(weekdaysFor('weekly', '2026-11-05', [])).toEqual([4]);
    expect(weekdaysFor('custom', '2026-11-05', [5, 1, 3])).toEqual([1, 3, 5]);
    expect(weekdaysFor('none', '2026-11-05', [1])).toEqual([]);
    expect(modeOf([1, 2, 3, 4, 5], '2026-11-05')).toBe('weekdays');
    expect(modeOf([4], '2026-11-05')).toBe('weekly');
    expect(modeOf([2], '2026-11-05')).toBe('custom');
    expect(modeOf([1, 2, 3, 4, 5, 6, 7], '2026-11-05')).toBe('daily');
  });
});
