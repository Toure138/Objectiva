import { describe, expect, it } from 'vitest';
import { gridHours, layoutDay, type AgendaSlot } from '../../../shared/src/agenda.rules.ts';
import {
  firstDateFrom,
  generationHorizon,
  isoWeekday,
  occurrenceId,
  seriesDates,
} from '../../../shared/src/recurrence.rules.ts';

// Spec 009 : règles pures de la récurrence et de l'agenda du jour.

const h = (hh: number, mm = 0) => hh * 60 + mm;
const slot = (id: string, start: number, end: number, before = 0): AgendaSlot => ({ id, start, end, blockedStart: start - before });

describe('récurrence', () => {
  it('jour de la semaine ISO : lundi = 1, dimanche = 7', () => {
    expect(isoWeekday('2026-11-02')).toBe(1);
    expect(isoWeekday('2026-11-08')).toBe(7);
  });

  it('chaque jour, en semaine, certains jours, chaque semaine', () => {
    const from = '2026-11-02'; // lundi
    const to = '2026-11-15';
    expect(seriesDates({ weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: from, until: null }, from, '2026-11-04')).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ]);
    expect(seriesDates({ weekdays: [1, 2, 3, 4, 5], startDate: from, until: null }, from, to)).toHaveLength(10);
    expect(seriesDates({ weekdays: [1, 3, 5], startDate: from, until: null }, from, '2026-11-08')).toEqual([
      '2026-11-02',
      '2026-11-04',
      '2026-11-06',
    ]);
    expect(seriesDates({ weekdays: [4], startDate: '2026-11-05', until: null }, from, to)).toEqual(['2026-11-05', '2026-11-12']);
  });

  it('respecte le début et la fin de la série, quelle que soit la plage demandée', () => {
    const rule = { weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: '2026-11-10', until: '2026-11-12' };
    expect(seriesDates(rule, '2026-11-01', '2026-11-30')).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    expect(seriesDates(rule, '2026-11-13', '2026-11-30')).toEqual([]);
    expect(firstDateFrom({ weekdays: [5], startDate: '2026-11-02', until: null }, '2026-11-02')).toBe('2026-11-06');
    expect(firstDateFrom({ weekdays: [5], startDate: '2026-11-02', until: '2026-11-05' }, '2026-11-02')).toBeNull();
  });

  it('horizon : 60 jours, ou la plage consultée, jamais plus d’un an', () => {
    expect(generationHorizon('2026-11-04')).toBe('2027-01-03');
    expect(generationHorizon('2026-11-04', '2026-11-30')).toBe('2027-01-03');
    expect(generationHorizon('2026-11-04', '2027-03-01')).toBe('2027-03-01');
    expect(generationHorizon('2026-11-04', '2030-01-01')).toBe('2027-11-05');
  });

  it('identifiant d’occurrence : stable, propre à chaque date et à chaque série, au format UUID v8', () => {
    const s = '3f1c2a90-4b7e-4c3d-9a2b-1e5f6a7b8c9d';
    const a = occurrenceId(s, '2026-11-04');
    expect(a).toBe(occurrenceId(s, '2026-11-04'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(occurrenceId(s, '2026-11-05'));
    expect(a).not.toBe(occurrenceId('3f1c2a90-4b7e-4c3d-9a2b-1e5f6a7b8c9e', '2026-11-04'));
    // Aucune collision, même entre séries dont les identifiants ne diffèrent que par la fin.
    const days = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
    const near = Array.from({ length: 50 }, (_, n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`);
    const all = new Set(near.flatMap((id) => days.map((d) => occurrenceId(id, d))));
    expect(all.size).toBe(near.length * days.length);
  });
});

describe('agenda du jour', () => {
  it('sans chevauchement : une colonne chacun, aucun conflit', () => {
    const out = layoutDay([slot('a', h(9), h(10)), slot('b', h(10), h(11))]);
    expect(out.get('a')).toEqual({ column: 0, columns: 1, conflicts: [] });
    expect(out.get('b')).toEqual({ column: 0, columns: 1, conflicts: [] });
  });

  it('deux réunions qui se croisent : côte à côte, chevauchement signalé des deux côtés', () => {
    const out = layoutDay([slot('a', h(9), h(10)), slot('b', h(9, 30), h(10, 30))]);
    expect(out.get('a')).toEqual({ column: 0, columns: 2, conflicts: [{ withId: 'b', kind: 'CHEVAUCHEMENT' }] });
    expect(out.get('b')).toEqual({ column: 1, columns: 2, conflicts: [{ withId: 'a', kind: 'CHEVAUCHEMENT' }] });
  });

  it('le trajet ou la préparation qui empiète est signalé à part', () => {
    const out = layoutDay([slot('a', h(9), h(10)), slot('b', h(10), h(11), 30)]);
    expect(out.get('b')!.conflicts).toEqual([{ withId: 'a', kind: 'PREPARATION' }]);
    expect(out.get('b')!.column).toBe(1);
  });

  it('une colonne libérée est réutilisée ; le groupe garde son nombre de colonnes', () => {
    // a 9-12 ; b 9-10 ; c 10-11 : c reprend la colonne de b, le groupe a 2 colonnes.
    const out = layoutDay([slot('a', h(9), h(12)), slot('b', h(9), h(10)), slot('c', h(10), h(11))]);
    expect([out.get('a')!.column, out.get('b')!.column, out.get('c')!.column]).toEqual([0, 1, 1]);
    expect(new Set([...out.values()].map((p) => p.columns))).toEqual(new Set([2]));
    expect(out.get('a')!.conflicts.map((c) => c.withId)).toEqual(['b', 'c']);
    // Un rendez-vous isolé plus tard repart à une colonne.
    expect(layoutDay([slot('a', h(9), h(10)), slot('b', h(9), h(10)), slot('z', h(15), h(16))]).get('z')).toEqual({
      column: 0,
      columns: 1,
      conflicts: [],
    });
  });

  it('grille : 7 h – 21 h au minimum, élargie pour une préparation tôt ou une fin tardive', () => {
    expect(gridHours([])).toEqual({ startHour: 7, endHour: 21 });
    expect(gridHours([slot('a', h(6, 30), h(7, 30), 45), slot('b', h(21), h(22, 15))])).toEqual({ startHour: 5, endHour: 23 });
    expect(gridHours([slot('a', h(0, 10), h(1), 60)])).toEqual({ startHour: 0, endHour: 21 });
  });
});
