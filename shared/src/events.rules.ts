// Règles de calcul des événements. Fonctions pures : testées sans base de données.
// Un événement est stocké en instants UTC ; le fuseau de l'utilisateur donne le jour et l'heure locaux.

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Décalage (en minutes) entre l'heure locale du fuseau et UTC à un instant donné. */
function offsetMinutes(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const localAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((localAsUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/**
 * Convertit « jour + heure locaux » en instant UTC. Deux passes : la seconde corrige le cas
 * où le décalage change entre l'estimation et l'instant réel (changement d'heure).
 * Une heure inexistante (saut de printemps) est décalée vers l'heure valide suivante.
 */
export function localToUtc(date: string, time: string, timezone: string): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const first = naive - offsetMinutes(timezone, new Date(naive)) * 60_000;
  return new Date(naive - offsetMinutes(timezone, new Date(first)) * 60_000);
}

/** Jour (AAAA-MM-JJ) et heure (HH:mm) locaux d'un instant. */
export function utcToLocal(instant: Date, timezone: string): { date: string; time: string } {
  const shifted = new Date(instant.getTime() + offsetMinutes(timezone, instant) * 60_000);
  const iso = shifted.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Bornes UTC d'une plage de jours locaux : `start` inclus, `end` exclu (minuit suivant `to`). */
export function localDaysToUtc(from: string, to: string, timezone: string): { start: Date; end: Date } {
  const next = new Date(`${to}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    start: localToUtc(from, '00:00', timezone),
    end: localToUtc(next.toISOString().slice(0, 10), '00:00', timezone),
  };
}

/** Plage réservée avant l'événement : déplacement puis préparation. */
export function blockedWindow(startsAt: Date, travelMinutes: number, prepMinutes: number, timezone: string) {
  const minutes = travelMinutes + prepMinutes;
  const from = new Date(startsAt.getTime() - minutes * 60_000);
  const leaveAt = travelMinutes > 0 ? new Date(startsAt.getTime() - travelMinutes * 60_000) : null;
  return {
    blockedFrom: from,
    blockedMinutes: minutes,
    blockedFromTime: utcToLocal(from, timezone).time,
    leaveAtTime: leaveAt ? utcToLocal(leaveAt, timezone).time : null,
  };
}

export interface EventSummary {
  /** Prévus et pas encore réalisés. */
  planned: number;
  done: number;
  cancelled: number;
  /** Prévus + réalisés (hors annulés) : base pour dire « 2 rencontres sur 3 ». */
  expected: number;
}

export function summarizeEvents(events: { status: 'PREVU' | 'REALISE' | 'ANNULE' }[]): EventSummary {
  const planned = events.filter((e) => e.status === 'PREVU').length;
  const done = events.filter((e) => e.status === 'REALISE').length;
  return { planned, done, cancelled: events.filter((e) => e.status === 'ANNULE').length, expected: planned + done };
}

/** Jour de la tâche de préparation / de suivi proposé par défaut, jamais dans le passé. */
export function defaultTaskDate(role: 'PREPARATION' | 'SUIVI', eventDate: string, today: string): string {
  const d = new Date(`${eventDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (role === 'PREPARATION' ? -1 : 1));
  const wanted = d.toISOString().slice(0, 10);
  return wanted < today ? today : wanted;
}
