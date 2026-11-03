# 004 — Événements : réunions, rencontres, rendez-vous

## 1. Objectif
Planifier des réunions, rencontres, rendez-vous, appels et visios avec lieu ou lien, participants,
ordre du jour, temps de déplacement et de préparation réservés, puis noter les décisions et créer
une action de suivi. Une tâche de préparation peut être liée à l'événement.

## 2. Parcours utilisateur
1. « Ajouter » → « Un événement » : type, titre, date, heure de début et de fin, lieu ou lien,
   participants (noms), ordre du jour ; options : déplacement et préparation avant.
2. L'événement apparaît dans « Aujourd'hui » (rendez-vous du jour, avec l'heure de départ à
   prévoir) et dans « Planifier » (parmi les jours).
3. Depuis la fiche : ajouter une tâche de préparation ; le jour J, marquer « Réalisé » en notant
   les décisions ; créer une action de suivi ; ou « Annuler ».
4. Le bilan compte les événements prévus, réalisés et annulés de la période.

## 3. Critères d'acceptation
- [x] CA-1 : types `REUNION, RENCONTRE, RENDEZ_VOUS, APPEL, VISIO` ; statuts `PREVU, REALISE,
      ANNULE`. Titre obligatoire (≤ 160), date, heure de début, heure de fin postérieure.
- [x] CA-2 : les instants sont stockés en UTC (`timestamptz`) d'après le fuseau de
      l'utilisateur ; l'API renvoie aussi `date`, `startTime`, `endTime` locaux. Correct aussi lors
      d'un changement d'heure (test avec `Europe/Paris`).
- [x] CA-3 : un lien n'accepte que `http://` ou `https://` ; participants : 20 maximum, 80
      caractères chacun, noms seulement (aucune invitation envoyée).
- [x] CA-4 : `travelBeforeMinutes` et `prepBeforeMinutes` (0-480) sont réservés : l'API renvoie
      `blockedFrom` (début − déplacement − préparation) et `blockedMinutes`.
- [x] CA-5 : `POST /events/:id/complete` (décisions facultatives), `/reopen`, `/cancel` sont
      idempotents (même état → même réponse, sans erreur ni doublon).
- [x] CA-6 : `POST /events/:id/tasks` crée une tâche liée (`eventId`, `eventRole` `PREPARATION` ou
      `SUIVI`) qui hérite de l'objectif et du jalon de l'événement ; titre et date par défaut
      proposés (veille de l'événement pour la préparation, lendemain pour le suivi, jamais dans le
      passé : un événement d'aujourd'hui reçoit une préparation d'aujourd'hui).
- [x] CA-7 : `GET /today` renvoie `events` (non annulés, par heure) ; `GET /events?from&to`
      alimente « Planifier » ; `GET /reviews` renvoie `events` (prévus, réalisés, annulés).
- [x] CA-8 : supprimer un événement conserve ses tâches (lien mis à `NULL`).
- [x] CA-9 : l'objectif et le jalon associés doivent appartenir à l'utilisateur (404 sinon) et être
      cohérents entre eux.
- [x] CA-10 : isolation complète sur toutes les routes d'événements, y compris la création d'une
      tâche liée à l'événement d'autrui (404).
- [x] CA-11 : interface : formulaire, fiche, rendez-vous dans « Aujourd'hui » et « Planifier »,
      état de chaque événement avec libellé + icône.

## 4. Hors périmètre
- Conflits entre rendez-vous, plages disponibles, vue agenda (étape 3) ; récurrence (étape 4) ;
  invitations réelles ; synchronisation Google/Outlook ; événements sur plusieurs jours.

## 5. Plan technique
- **Modèle** : `Event` (`user_id` Cascade, `goal_id`/`milestone_id` SetNull, `type`, `title`,
  `starts_at`, `ends_at` timestamptz, `location`, `link`, `participants` text[], `agenda`,
  `decisions`, `status`, `travel_before_minutes`, `prep_before_minutes`, timestamps) ; index
  `(user_id, starts_at)` et `(user_id, status)`. `Task.event_id` (SetNull) et `Task.event_role`.
- **Règles pures** (`events.rules.ts`) : conversion jour + heure locale ↔ instant UTC,
  `blockedWindow`, bornes UTC d'un jour local, résumé du bilan.
- **Endpoints** : `GET/POST /events`, `GET/PATCH/DELETE /events/:id`, `POST /events/:id/complete|
  reopen|cancel`, `POST /events/:id/tasks` (seule voie de création de tâche liée ; `tasks` renvoie
  `eventId` et `eventRole`) ; `today` et `reviews` étendus.
- **Écrans** : `events/event-detail.page.ts` (`/app/evenements/:id`), `shared/event-form`,
  `shared/event-item`, « Aujourd'hui », « Planifier », bilan, feuille « Ajouter ».

## 6. Tâches
- [x] T1 Migration + règles de fuseau + tests unitaires
- [x] T2 Module `events` (schémas, service, routes) + tests API et isolation
- [x] T3 Tâches liées, `today`, `reviews`
- [x] T4 Frontend : modèles, formulaire, élément de liste, fiche
- [x] T5 Frontend : intégration Aujourd'hui, Planifier, Bilan, feuille « Ajouter »
- [x] T6 Documentation API, seed

## 7. Revue
- Vérifications exécutées (commande + résultat) :
  - `npx vitest run` (backend) : 79/79 ; 9 tests de fuseaux (`events.rules.test.ts`, dont les
    changements d'heure de Paris et un fuseau à l'ouest de UTC), 11 tests API (`events.test.ts`,
    CA-1 à CA-9) et le cas d'isolation CA-10.
  - `ng lint`, Prettier, `ng build` : propres.
  - Parcours navigateur 360×740 (clair et sombre) : création depuis la feuille « Ajouter »,
    carte dans « Aujourd'hui » et « Planifier », fiche, tâche de préparation, « Réalisé » avec
    décisions, bilan ; aucune erreur console (CA-11).
- Écarts restants :
  - Heure inexistante (saut de printemps) : décalée à l'heure valide suivante, sans avertissement.
  - Pas de détection de conflits entre rendez-vous (étape 3, comme prévu).
  - Le lien de visio s'ouvre dans le navigateur (`target=_blank`) ; l'ouverture native Capacitor
    sera vérifiée avec `cap add android`.
