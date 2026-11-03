// Affichage des dates de calendrier (AAAA-MM-JJ). Aucune conversion de fuseau :
// une date sans heure reste la même partout.

const LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const SHORT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** « aujourd'hui », « demain », « hier » ou la date courte. */
export function relativeDay(date: string | null, today = localToday()): string {
  if (!date) return 'À planifier';
  if (date === today) return "Aujourd'hui";
  if (date === addDays(today, 1)) return 'Demain';
  if (date === addDays(today, -1)) return 'Hier';
  return SHORT.format(toUtc(date));
}

export function longDate(date: string): string {
  const s = LONG.format(toUtc(date));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shortDate(date: string | null): string {
  return date ? SHORT.format(toUtc(date)) : '—';
}
