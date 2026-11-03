# Versions utilisées

Vérifiées sur le registre npm et installées le 2026-11-03. À revérifier avant toute montée de
version majeure.

| Composant | Version installée | Remarque |
|---|---|---|
| Node.js | 26.13 (poste de dev) | minimum 22 ; `.nvmrc` = 26 |
| PostgreSQL | 16 (image `postgres:16-alpine`) | |
| Prisma CLI + client | 7.10.1 | `prisma.config.ts`, adaptateur `@prisma/adapter-pg` ; la série 8 n'est encore qu'en RC |
| Express | 5.3.0 | erreurs des handlers async transmises automatiquement |
| TypeScript (backend) | 5.9.3 | la série 7 (compilateur Go) n'est pas retenue pour l'instant |
| zod | 4.6.7 | |
| bcryptjs / jsonwebtoken | 3.x / 9.x | |
| Vitest (backend) / Supertest | 3.2.7 / 7.x | |
| Angular | 22.2 | généré par Ionic CLI 7, standalone, sans zone.js |
| TypeScript (frontend) | 6.0 | imposé par Angular 22 |
| Ionic Angular | 9.0 | |
| Capacitor | 8.6 (`@capacitor/preferences` 8.0.1) | |
| Vitest (frontend) / Playwright | 5.0 / 1.64 | via `ng test` / `playwright test` |

Audit npm au 2026-11-03 : aucune vulnérabilité dans les dépendances de production du backend ;
des alertes existent dans les outils de développement (backend et frontend), sans impact sur ce
qui est exécuté en production. À revoir avec `npm audit` lors des prochaines mises à jour.
