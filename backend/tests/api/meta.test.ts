import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentEpoch, rotateEpoch } from '../../src/core/epoch.ts';
import { requireProtocol } from '../../src/core/protocol.ts';
import { checkProtocol, MIN_SYNC_PROTOCOL_VERSION, SYNC_PROTOCOL_VERSION } from '../../../shared/src/sync.ts';
import { app, resetDb } from '../helpers.ts';

// Spec 007, phase 0 : version du protocole et époque du serveur.
beforeEach(resetDb);

describe('compatibilité du protocole', () => {
  it('compare la version annoncée à celles que le serveur accepte', () => {
    expect(checkProtocol('1', 3, 2)).toBe('client-too-old');
    expect(checkProtocol('2', 3, 2)).toBe('ok');
    expect(checkProtocol('3', 3, 2)).toBe('ok');
    expect(checkProtocol('4', 3, 2)).toBe('client-too-new');
    for (const bad of [undefined, '', 'abc', '1.5', '-1', '12345', null]) expect(checkProtocol(bad)).toBe('invalid');
  });

  it('refuse avec 426 une version trop ancienne, trop récente ou absente, sans rien exécuter', async () => {
    let reached = 0;
    const mini = express();
    mini.get('/sync', requireProtocol, (_req, res) => {
      reached += 1;
      res.json({ success: true });
    });

    const ok = await request(mini).get('/sync').set('X-Objectiva-Protocol', String(SYNC_PROTOCOL_VERSION));
    expect(ok.status).toBe(200);

    const tooNew = await request(mini).get('/sync').set('X-Objectiva-Protocol', String(SYNC_PROTOCOL_VERSION + 1));
    expect(tooNew.status).toBe(426);
    expect(tooNew.body).toMatchObject({ code: 'UPGRADE_REQUIRED', details: { protocolVersion: SYNC_PROTOCOL_VERSION, minProtocolVersion: MIN_SYNC_PROTOCOL_VERSION } });

    const missing = await request(mini).get('/sync');
    expect(missing.status).toBe(426);
    expect(missing.body.message).toMatch(/manquante|invalide/);
    expect(reached).toBe(1);
  });
});

describe('GET /api/meta', () => {
  it('est public et ne renvoie que des informations techniques', async () => {
    const res = await request(app).get('/api/meta');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ protocolVersion: SYNC_PROTOCOL_VERSION, minProtocolVersion: MIN_SYNC_PROTOCOL_VERSION });
    expect(Object.keys(res.body.data).sort()).toEqual(['compatible', 'epoch', 'minProtocolVersion', 'protocolVersion', 'serverTime'].filter((k) => k !== 'compatible').sort());
    expect(res.body.data.epoch).toBe(await currentEpoch());
    expect(Math.abs(Date.parse(res.body.data.serverTime) - Date.now())).toBeLessThan(5_000);
  });

  it('indique la compatibilité quand le client annonce sa version', async () => {
    expect((await request(app).get('/api/meta').set('X-Objectiva-Protocol', '1')).body.data.compatible).toBe(true);
    expect((await request(app).get('/api/meta').set('X-Objectiva-Protocol', '99')).body.data.compatible).toBe(false);
  });
});

describe('époque du serveur', () => {
  it('change quand on la renouvelle (après une restauration) et reste unique', async () => {
    const before = await currentEpoch();
    const after = await rotateEpoch();
    expect(after).not.toBe(before);
    expect(await currentEpoch()).toBe(after);
    expect((await request(app).get('/api/meta')).body.data.epoch).toBe(after);
  });
});
