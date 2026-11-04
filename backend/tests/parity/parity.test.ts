import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fill, makeNormalizer, readPath } from '../../../shared/parity/normalize.ts';
import { FROZEN_NOW, SCENARIOS, type Scenario } from '../../../shared/parity/scenarios.ts';
import { app, registerUser, resetDb } from '../helpers.ts';

// Spec 007, phase 0 : tests de parité. Chaque scénario de shared/parity est joué contre l'API ; les
// réponses (normalisées) doivent être identiques au fichier de référence versionné. Le moteur local
// du téléphone devra produire exactement les mêmes réponses pour les mêmes scénarios.
//
// Régénérer après un changement VOLONTAIRE de comportement :
//   UPDATE_GOLDEN=1 npx vitest run tests/parity   (puis relire le diff Git)

const GOLDEN = new URL('../../../shared/parity/golden/', import.meta.url);
const update = process.env['UPDATE_GOLDEN'] === '1';

async function play(scenario: Scenario): Promise<Record<string, unknown>> {
  const user = await registerUser('Parite');
  const saved: Record<string, string> = {};
  const snapshots: Record<string, unknown> = {};
  const start = Date.parse(FROZEN_NOW);

  for (const [i, step] of scenario.steps.entries()) {
    // Une seconde de plus à chaque étape : les dates posées par l'application restent distinctes et déterministes.
    vi.setSystemTime(new Date(start + (i + 1) * 1000));
    const label = `${String(i + 1).padStart(2, '0')} ${step.method} ${step.path}`;
    const path = fill(step.path, saved);
    let req = request(app)[step.method.toLowerCase() as 'get'](path).set('Authorization', `Bearer ${user.token}`);
    if (step.body !== undefined) req = req.send(fill(step.body, saved) as object);
    const res = await req;

    if (step.expect !== undefined) expect(res.status, label).toBe(step.expect);
    else expect(res.status, `${label} → ${JSON.stringify(res.body)}`).toBeLessThan(400);

    for (const [name, where] of Object.entries(step.save ?? {})) {
      const value = readPath(res.body, where);
      expect(typeof value, `${label} : « ${where} » introuvable`).toBe('string');
      saved[name] = value as string;
    }
    if (!step.silent) snapshots[label] = { status: res.status, body: res.body };
  }
  // Les identifiants mémorisés servent à nommer les identifiants tirés au hasard par le serveur.
  const normalize = makeNormalizer(saved);
  return JSON.parse(JSON.stringify(normalize(snapshots))) as Record<string, unknown>;
}

beforeEach(async () => {
  await resetDb();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(FROZEN_NOW));
});
afterEach(() => vi.useRealTimers());

describe('parité : l’API est la référence du calcul', () => {
  for (const scenario of SCENARIOS) {
    it(`scénario « ${scenario.name} »`, async () => {
      const actual = await play(scenario);
      const file = new URL(`${scenario.name}.json`, GOLDEN);
      if (update) {
        writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
        return;
      }
      expect(existsSync(file), `Référence absente : lance UPDATE_GOLDEN=1 npx vitest run tests/parity`).toBe(true);
      expect(actual).toEqual(JSON.parse(readFileSync(file, 'utf8')));
    });
  }

  for (const scenario of SCENARIOS) {
    it(`est déterministe : « ${scenario.name} » rejoué donne exactement les mêmes réponses`, async () => {
      const first = await play(scenario);
      await resetDb();
      vi.setSystemTime(new Date(FROZEN_NOW));
      const second = await play(scenario);
      expect(second).toEqual(first);
    });
  }
});
