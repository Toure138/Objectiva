import { describe, expect, it } from 'vitest';
import { notificationId, reminderAt, reminderText } from '../../../shared/src/reminders.rules.ts';

// Spec 011 : moment et texte des rappels.

const ev = (over: object = {}) => ({
  title: 'Point d’équipe',
  location: null as string | null,
  startsAt: '2026-11-05T09:00:00.000Z',
  travelBeforeMinutes: 0,
  prepBeforeMinutes: 0,
  ...over,
});
const at = (e: ReturnType<typeof ev>, c: Parameters<typeof reminderAt>[1]) => reminderAt(e, c)?.toISOString().slice(11, 16) ?? null;

describe('rappels', () => {
  it('moment du rappel selon le choix', () => {
    expect(at(ev(), 'AUCUN')).toBeNull();
    expect(at(ev(), 'HEURE')).toBe('09:00');
    expect(at(ev(), 'M15')).toBe('08:45');
    expect(at(ev(), 'M30')).toBe('08:30');
    expect(at(ev(), 'H1')).toBe('08:00');
  });

  it('« quand partir » : début du temps réservé, sinon 15 min avant', () => {
    expect(at(ev(), 'DEPART')).toBe('08:45');
    expect(at(ev({ travelBeforeMinutes: 45 }), 'DEPART')).toBe('08:15');
    expect(at(ev({ travelBeforeMinutes: 45, prepBeforeMinutes: 30 }), 'DEPART')).toBe('07:45');
    expect(at(ev({ prepBeforeMinutes: 20 }), 'DEPART')).toBe('08:40');
  });

  it('texte : heure locale, consigne et lieu', () => {
    expect(reminderText(ev({ travelBeforeMinutes: 30, location: 'Salle B' }), 'DEPART', 'Europe/Paris')).toEqual({
      title: 'Point d’équipe à 10:00',
      body: 'Pars maintenant · Salle B',
    });
    expect(reminderText(ev({ prepBeforeMinutes: 30 }), 'DEPART', 'Africa/Abidjan').body).toBe('Commence à te préparer');
    expect(reminderText(ev(), 'DEPART', 'Africa/Abidjan').body).toBe('Dans 15 min');
    expect(reminderText(ev(), 'HEURE', 'Africa/Abidjan').body).toBe('C’est maintenant');
    expect(reminderText(ev(), 'H1', 'Africa/Abidjan').body).toBe('Dans 1 h');
  });

  it('identifiant de notification : entier 32 bits positif, stable, distinct', () => {
    const a = notificationId('3f1c2a90-4b7e-4c3d-9a2b-1e5f6a7b8c9d');
    expect(a).toBe(notificationId('3f1c2a90-4b7e-4c3d-9a2b-1e5f6a7b8c9d'));
    expect(Number.isInteger(a) && a > 0 && a <= 2_147_483_647).toBe(true);
    const ids = new Set(Array.from({ length: 2000 }, (_, i) => notificationId(`00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`)));
    expect(ids.size).toBe(2000);
  });
});
