import { describe, expect, it } from 'vitest';
import {
  blockedWindow,
  defaultTaskDate,
  localDaysToUtc,
  localToUtc,
  summarizeEvents,
  utcToLocal,
} from '../../src/modules/events/events.rules.ts';

describe('événements : fuseaux horaires', () => {
  it('convertit un jour et une heure locaux en UTC (Abidjan = UTC)', () => {
    expect(localToUtc('2026-11-04', '10:00', 'Africa/Abidjan').toISOString()).toBe('2026-11-04T10:00:00.000Z');
  });

  it("tient compte de l'heure d'été et d'hiver à Paris", () => {
    expect(localToUtc('2026-07-01', '10:00', 'Europe/Paris').toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(localToUtc('2026-12-01', '10:00', 'Europe/Paris').toISOString()).toBe('2026-12-01T09:00:00.000Z');
  });

  it("reste exact le jour du changement d'heure (30 mars et 26 octobre 2025)", () => {
    expect(localToUtc('2025-03-30', '01:30', 'Europe/Paris').toISOString()).toBe('2025-03-30T00:30:00.000Z');
    expect(localToUtc('2025-03-30', '03:30', 'Europe/Paris').toISOString()).toBe('2025-03-30T01:30:00.000Z');
    expect(localToUtc('2025-10-26', '01:30', 'Europe/Paris').toISOString()).toBe('2025-10-25T23:30:00.000Z');
    expect(localToUtc('2025-10-26', '04:00', 'Europe/Paris').toISOString()).toBe('2025-10-26T03:00:00.000Z');
  });

  it('gère un fuseau à l’ouest de UTC sans changer de jour local', () => {
    const d = localToUtc('2026-11-04', '22:30', 'America/New_York');
    expect(d.toISOString()).toBe('2026-11-05T03:30:00.000Z');
    expect(utcToLocal(d, 'America/New_York')).toEqual({ date: '2026-11-04', time: '22:30' });
  });

  it('aller-retour local ↔ UTC dans plusieurs fuseaux', () => {
    for (const tz of ['Europe/Paris', 'Africa/Abidjan', 'Asia/Kolkata', 'Pacific/Auckland']) {
      expect(utcToLocal(localToUtc('2026-03-29', '09:15', tz), tz)).toEqual({ date: '2026-03-29', time: '09:15' });
    }
  });

  it('borne un jour local en UTC', () => {
    const { start, end } = localDaysToUtc('2026-07-01', '2026-07-01', 'Europe/Paris');
    expect(start.toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-01T22:00:00.000Z');
  });
});

describe('événements : règles', () => {
  it('réserve le déplacement et la préparation avant l’événement', () => {
    const start = localToUtc('2026-11-04', '10:00', 'Africa/Abidjan');
    expect(blockedWindow(start, 45, 30, 'Africa/Abidjan')).toMatchObject({
      blockedMinutes: 75,
      blockedFromTime: '08:45',
      leaveAtTime: '09:15',
    });
    expect(blockedWindow(start, 0, 0, 'Africa/Abidjan')).toMatchObject({ blockedMinutes: 0, leaveAtTime: null });
  });

  it('compte les événements par statut', () => {
    const events = [{ status: 'PREVU' }, { status: 'REALISE' }, { status: 'REALISE' }, { status: 'ANNULE' }] as const;
    expect(summarizeEvents([...events])).toEqual({ planned: 1, done: 2, cancelled: 1, expected: 3 });
  });

  it('propose la veille (préparation) ou le lendemain (suivi), jamais dans le passé', () => {
    expect(defaultTaskDate('PREPARATION', '2026-11-10', '2026-11-03')).toBe('2026-11-09');
    expect(defaultTaskDate('PREPARATION', '2026-11-03', '2026-11-03')).toBe('2026-11-03');
    expect(defaultTaskDate('SUIVI', '2026-11-03', '2026-11-03')).toBe('2026-11-04');
    expect(defaultTaskDate('SUIVI', '2026-10-01', '2026-11-03')).toBe('2026-11-03');
  });
});
