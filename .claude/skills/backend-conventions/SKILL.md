---
name: backend-conventions
description: Conventions du backend Objectiva (Express 5 + TypeScript + Prisma 7 + zod). Utiliser pour créer ou modifier une route, un service, une règle de calcul, un schéma de validation ou une migration côté API.
---

# Conventions backend Objectiva

## Code partagé et synchronisation (spec 007)
- Règles et schémas vivent dans `shared/src/` ; `<domaine>.rules.ts` et `<domaine>.schemas.ts` du backend
  sont de simples **façades** (`export *`). Une nouvelle règle de calcul ou un nouveau schéma de saisie se
  crée dans `shared/src/`, avec sa façade, pour pouvoir tourner aussi sur le téléphone.
- Dans `shared/` : imports relatifs **sans extension**, aucune dépendance Node, Express ou Prisma.
- Toute création accepte un `id` facultatif (`clientId` de `shared/src/ids.ts`) transmis tel quel à
  Prisma ; une collision est un 409 uniforme (gestionnaire central).
- Table synchronisable : `user_id`, `server_version`, `updated_at` + déclencheurs (voir la migration
  `…_synchronisation`) ; jamais d'écriture manuelle de ces colonnes. Dates posées par l'application avec
  `new Date()` quand une règle s'en sert (ex. `tasks.created_at`), pour rester déterministes.
- Nouveau comportement visible par l'API : ajouter ou étendre un scénario de `shared/parity/` et relire
  le diff des références.

## Structure d'un module (`backend/src/modules/<domaine>/`)
- `<domaine>.schemas.ts` : schémas zod (messages d'erreur en français).
- `<domaine>.rules.ts` : calculs purs (aucun accès base), testés dans `tests/unit/`.
- `<domaine>.service.ts` : accès Prisma + règles métier ; reçoit toujours `userId`.
- `<domaine>.routes.ts` : `parseInput(schema, req.body|req.query)`, `idParam(req.params.id)`,
  `currentUser(req)`, appel du service, réponse `{ success: true, data }`. Aucune logique.
- Monter le routeur dans `src/app.ts` derrière `requireAuth`.

Modèle à copier : `src/modules/tasks/`.

## Règles
1. `userId` vient toujours de `currentUser(req)`, jamais du corps de la requête.
2. Lecture/écriture d'une ressource : `findFirst({ where: { id, userId } })`, sinon `notFound()`.
3. Identifiant associé (objectif, jalon, événement, enveloppe…) : vérifier qu'il appartient à
   `userId` **avant** d'écrire, et la cohérence entre eux (voir `resolveLinks`).
4. Erreurs métier : `throw new AppError(status, code, message, details?)`. Express 5 transmet
   les erreurs des handlers `async` au gestionnaire central.
5. Montants : `Int`/`BigInt` en plus petite unité. Dates de calendrier : `@db.Date` + `dateOnly`
   (zod) + `toDbDate`/`fromDbDate`. « Aujourd'hui » : `todayIn(timezone)`.
6. Écritures multiples liées (transfert, règlement + transaction) : `prisma.$transaction`.
7. Actions sensibles au double appui : idempotentes (état déjà atteint → renvoyer l'état) ou clé
   d'idempotence + contrainte `@@unique`.
8. Journaux : jamais de corps de requête, mot de passe, jeton ou montant.

## Modèles déjà en place à réutiliser
- **Instants et fuseaux** (`events/events.rules.ts`) : `localToUtc`, `utcToLocal`, `localDaysToUtc`.
  Toute plage « jour local » en base se convertit par ces fonctions (changements d'heure inclus).
- **Argent** (`budget/`) : montants `Int` (minimum 1, maximum 1 000 000 000 pour une opération), refus
  des décimaux par zod, calculs dans `budget.rules.ts`. Une écriture sensible au double appui prend une
  `idempotencyKey` (`UNIQUE (user_id, idempotency_key)`) : clé déjà vue → renvoyer la première écriture
  (`200`, `replayed: true`), sinon `201`. Écritures liées dans `prisma.$transaction`, avec
  `SELECT … FOR UPDATE` sur la ligne parente quand plusieurs requêtes peuvent la modifier en même temps
  (`lockOperation`). Ressource utilisée → archivage (`archivedAt`), pas de suppression.
- **Progression** (`goals.rules.ts`) : `goalProgress` est l'unique point de calcul (jalons ou mesure) ;
  toute vue qui expose une progression l'appelle.

## Migrations (Prisma 7)
- `cd backend && npx prisma migrate dev --name <nom>` puis **`npx prisma generate`**.
- Ne jamais modifier une migration déjà appliquée : en ajouter une nouvelle.
- Choisir explicitement `onDelete` (Cascade / SetNull / Restrict) et ajouter les `@@index`
  correspondant aux filtres réels ; justifier dans la spec.
- Mettre à jour `prisma/seed.ts` si le nouveau domaine a besoin de données de démo.

## Tests (`backend/tests/`)
- Base réelle `objectiva_test` (migrations appliquées par `tests/global-setup.ts`, remise à zéro
  par `resetDb()` dans `tests/helpers.ts` — ajouter les nouvelles tables au `TRUNCATE` si elles ne
  dépendent pas de `users`).
- Pour chaque route : succès, validation (400 avec `details[].field`), isolation (ajouter les cas
  dans `tests/api/isolation.test.ts`).
- `npx vitest run` (la base Docker doit tourner).
