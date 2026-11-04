# API Objectiva — étapes 1 et 2

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

`progress` dépend du mode de progression de l'objectif (`progressMode`) :
- `JALONS` (défaut) : `{ mode, done, total, percent, label }` ; `percent` vaut `null` sans jalon
  (`label` : « Ajoute un premier jalon »).
- `MESURE` : `{ mode, current, start, target, unit, percent, reached, label }` ; `percent` borné à
  0-100 ; `label` : « 1 sur 3 démonstrations ». La valeur `current` est le dernier relevé (date puis
  création), à défaut `start`. Marche aussi pour une cible inférieure au départ.

### Progression mesurée (spec 003)

`POST /goals` et `PATCH /goals/:id` acceptent `progressMode` (`JALONS` | `MESURE`), `measureUnit`
(≤ 30), `startValue` et `targetValue` (entiers). En `MESURE` les trois derniers sont obligatoires et
la cible diffère du départ (`400` avec `details[].field`). `GET /goals/:id` ajoute `readings`
(50 derniers, du plus récent au plus ancien).

| Méthode | Chemin | Entrée | Réponse |
|---|---|---|---|
| POST | `/goals/:id/readings` | `value` (entier), `readOn?` (défaut aujourd'hui), `note?` (≤ 200) | `201` `{ reading, progress }` ; `409 CONFLICT` si l'objectif n'est pas en `MESURE` |
| DELETE | `/readings/:id` | — | `{ progress }` recalculée |

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

## Événements (spec 004)

Réunion, rencontre, rendez-vous, appel ou visio. Le serveur convertit « jour + heure » locaux en
instants UTC d'après le fuseau de l'utilisateur (changements d'heure compris) et renvoie les deux.

| Méthode | Chemin | Entrée | Réponse |
|---|---|---|---|
| GET | `/events` | `from?`, `to?` (jours locaux), `status?`, `limit?` (1-200, défaut 100) | liste par heure de début |
| POST | `/events` | `type`, `title`, `date`, `startTime`, `endTime` (`HH:mm`), `location?`, `link?` (http/https), `participants?` (≤ 20 noms), `agenda?`, `goalId?`, `milestoneId?`, `travelBeforeMinutes?`, `prepBeforeMinutes?` (0-480) | `201` événement |
| GET | `/events/:id` | — | événement + `tasks` liées |
| PATCH | `/events/:id` | champs partiels (heures revérifiées avec les valeurs existantes) | événement |
| DELETE | `/events/:id` | — | les tâches liées restent |
| POST | `/events/:id/complete` | `decisions?` | `REALISE` (idempotent) ; `409` si annulé |
| POST | `/events/:id/reopen` | — | `PREVU` (idempotent) |
| POST | `/events/:id/cancel` | — | `ANNULE` (idempotent) ; `409` si réalisé |
| POST | `/events/:id/tasks` | `role` (`PREPARATION` \| `SUIVI`), `title?`, `workDate?` (`null` = à planifier) | `201` tâche liée |

Valeurs : `type` ∈ `REUNION, RENCONTRE, RENDEZ_VOUS, APPEL, VISIO` ; `status` ∈ `PREVU, REALISE,
ANNULE`. Un événement renvoie `date`, `startTime`, `endTime`, `startsAt`, `endsAt`,
`blockedMinutes`, `blockedFrom`, `blockedFromTime` (début du temps réservé) et `leaveAtTime`
(heure de départ, `null` sans déplacement).

Tâche créée par `/events/:id/tasks` : titre par défaut « Préparer : … » ou « Suivi : … », jour par
défaut la veille (préparation) ou le lendemain (suivi), jamais dans le passé ; elle hérite de
l'objectif et du jalon de l'événement. Les tâches renvoient `eventId` et `eventRole`.

`GET /today` ajoute `events` (non annulés du jour, par heure). `GET /reviews` ajoute
`events: { planned, done, cancelled, expected }`.

## Budget mensuel (spec 005)

Préfixe `/api/budget`. **Tous les montants sont des entiers** dans la plus petite unité de la devise
de l'utilisateur (`user.currency`, `XOF` par défaut : 1 franc ; `EUR` : 1 centime). Un décimal est
refusé (`400`), jamais arrondi. Montant d'une opération : de 1 à 1 000 000 000.

| Méthode | Chemin | Entrée | Réponse |
|---|---|---|---|
| POST | `/budget/setup` | — | crée le compte « Espèces » et les catégories par défaut, **une seule fois** (idempotent) ; `{ accounts, categories }` |
| GET | `/budget/accounts` | `archived?` | comptes avec `balance` |
| POST | `/budget/accounts` | `name`, `kind` (`ESPECES`, `BANQUE`, `MOBILE_MONEY`), `openingBalance?` | `201` ; `409` si le nom existe |
| PATCH | `/budget/accounts/:id` | `name?`, `openingBalance?`, `archived?` | compte (un compte utilisé s'archive, il ne se supprime pas) |
| GET | `/budget/categories` | `type?`, `archived?` | catégories |
| POST | `/budget/categories` | `name`, `type` (`REVENU`, `DEPENSE`, `EPARGNE`) | `201` ; `409` si le nom existe pour ce type |
| PATCH | `/budget/categories/:id` | `name?`, `archived?` | catégorie |
| GET | `/budget/months/:AAAA-MM` | — | vue du mois : `summary`, `accounts`, `totalBalance`, `categories`, `envelopes`, `operations`, `transactions`, `needsSetup`, `currency` |
| PUT | `/budget/envelopes` | `month`, `categoryId`, `plannedAmount` (0 retire l'enveloppe) | enveloppe |
| POST | `/budget/operations` | `type`, `label`, `plannedAmount`, `dueDate`, `categoryId?`, `accountId?` | `201` prévision |
| PATCH | `/budget/operations/:id` | `label?`, `plannedAmount?`, `dueDate?`, `categoryId?`, `accountId?`, `cancelled?` | prévision recalculée |
| DELETE | `/budget/operations/:id` | — | les paiements déjà faits sont conservés |
| POST | `/budget/operations/:id/settle` | `amount`, `accountId`, `idempotencyKey` (8-80), `date?`, `close?` | `201` `{ operation, transaction, replayed: false }` ; `200` avec `replayed: true` si la clé est rejouée |
| POST | `/budget/transactions` | `type`, `amount`, `date`, `accountId`, `categoryId?`, `label?`, `idempotencyKey?` | `201` ; `200` si la clé est rejouée |
| DELETE | `/budget/transactions/:id` | — | `{ operation }` : la prévision liée est recalculée (rouverte si payé < prévu) |

**Statut d'une prévision** : `PREVUE` (rien payé), `PARTIELLE` (0 < payé < prévu), `SOLDEE` (payé ≥
prévu, ou soldée avec `close: true`), `ANNULEE`. Elle renvoie `paid`, `remaining`, `economy`
(prévu − payé quand elle est soldée avec moins) et `overrun` (payé au-delà du prévu).

**Règlement idempotent** : `idempotencyKey` est obligatoire pour `settle`. Une même clé rejouée
(double appui, réponse perdue) renvoie la première écriture sans en créer de seconde ; la base
l'impose (`UNIQUE (user_id, idempotency_key)`) et le règlement verrouille la prévision, donc des
requêtes simultanées restent cohérentes. Une clé déjà utilisée pour une autre prévision → `409`.

`summary` : `plannedIncome|Expense|Saving`, `realIncome|Expense|Saving`, `remainingToSpend` (négatif =
dépassement), `overspent`, `expensePercent` (`null` sans dépense prévue), `economy`, `plannedNet`,
`realNet`. Une enveloppe : `planned`, `spent`, `remaining`, `percent` (`null` sans montant prévu),
`overspent`. Solde d'un compte = ouverture + revenus − dépenses − épargne (transactions réelles).

## Fondations de la synchronisation (spec 007, phase 0)

Préparation du fonctionnement hors connexion. Aucune route de synchronisation n'existe encore (phase 1).

- **Identifiants fournis par l'appareil** : toute création (objectif, jalon, relevé, tâche, événement,
  compte, catégorie, prévision, transaction) accepte un `id` (UUID) facultatif. Sans `id`, le serveur
  en génère un. Un `id` déjà utilisé renvoie `409 CONFLICT` « Cette donnée existe déjà », **que
  l'identifiant appartienne à soi ou à un autre utilisateur** : la réponse ne révèle rien et rien n'est
  écrasé. L'`id` d'une donnée existante ne peut pas être modifié.
- **`GET /meta`** (public, sans authentification) : `{ protocolVersion, minProtocolVersion, epoch,
  serverTime, compatible? }`. `epoch` change quand la base est restaurée (`npm run db:new-epoch`) ;
  `serverTime` permet de repérer une horloge de téléphone fausse ; `compatible` n'est renseigné que si
  la requête annonce l'en-tête `X-Objectiva-Protocol`.
- **Protocole** : les futures routes `/sync/*` exigent l'en-tête `X-Objectiva-Protocol: <version>`.
  Version trop ancienne, trop récente ou absente → `426 UPGRADE_REQUIRED` avec `details:
  { protocolVersion, minProtocolVersion }`.
- **Dans la base** (invisible de l'API) : chaque ligne synchronisable reçoit un `server_version` (compteur
  par utilisateur) et un `updated_at` par déclencheur PostgreSQL, et chaque suppression, cascades
  comprises, laisse une pierre tombale (`tombstones`).

## Synchronisation (spec 007, phase 1)

Réservée aux applications : tâches, objectifs, jalons et relevés. Exige l'authentification **et**
l'en-tête `X-Objectiva-Protocol: <version>` (sinon `426 UPGRADE_REQUIRED`). Les envois peuvent peser
jusqu'à 1 Mo.

| Méthode | Chemin | Entrée | Réponse |
|---|---|---|---|
| POST | `/sync/push` | `{ deviceId, mutations[1..200] }` | `{ epoch, results[] }` : un résultat par modification, dans l'ordre |
| GET | `/sync/pull` | `cursor?` (défaut 0), `limit?` (1-500, défaut 200) | `{ epoch, cursor, hasMore, changes[] }` |

**Modification** : `{ mutationId (UUID), entity (goals | milestones | goal_readings | tasks), id, op
(create | update | delete), fields?, clocks?, createdAt? }`. `fields` : tous les champs à la création,
seulement ceux qui changent à la modification ; `clocks` : une horloge hybride par champ (format
`<ms sur 15 chiffres>.<compteur sur 5>.<appareil>`, voir `shared/src/hlc.ts`).

**Résultat** : `status` `applied`, `ignored` (`deleted`, `exists`, `stale`, `parent-missing`) ou
`rejected` (`invalid`, `not-found`, `conflict`, avec `message` affichable). Rejouer un `mutationId` renvoie
le même résultat sans rien réécrire.

**Règles** : par champ, l'horloge la plus récente l'emporte ; une suppression l'emporte sur toute
modification ; une tâche dont l'objectif, le jalon ou le rendez-vous a disparu est conservée sans ce lien ;
le jalon impose son objectif à la tâche ; un jalon ou un relevé dont l'objectif a disparu est ignoré ;
l'identifiant d'une donnée d'autrui n'est jamais accepté, ni révélé.

**Changement reçu** : `{ entity, op: upsert | delete, id, version, row?, clocks? }`, par `version`
croissante. `cursor` est à renvoyer tel quel ; `hasMore` indique qu'il reste des pages. Un curseur 0
renvoie tout (nouvel appareil). L'`epoch` change si le serveur a été restauré.
