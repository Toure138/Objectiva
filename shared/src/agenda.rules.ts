// Agenda du jour (spec 009) : placement des rendez-vous sur une grille horaire et chevauchements.
// Fonctions pures, en minutes depuis minuit (heure locale du jour affiché).

export interface AgendaSlot {
  id: string;
  /** Début du rendez-vous. */
  start: number;
  end: number;
  /** Début de la plage réservée (trajet + préparation) ; égal à `start` sans réservation. Peut être négatif (veille). */
  blockedStart: number;
}

export type ConflictKind = 'CHEVAUCHEMENT' | 'PREPARATION';

export interface AgendaConflict {
  withId: string;
  /** `CHEVAUCHEMENT` : les horaires se croisent. `PREPARATION` : seul le trajet ou la préparation empiète. */
  kind: ConflictKind;
}

export interface AgendaPlacement {
  /** Colonne (0, 1…) et nombre de colonnes du groupe : les rendez-vous qui se gênent sont côte à côte. */
  column: number;
  columns: number;
  conflicts: AgendaConflict[];
}

// À début égal, le plus long d'abord : il occupe la colonne de gauche, les courts se rangent à côté.
const order = (a: AgendaSlot, b: AgendaSlot) =>
  a.blockedStart - b.blockedStart || a.start - b.start || b.end - a.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Place chaque rendez-vous (plage réservée comprise) dans la première colonne libre ; un groupe réunit les
 * rendez-vous qui se touchent de proche en proche et partage le même nombre de colonnes.
 */
export function layoutDay(slots: AgendaSlot[]): Map<string, AgendaPlacement> {
  const sorted = [...slots].sort(order);
  const out = new Map<string, AgendaPlacement>();
  let group: AgendaSlot[] = [];
  let columnsEnd: number[] = [];
  let groupEnd = Number.NEGATIVE_INFINITY;

  const close = () => {
    for (const s of group) out.get(s.id)!.columns = columnsEnd.length;
    group = [];
    columnsEnd = [];
  };

  for (const s of sorted) {
    if (s.blockedStart >= groupEnd) close();
    let column = columnsEnd.findIndex((end) => end <= s.blockedStart);
    if (column === -1) column = columnsEnd.push(s.end) - 1;
    else columnsEnd[column] = s.end;
    out.set(s.id, { column, columns: 1, conflicts: [] });
    group.push(s);
    groupEnd = Math.max(groupEnd, s.end);
  }
  close();

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      let kind: ConflictKind | null = null;
      if (a.start < b.end && b.start < a.end) kind = 'CHEVAUCHEMENT';
      else if (a.blockedStart < b.end && b.blockedStart < a.end) kind = 'PREPARATION';
      if (kind) {
        out.get(a.id)!.conflicts.push({ withId: b.id, kind });
        out.get(b.id)!.conflicts.push({ withId: a.id, kind });
      }
    }
  }
  return out;
}

/** Heures de la grille : de 7 h à 21 h au moins, élargies pour montrer chaque rendez-vous et sa préparation. */
export function gridHours(slots: AgendaSlot[]): { startHour: number; endHour: number } {
  let startHour = 7;
  let endHour = 21;
  for (const s of slots) {
    startHour = Math.min(startHour, Math.floor(Math.max(0, s.blockedStart) / 60));
    endHour = Math.max(endHour, Math.ceil(Math.min(24 * 60, s.end) / 60));
  }
  return { startHour, endHour };
}
