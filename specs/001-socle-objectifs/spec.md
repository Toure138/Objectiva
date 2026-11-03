# 001 — Socle objectifs

## 1. Objectif
Permettre à une personne de créer un compte, définir un objectif avec un jalon mensuel, planifier
une tâche du jour, la cocher, la reporter et voir un premier bilan, avec persistance réelle.

## 2. Parcours utilisateur
1. Inscription puis connexion (email + mot de passe).
2. Création d'un objectif (titre, catégorie, dates, priorité, statut « à démarrer »).
3. Ajout d'un jalon daté dans le mois en cours.
4. Création d'une tâche liée à l'objectif et au jalon, avec une date de travail.
5. Vue « Aujourd'hui » : tâches du jour, tâches en retard ou à replanifier.
6. Cocher la tâche ; la reporter ; l'annuler.
7. Bilan du jour et de la semaine : tâches attendues, réalisées, reportées, annulées.
8. Fermer et rouvrir l'application : les données sont toujours là.

## 3. Critères d'acceptation
- [x] CA-1 : Inscription avec email unique et mot de passe d'au moins 8 caractères ; le mot de passe
      est stocké haché, jamais en clair.
- [x] CA-2 : Connexion renvoie un jeton ; une route protégée sans jeton renvoie 401.
- [x] CA-3 : Après 5 échecs de connexion en 15 minutes pour un même email, la connexion est refusée
      avec le code `TOO_MANY_ATTEMPTS`.
- [x] CA-4 : Un objectif a un titre obligatoire, une catégorie parmi la liste prédéfinie, une date
      de fin postérieure ou égale à la date de début.
- [x] CA-5 : Un jalon appartient à un objectif ; une tâche liée à un jalon doit appartenir au même
      objectif et au même utilisateur, sinon 404.
- [x] CA-6 : Une tâche a un titre obligatoire, une date de travail optionnelle (`YYYY-MM-DD`), un
      statut parmi `TODO`, `DONE`, `CANCELLED`.
- [x] CA-7 : Cocher une tâche enregistre `completedAt` ; la décocher restaure `TODO`.
- [x] CA-8 : Reporter une tâche change sa date de travail, incrémente `rescheduleCount` et conserve
      `originalDate` (première date prévue).
- [x] CA-9 : Une tâche `TODO` dont la date de travail est passée apparaît comme « à replanifier » ;
      une échéance dépassée et ouverte apparaît comme « en retard ».
- [x] CA-10 : Le bilan d'une période exclut les tâches annulées du dénominateur et affiche le
      dénominateur de chaque taux ; une période sans tâche attendue renvoie un taux `null`.
- [x] CA-11 : Un utilisateur ne voit, modifie ni ne rattache jamais les données d'un autre
      utilisateur (test dédié).
- [x] CA-12 : Progression d'un objectif par jalons = jalons terminés / total ; sans jalon, renvoie
      `null` (« Ajoute un premier jalon »).

## 4. Hors périmètre
- Habitudes, événements, budget, rappels, mode hors ligne (étapes 2-4). Le bilan mensuel est livré (période `month`).
- Mesure chiffrée d'objectif (valeur initiale, cible) : prévue ultérieurement.

## 5. Plan technique

### Modèle de données (Prisma, PostgreSQL)
- `User` (id, email unique, passwordHash, displayName, timezone, createdAt)
- `LoginAttempt` (id, email, createdAt) pour la limitation
- `Goal` (id, userId, title, description, category enum, horizon, startDate, endDate, priority,
  status enum, createdAt, updatedAt) — index `(userId, status)`
- `Milestone` (id, goalId, title, dueDate, completedAt) — index `(goalId)`
- `Task` (id, userId, goalId?, milestoneId?, title, notes, workDate?, dueDate?, status enum,
  completedAt?, originalDate?, rescheduleCount, createdAt, updatedAt)
  — index `(userId, workDate)`, `(userId, status)`
- Suppression : objectif supprimé → jalons supprimés en cascade, tâches liées `goalId` mises à
  `NULL` (la tâche reste). Jalon supprimé → `milestoneId` mis à `NULL`.

### Endpoints (préfixe `/api`)
| Méthode | Chemin | Entrée | Sortie | Erreurs |
|---|---|---|---|---|
| POST | `/auth/register` | email, password, displayName | user, token | 400, 409 |
| POST | `/auth/login` | email, password | token | 401, 429 |
| GET | `/goals` | — | liste + progression | 401 |
| POST | `/goals` | objectif | objectif | 400, 401 |
| GET | `/goals/:id` | — | objectif, jalons, tâches liées | 404 |
| PATCH | `/goals/:id` | champs partiels | objectif | 400, 404 |
| POST | `/goals/:id/milestones` | titre, dueDate | jalon | 400, 404 |
| PATCH | `/milestones/:id` | titre, dueDate, completed | jalon | 400, 404 |
| POST | `/tasks` | tâche | tâche | 400, 404 |
| PATCH | `/tasks/:id` | champs partiels | tâche | 400, 404 |
| POST | `/tasks/:id/complete` | — | tâche | 404 |
| POST | `/tasks/:id/reopen` | — | tâche | 404 |
| POST | `/tasks/:id/reschedule` | workDate | tâche | 400, 404 |
| POST | `/tasks/:id/cancel` | — | tâche | 404 |
| GET | `/today?date=YYYY-MM-DD` | — | tâches du jour, à replanifier, en retard | 400 |
| GET | `/reviews?from=&to=` | — | totaux, taux, dénominateurs | 400 |

### Écrans Angular
- Connexion / inscription.
- « Aujourd'hui » (liste, cocher, reporter, annuler).
- « Objectifs » (liste, fiche avec jalons et tâches liées, création).
- « Bilan » (jour / semaine).

### Tests
- Unitaires : progression par jalons, classification (à replanifier, en retard), taux du bilan.
- API (Supertest) : un test de succès, un de validation, un d'isolation par endpoint majeur.

## 6. Tâches
- [x] T1 Docker Compose PostgreSQL et fichiers d'environnement
- [x] T2 Backend : configuration, Prisma, gestionnaire d'erreurs
- [x] T3 Authentification (CA-1 à CA-3)
- [x] T4 Objectifs et jalons (CA-4, CA-5, CA-12)
- [x] T5 Tâches et actions (CA-6 à CA-9)
- [x] T6 Bilan (CA-10)
- [x] T7 Tests d'isolation (CA-11)
- [x] T8 Frontend Ionic : connexion, Aujourd'hui, Objectifs, Bilan
- [x] T9 Seed de démonstration et README final

## 7. Revue
Revue du 2026-11-03.

### Vérifications exécutées
| Commande | Résultat |
|---|---|
| `cd backend && npx vitest run` | 44 tests OK : 19 règles pures, 6 auth (CA-1 à CA-3, déconnexion, reconnexion), 14 objectifs/tâches/Aujourd'hui/bilan (CA-4 à CA-10, CA-12), 5 isolation (CA-11) |
| `cd backend && npx tsc --noEmit` puis `npm run build` | OK |
| `npm run seed` + test de fumée sur l'API compilée | connexion, `/today`, `/goals`, `/reviews?period=week` cohérents avec les données de démo |
| `cd frontend && ng lint`, `ng test --no-watch`, `ng build` | lint OK, 8 tests OK, build OK |
| Parcours réel Chromium 360×740 (Playwright, hors dépôt) | inscription → bienvenue → objectif → jalon → tâche planifiée depuis le jalon → cochée dans Aujourd'hui avec « Annuler » → rechargement (session et données conservées) → bilan 100 % « 1 sur 1 » → profil en thème sombre ; aucune erreur console |

### Bugs trouvés par le parcours réel et corrigés
- Garde de navigation : `inject(Router)` après un `await` (NG0203), l'application ne s'ouvrait pas.
- Modales : propriété `modal` réservée par Ionic ; `componentProps` écrasait les entrées signal
  (préremplissage objectif/jalon cassé) → `@Input()` classiques.
- Onglet « Créer un compte » tronqué sur petit écran → « Inscription ».
- Message « Annuler » masqué par le bouton « + » → affiché en haut.

### Écarts restants (reportés, voir `docs/feuille-de-route.md`)
- 3 priorités principales par jour, checklist, durée estimée, rappel et note sur une tâche.
- Progression mesurable des objectifs (valeur initiale, cible, relevés).
- Réponses aux questions du bilan non enregistrées.
- Build Android natif non exécuté ici (Android Studio requis) ; seule la version web a été testée.
