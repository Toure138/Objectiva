import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import budgetGolden from '../../../../shared/parity/golden/budget-mensuel.json';
import evenementsGolden from '../../../../shared/parity/golden/evenements.json';
import habitudesGolden from '../../../../shared/parity/golden/habitudes.json';
import ordreGolden from '../../../../shared/parity/golden/ordre-des-listes.json';
import progressionGolden from '../../../../shared/parity/golden/progression-mesuree.json';
import reunionsGolden from '../../../../shared/parity/golden/reunions-recurrentes.json';
import tachesGolden from '../../../../shared/parity/golden/taches-et-bilan.json';
import vueGolden from '../../../../shared/parity/golden/vue-ensemble.json';
import { fill, makeNormalizer, readPath } from '../../../../shared/parity/normalize';
import { FROZEN_NOW, SCENARIOS, type Scenario } from '../../../../shared/parity/scenarios';

import { OfflineDb } from './local-db';
import { LocalEngine } from './local-engine';

// Spec 007, phase 1 : PARITÉ. Les scénarios joués contre le vrai serveur (backend/tests/parity) sont
// rejoués ici contre le moteur local du téléphone : les réponses doivent être strictement identiques
// aux références (shared/parity/golden). C'est la garantie que le calcul hors connexion donne le même
// résultat que le serveur.

const GOLDEN: Record<string, unknown> = {
  'taches-et-bilan': tachesGolden,
  'progression-mesuree': progressionGolden,
  evenements: evenementsGolden,
  'budget-mensuel': budgetGolden,
  'ordre-des-listes': ordreGolden,
  'reunions-recurrentes': reunionsGolden,
  'vue-ensemble': vueGolden,
  habitudes: habitudesGolden,
};

/** Scénarios dont TOUS les appels sont gérés localement. Budget : phase 3. */
const LOCAL = [
  'taches-et-bilan',
  'progression-mesuree',
  'ordre-des-listes',
  'evenements',
  'reunions-recurrentes',
  'vue-ensemble',
  'habitudes',
];

let counter = 0;

async function play(scenario: Scenario): Promise<Record<string, unknown>> {
  const db = new OfflineDb(`parite-${Date.now()}-${++counter}`);
  const engine = new LocalEngine(db, { timezone: () => scenario.timezone });
  const saved: Record<string, string> = {};
  const snapshots: Record<string, unknown> = {};
  const start = Date.parse(FROZEN_NOW);
  try {
    for (const [i, step] of scenario.steps.entries()) {
      vi.setSystemTime(new Date(start + (i + 1) * 1000));
      const label = `${String(i + 1).padStart(2, '0')} ${step.method} ${step.path}`;
      // Compte (fuseau horaire) : le moteur local le reçoit directement ; étapes de mise en place seulement.
      if (step.path.startsWith('/api/auth/')) {
        expect(step.silent, `${label} : une étape de compte doit être silencieuse`).toBe(true);
        continue;
      }
      const path = fill(step.path, saved).replace(/^\/api/, '');
      const res = await engine.call(step.method, path, step.body === undefined ? undefined : fill(step.body, saved));
      expect(res, `${label} : appel non géré localement`).not.toBeNull();
      if (step.expect !== undefined) expect(res!.status, label).toBe(step.expect);
      else expect(res!.status, `${label} → ${JSON.stringify(res!.body)}`).toBeLessThan(400);
      for (const [name, where] of Object.entries(step.save ?? {})) saved[name] = readPath(res!.body, where) as string;
      if (!step.silent) snapshots[label] = { status: res!.status, body: res!.body };
    }
  } finally {
    db.close();
    await db.delete();
  }
  return JSON.parse(JSON.stringify(makeNormalizer(saved)(snapshots))) as Record<string, unknown>;
}

describe('parité : le moteur local donne les mêmes réponses que le serveur', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(FROZEN_NOW));
  });
  afterEach(() => vi.useRealTimers());

  for (const scenario of SCENARIOS.filter((s) => LOCAL.includes(s.name))) {
    it(`scénario « ${scenario.name} »`, async () => {
      const actual = await play(scenario);
      expect(Object.keys(actual)).toEqual(Object.keys(GOLDEN[scenario.name] as object));
      expect(actual).toEqual(GOLDEN[scenario.name]);
    });
  }
});
