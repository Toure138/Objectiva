# API Objectiva — étape 1

Base : `http://localhost:3100/api`. Corps et réponses en JSON.

## Conventions

- **Authentification** : en-tête `Authorization: Bearer <jeton>` sur toutes les routes sauf
  `/auth/register` et `/auth/login`.
- **Succès** : `{ "success": true, "data": ... }`.
- **Erreur** : `{ "success": false, "code": "...", "message": "...", "details"?: [{ "field", "message" }] }`.
  Le `message` est en français et peut être affiché tel quel.
- **Dates de calendrier** : `AAAA-MM-JJ`. **Instants** : ISO 8601 en UTC.
- Une ressource d'un autre utilisateur répond **404**, comme une ressource inexistante.

| Code | Statut | Signification |
|---|---|---|
| `VALIDATION_ERROR` | 400 | entrée invalide (voir `details`) |
| `UNAUTHENTICATED` | 401 | jeton absent, expiré ou session révoquée |
| `INVALID_CREDENTIALS` | 401 | e-mail ou mot de passe incorrect |
| `NOT_FOUND` | 404 | ressource introuvable |
| `EMAIL_TAKEN` | 409 | compte déjà existant |
| `CONFLICT` | 409 | action impossible dans l'état actuel (ex. reporter une tâche terminée) |
| `TOO_MANY_ATTEMPTS` | 429 | 5 échecs de connexion en 15 min pour cet e-mail, ou 30 requêtes en 15 min par IP |
| `INTERNAL_ERROR` | 500 | erreur inattendue |

## Authentification

| Méthode | Chemin | Corps | Réponse |
|---|---|---|---|
| POST | `/auth/register` | `email`, `password` (8 à 128), `displayName`, `timezone?` (IANA) | `201` `{ user, token, expiresAt }` |
| POST | `/auth/login` | `email`, `password` | `{ user, token, expiresAt }` |
| POST | `/auth/logout` | — | révoque la session courante |
| GET | `/auth/me` | — | `user` |
| PATCH | `/auth/me` | `displayName?`, `timezone?` | `user` |

## Objectifs et jalons

| Méthode | Chemin | Entrée | Réponse |
|---|---|---|---|
| GET | `/goals` | filtres `status?`, `category?` | liste avec `progress`, `nextAction`, `needsNextAction` |
| POST | `/goals` | `title`, `category`, `startDate`, `endDate`, `horizon?`, `priority?`, `status?`, `description?`, `motivation?` | objectif |
| GET | `/goals/:id` | — | objectif + `milestones` + `tasks` |
| PATCH | `/goals/:id` | champs partiels | objectif |
| DELETE | `/goals/:id` | — | supprime les jalons ; les tâches restent (sans objectif) |
| POST | `/goals/:id/milestones` | `title`, `dueDate?` | jalon |
| PATCH | `/milestones/:id` | `title?`, `dueDate?`, `completed?` | jalon |
| DELETE | `/milestones/:id` | — | les tâches liées restent (sans jalon) |

Valeurs : `category` ∈ `ETUDES, CARRIERE, SANTE, FINANCES, SPIRITUALITE, FAMILLE, PROJET_PERSONNEL` ;
`status` ∈ `A_DEMARRER, EN_COURS, EN_PAUSE, TERMINE, ABANDONNE` ; `priority` ∈ `HAUTE, MOYENNE, BASSE` ;
`horizon` ∈ `MOIS, TRIMESTRE, ANNEE, PERSONNALISEE`.

`progress` = `{ mode: "JALONS", done, total, percent, label }` ; `percent` vaut `null` sans jalon
(`label` : « Ajoute un premier jalon »).

## Tâches

| Méthode | Chemin | Entrée | Réponse |
|---|---|---|---|
| GET | `/tasks` | `status?`, `goalId?`, `from?`, `to?`, `unscheduled?`, `limit?` (1-100, défaut 50), `offset?` | `{ items, total, limit, offset }` |
| POST | `/tasks` | `title`, `workDate?`, `dueDate?`, `notes?`, `goalId?`, `milestoneId?` | tâche |
| GET | `/tasks/:id` | — | tâche |
| PATCH | `/tasks/:id` | champs partiels ; changer `workDate` compte comme un report | tâche |
| DELETE | `/tasks/:id` | — | — |
| POST | `/tasks/:id/complete` | — | statut `DONE`, `completedAt` ; idempotent |
| POST | `/tasks/:id/reopen` | — | retour à `TODO` (annule une validation ou une annulation) |
| POST | `/tasks/:id/reschedule` | `workDate` (date ou `null` = « À planifier ») | tâche ; même date = aucun effet |
| POST | `/tasks/:id/cancel` | — | statut `CANCELLED` |

Un `milestoneId` seul suffit : l'objectif est déduit du jalon. Un jalon d'un autre objectif → 400.

Champs calculés d'une tâche : `needsRescheduling` (date de travail passée), `overdue` (échéance
dépassée), `unscheduled` (sans date), `suggestSplit` (3 reports ou plus), avec `originalDate`
(première date prévue) et `rescheduleCount`.

## Vues de synthèse

| Méthode | Chemin | Entrée | Réponse |
|---|---|---|---|
| GET | `/today` | `date?` (défaut : aujourd'hui dans le fuseau de l'utilisateur) | `planned`, `done`, `toReschedule`, `overdue`, `goalsWithoutNextAction`, `emptyMessage` |
| GET | `/reviews` | `period=day\|week\|month` + `date?`, **ou** `from` + `to` (366 jours max) | `tasks` (compteurs + `executionRate`), `goals`, `questions` |

`executionRate` = `{ numerator, denominator, percent }`, ou `null` quand aucune tâche n'était
attendue. Les tâches annulées sont comptées dans `cancelled`, hors dénominateur. La semaine va du
lundi au dimanche.
