import request from 'supertest';
import { createApp } from '../src/app.ts';
import { prisma } from '../src/core/prisma.ts';

export const app = createApp();

export async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE users, login_attempts RESTART IDENTITY CASCADE');
}

let counter = 0;

export async function registerUser(name = 'Awa') {
  counter += 1;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: `${name.toLowerCase()}${counter}@exemple.fr`, password: 'motdepasse123', displayName: name, timezone: 'Africa/Abidjan' });
  if (res.status !== 201) throw new Error(`Inscription impossible : ${JSON.stringify(res.body)}`);
  const token: string = res.body.data.token;
  return {
    token,
    user: res.body.data.user as { id: string; email: string },
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body?: object) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body ?? {}),
    put: (url: string, body: object) => request(app).put(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url: string, body: object) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
    del: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}

export type TestUser = Awaited<ReturnType<typeof registerUser>>;

export const goalPayload = {
  title: 'Présenter EcoleSaaS à trois établissements',
  category: 'CARRIERE',
  startDate: '2026-11-01',
  endDate: '2027-06-30',
};
