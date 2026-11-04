// Horloge hybride (HLC) : ordonne les modifications faites sur des appareils différents, même si
// leurs horloges divergent un peu. Format texte à largeur fixe, donc comparable avec `<` et `>` :
//   « 001762246800000.00000.appareil »  =  millisecondes . compteur . identifiant de l'appareil
// Principe : l'horloge ne recule jamais, et chaque modification reçoit une valeur strictement
// supérieure à toutes celles que l'appareil a vues (les siennes et celles reçues du serveur).

export interface Hlc {
  wall: number;
  counter: number;
  node: string;
}

const WALL_DIGITS = 15;
const COUNTER_DIGITS = 5;

export function formatHlc(h: Hlc): string {
  return `${String(h.wall).padStart(WALL_DIGITS, '0')}.${String(h.counter).padStart(COUNTER_DIGITS, '0')}.${h.node}`;
}

const HLC_RE = /^(\d{15})\.(\d{5})\.([\w-]{1,64})$/;

export function parseHlc(text: string): Hlc | null {
  const m = HLC_RE.exec(text);
  return m ? { wall: Number(m[1]), counter: Number(m[2]), node: m[3]! } : null;
}

export function isHlc(text: unknown): text is string {
  return typeof text === 'string' && HLC_RE.test(text);
}

/** Valeur suivante pour une modification locale. `now` : millisecondes de l'horloge de l'appareil. */
export function tickHlc(prev: Hlc, now: number): Hlc {
  const wall = Math.max(prev.wall, now);
  return { wall, counter: wall === prev.wall ? prev.counter + 1 : 0, node: prev.node };
}

/** Intègre une valeur vue ailleurs (serveur, autre appareil) pour que la suivante lui soit supérieure. */
export function receiveHlc(local: Hlc, remote: Hlc, now: number): Hlc {
  const wall = Math.max(local.wall, remote.wall, now);
  let counter = 0;
  if (wall === local.wall && wall === remote.wall) counter = Math.max(local.counter, remote.counter) + 1;
  else if (wall === local.wall) counter = local.counter + 1;
  else if (wall === remote.wall) counter = remote.counter + 1;
  return { wall, counter, node: local.node };
}

/** Valeur de départ d'un appareil. */
export const initialHlc = (node: string): Hlc => ({ wall: 0, counter: 0, node });
