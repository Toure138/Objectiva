import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/core/prisma.ts';
import { app, registerUser, resetDb } from '../helpers.ts';

beforeEach(resetDb);

describe('authentification', () => {
  it('inscrit un utilisateur et stocke un mot de passe haché (CA-1)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'Moussa@Exemple.fr', password: 'motdepasse123', displayName: 'Moussa' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('moussa@exemple.fr');
    expect(res.body.data.token).toBeTypeOf('string');
    expect(JSON.stringify(res.body)).not.toContain('motdepasse123');

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'moussa@exemple.fr' } });
    expect(stored.passwordHash).not.toBe('motdepasse123');
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
  });

  it('refuse un e-mail déjà utilisé et un mot de passe trop court', async () => {
    const body = { email: 'awa@exemple.fr', password: 'motdepasse123', displayName: 'Awa' };
    await request(app).post('/api/auth/register').send(body).expect(201);
    const dup = await request(app).post('/api/auth/register').send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');

    const short = await request(app).post('/api/auth/register').send({ ...body, email: 'b@exemple.fr', password: 'court' });
    expect(short.status).toBe(400);
    expect(short.body.code).toBe('VALIDATION_ERROR');
    expect(short.body.details[0].field).toBe('password');
  });

  it('serveur neuf : le téléphone recrée le compte avec son identifiant ; un identifiant pris est refusé sans fuite', async () => {
    const id = '7f1c2a90-4b7e-4c3d-9a2b-1e5f6a7b8c9d';
    const res = await request(app)
      .post('/api/auth/register')
      .send({ id, email: 'fatou@exemple.fr', password: 'motdepasse123', displayName: 'Fatou' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.id).toBe(id);

    // Quelqu'un d'autre tente de prendre cet identifiant : refus uniforme, le compte de Fatou est intact.
    const taken = await request(app)
      .post('/api/auth/register')
      .send({ id, email: 'autre@exemple.fr', password: 'motdepasse123', displayName: 'Autre' });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('CONFLICT');
    expect(JSON.stringify(taken.body)).not.toContain('fatou');
    expect(await prisma.user.count({ where: { email: 'autre@exemple.fr' } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).email).toBe('fatou@exemple.fr');

    const bad = await request(app)
      .post('/api/auth/register')
      .send({ id: 'pas-un-uuid', email: 'c@exemple.fr', password: 'motdepasse123', displayName: 'C' });
    expect(bad.status).toBe(400);
    expect(bad.body.details[0].field).toBe('id');
  });

  it('protège les routes sans jeton (CA-2)', async () => {
    const res = await request(app).get('/api/goals');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('bloque après 5 échecs de connexion (CA-3)', async () => {
    const u = await registerUser('Fatou');
    for (let i = 0; i < 5; i += 1) {
      const r = await request(app).post('/api/auth/login').send({ email: u.user.email, password: 'mauvais' });
      expect(r.status).toBe(401);
    }
    const blocked = await request(app).post('/api/auth/login').send({ email: u.user.email, password: 'motdepasse123' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('la déconnexion révoque la session côté serveur', async () => {
    const u = await registerUser('Koffi');
    await u.get('/api/auth/me').expect(200);
    await u.post('/api/auth/logout').expect(200);
    const after = await u.get('/api/auth/me');
    expect(after.status).toBe(401);
  });

  it('reconnexion : une nouvelle session retrouve les données', async () => {
    const u = await registerUser('Ines');
    await u.post('/api/goals', { title: 'Lire 12 livres', category: 'ETUDES', startDate: '2026-01-01', endDate: '2026-12-31' }).expect(201);
    const login = await request(app).post('/api/auth/login').send({ email: u.user.email, password: 'motdepasse123' });
    expect(login.status).toBe(200);
    const goals = await request(app).get('/api/goals').set('Authorization', `Bearer ${login.body.data.token}`);
    expect(goals.body.data).toHaveLength(1);
  });
});
