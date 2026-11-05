import { utcToLocal } from './events.rules';

// Rappels avant les rendez-vous (spec 011). Fonctions pures, testées sans base ni téléphone.

export const REMINDER_CHOICES = ['AUCUN', 'HEURE', 'M15', 'M30', 'H1', 'DEPART'] as const;
export type ReminderChoice = (typeof REMINDER_CHOICES)[number];

/** Réglage par défaut : prévenir quand il faut partir ou commencer à se préparer. */
export const DEFAULT_REMINDER: ReminderChoice = 'DEPART';

const BEFORE: Record<'HEURE' | 'M15' | 'M30' | 'H1', number> = { HEURE: 0, M15: 15, M30: 30, H1: 60 };
/** Sans temps réservé, « quand partir » prévient 15 minutes avant. */
const DEPART_FALLBACK = 15;

export interface RemindedEvent {
  startsAt: string;
  travelBeforeMinutes: number;
  prepBeforeMinutes: number;
}

/** Minutes avant le début du rendez-vous où sonne le rappel ; `null` pour aucun rappel. */
export function reminderOffset(e: RemindedEvent, choice: ReminderChoice): number | null {
  if (choice === 'AUCUN') return null;
  if (choice === 'DEPART') {
    const reserved = e.travelBeforeMinutes + e.prepBeforeMinutes;
    return reserved > 0 ? reserved : DEPART_FALLBACK;
  }
  return BEFORE[choice];
}

/** Instant du rappel ; `null` pour aucun rappel. */
export function reminderAt(e: RemindedEvent, choice: ReminderChoice): Date | null {
  const offset = reminderOffset(e, choice);
  return offset === null ? null : new Date(new Date(e.startsAt).getTime() - offset * 60_000);
}

/** Texte de la notification : « Point d'équipe à 09:00 » / « Pars maintenant · Salle B ». */
export function reminderText(
  e: RemindedEvent & { title: string; location: string | null },
  choice: ReminderChoice,
  timezone: string,
): { title: string; body: string } {
  const time = utcToLocal(new Date(e.startsAt), timezone).time;
  const offset = reminderOffset(e, choice) ?? 0;
  let lead: string;
  if (choice === 'DEPART' && e.travelBeforeMinutes > 0) lead = 'Pars maintenant';
  else if (choice === 'DEPART' && e.prepBeforeMinutes > 0) lead = 'Commence à te préparer';
  else if (offset === 0) lead = 'C’est maintenant';
  else if (offset < 60) lead = `Dans ${offset} min`;
  else lead = offset % 60 === 0 ? `Dans ${offset / 60} h` : `Dans ${Math.floor(offset / 60)} h ${offset % 60}`;
  return { title: `${e.title} à ${time}`, body: e.location ? `${lead} · ${e.location}` : lead };
}

/**
 * Identifiant de notification (entier 32 bits positif, exigé par Android) tiré de l'identifiant du rendez-vous.
 * Le rendez-vous lui-même voyage dans `extra` : une collision ne mélange donc jamais deux fiches.
 */
export function notificationId(eventId: string): number {
  let h = 2166136261;
  for (let i = 0; i < eventId.length; i++) {
    h ^= eventId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Jamais 0 : réservé par certaines versions d'Android.
  return (h >>> 1) || 1;
}
