import { describe, expect, it } from 'vitest';

import { settlementStatus } from '../../../../shared/src/budget.rules';
import { localToUtc } from '../../../../shared/src/events.rules';
import { createEventSchema } from '../../../../shared/src/events.schemas';
import { measuredProgress } from '../../../../shared/src/goals.rules';

// Les règles partagées (dossier shared/) doivent tourner aussi dans l'application :
// c'est ce qui permettra de calculer hors connexion exactement comme le serveur.
describe('règles partagées côté application', () => {
  it('calcule une progression mesurée comme le serveur', () => {
    const p = measuredProgress({ start: 0, target: 3, unit: 'démonstrations', readings: [] });
    expect(p).toMatchObject({ percent: 0, label: '0 sur 3 démonstrations' });
  });

  it('convertit un jour et une heure locaux en instant UTC, changement d’heure compris', () => {
    expect(localToUtc('2026-07-01', '10:00', 'Europe/Paris').toISOString()).toBe('2026-07-01T08:00:00.000Z');
  });

  it('détermine le statut d’un règlement', () => {
    expect(settlementStatus({ plannedAmount: 15_000, paid: 9_000, closed: false, cancelled: false })).toBe('PARTIELLE');
  });

  it('valide une entrée avec les mêmes schémas que le serveur', () => {
    const bad = createEventSchema.safeParse({
      type: 'REUNION',
      title: 'X',
      date: '2026-11-04',
      startTime: '12:00',
      endTime: '11:00',
    });
    expect(bad.success).toBe(false);
    const ok = createEventSchema.safeParse({
      type: 'REUNION',
      title: 'X',
      date: '2026-11-04',
      startTime: '10:00',
      endTime: '11:00',
    });
    expect(ok.success).toBe(true);
  });
});
