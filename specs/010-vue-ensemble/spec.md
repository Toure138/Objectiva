# 010 — Vue d'ensemble des planifications

> **Statut : terminée (2026-11-05).**

## 1. Objectif
Voir tout ce qui est planifié, au-delà de la semaine : un calendrier du mois qui montre les jours chargés et
les chevauchements, une liste « à venir » qui continue semaine après semaine, filtrable, et la liste des
réunions récurrentes. Sans réseau, comme le reste.

## 2. Parcours utilisateur
1. « Planifier » → **À venir** : jours groupés (rendez-vous puis tâches), « Afficher la semaine suivante »
   autant de fois que voulu ; filtres **Tout / Rendez-vous / Tâches** et **objectif**.
2. « Planifier » → **Mois** : calendrier du mois (lundi en premier), chaque jour indique le nombre de
   rendez-vous et de tâches et une alerte s'il y a un chevauchement ; mois précédent / suivant ; toucher un
   jour affiche ses rendez-vous et tâches sous le calendrier, avec le lien vers son agenda heure par heure.
3. « Planifier » → lien **Réunions récurrentes** : chaque série (titre, jours, heures, fin, prochaine
   occurrence ou « terminée ») ; toucher ouvre la prochaine occurrence (modifier la suite, arrêter).

## 3. Critères d'acceptation
- [x] CA-1 : `GET /calendar?month=AAAA-MM` (défaut : mois courant) renvoie chaque jour du mois avec `events`
  (rendez-vous non annulés), `tasks` (à faire ce jour), `done` (faites ce jour) et `conflict` (au moins un
  chevauchement, mêmes règles que l'agenda). Les occurrences des réunions récurrentes y sont (créées jusqu'à
  la fin du mois, un an au plus). Mois invalide → 400.
- [x] CA-2 : `GET /series` renvoie les réunions récurrentes : modèle, jours, début, fin, `nextOccurrence`
  (`{ id, date }` de la prochaine occurrence non annulée à partir d'aujourd'hui, ou `null`) et `ended`. Tri :
  en cours d'abord (par heure de début), terminées ensuite.
- [x] CA-3 : les deux lectures sont traitées par le téléphone avec les mêmes réponses (scénario de parité
  `vue-ensemble` rejoué à l'identique) ; isolation entre utilisateurs.
- [x] CA-4 : interface au format téléphone : trois modes courts (« À venir », « Mois », « À planifier ») ;
  calendrier lisible à 360 px (cibles de 44 px), chaque jour annoncé en toutes lettres au lecteur d'écran
  (« jeudi 5 novembre : 2 rendez-vous, 3 tâches, chevauchement ») ; chevauchement avec icône, jamais la
  couleur seule ; filtres et « semaine suivante » dans « À venir ».

## 4. Hors périmètre
- Vue semaine en grille horaire sur 7 colonnes ; glisser-déposer ; impression ou export.
- Rappels (spec 011).

## 5. Plan technique
- **Partagé** : `domain/overview.ts` (`getCalendarMonth`, `listSeries`), schéma `monthQuery`.
- **Serveur** : routes `GET /api/calendar`, `GET /api/series` (appel des commandes partagées) ; tests API et isolation.
- **Téléphone** : deux routes locales (écriture : elles créent les occurrences manquantes).
- **Écrans** : `plan/plan.page.ts` (modes, filtres, semaines), `plan/month-view.component.ts`,
  `series/series.page.ts` (`/app/reunions`).
- **Tests** : parité `vue-ensemble` (serveur + téléphone), API, e2e.

## 6. Tâches
- [x] T1 Logique partagée et routes serveur, tests API, parité
- [x] T2 Routes locales, parité téléphone
- [x] T3 Écrans : modes de « Planifier », calendrier du mois, réunions récurrentes
- [x] T4 e2e, documentation, revue

## 7. Revue
- Vérifications exécutées :
  - `npm test` : backend 207/207 (parité 7 scénarios dont `vue-ensemble`, 2 tests API d'isolation et de mois
    par défaut), frontend 60/60 (parité `vue-ensemble` rejouée sur le téléphone à l'identique).
  - `npm run lint`, `ng build` : propres.
  - e2e `frontend/e2e/vue-ensemble.spec.ts` (360×740, **serveur coupé** dès le début) : réunion hebdomadaire et
    tâche dans 10 jours ; « À venir » puis « semaine suivante » ; filtres Rendez-vous / Tâches / Tout ;
    réunions récurrentes avec prochaine occurrence ; calendrier du mois, jour touché détaillé. Les 7 parcours
    e2e passent. Capture du mois relue.
  - Contrôle manuel du scénario de parité : comptes par jour justes (occurrence annulée et tâche annulée non
    comptées, chevauchement du 11, footing arrêté au 10, réunion d'octobre « terminée »).
- Écarts restants :
  - « À venir » recharge toute la période à chaque « semaine suivante » (tâches par pages de 100, rendez-vous
    jusqu'à 200) : au-delà de 200 rendez-vous sur la période, les plus lointains ne s'affichent pas.
  - Le filtre par objectif ne propose que les objectifs à démarrer ou en cours.
