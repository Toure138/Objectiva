// Normalisation des réponses avant comparaison : on retire ce qui varie d'une exécution à l'autre
// (identifiants tirés au hasard par le serveur, dates de création posées par la base) et on garde
// tout ce qui relève des règles de calcul. Partagé par le test serveur et, plus tard, le moteur local.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
/** Identifiants fixes des scénarios (voir `uid`) : lisibles, conservés tels quels. */
const FIXED = /^00000000-0000-4000-8000-/;
/** Horodatages posés par la base (default now()) : non déterministes. */
const VOLATILE_KEYS = new Set(['createdAt', 'updatedAt']);

export interface Normalizer {
  (value: unknown): unknown;
}

/** `saved` : valeurs mémorisées par les étapes (`{ tx1: '…uuid…' }`), remplacées par `{{tx1}}`. */
export function makeNormalizer(saved: Record<string, string>): Normalizer {
  const names = new Map(Object.entries(saved).map(([name, id]) => [id, `{{${name}}}`]));
  const unknown = new Map<string, string>();

  const label = (id: string): string => {
    if (FIXED.test(id)) return id;
    const known = names.get(id);
    if (known) return known;
    if (!unknown.has(id)) unknown.set(id, `<uuid#${unknown.size + 1}>`);
    return unknown.get(id)!;
  };

  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(UUID, (m) => label(m));
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        if (VOLATILE_KEYS.has(k)) continue;
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return walk;
}

/** Lit une valeur le long d'un chemin pointé (`data.transaction.id`). */
export function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc !== null && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), value);
}

/** Remplace `{{nom}}` par la valeur mémorisée, dans une chaîne ou récursivement dans un objet. */
export function fill<T>(value: T, saved: Record<string, string>): T {
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => {
      const id = saved[name];
      if (id === undefined) throw new Error(`Valeur « ${name} » non mémorisée par une étape précédente`);
      return id;
    }) as T;
  }
  if (Array.isArray(value)) return value.map((v) => fill(v, saved)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, saved)])) as T;
  }
  return value;
}
