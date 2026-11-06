# 012 — Habitudes

> **Statut : terminée (2026-11-06).**

## 1. Objectif
Installer des habitudes (lire, faire du sport, prier, réviser…) : les planifier à jours fixes ou « N fois par
semaine », les cocher chaque jour, voir sa série et son taux de réussite, faire une pause sans tout perdre,
changer de fréquence sans fausser le passé. Sur le téléphone, sans réseau.

## 2. Parcours utilisateur
1. « Ajouter » → « Une habitude » : titre, objectif lié (facultatif), fréquence : chaque jour, en semaine,
   jours choisis, ou N fois par semaine ; début (aujourd'hui par défaut).
2. « Aujourd'hui » → **Habitudes du jour** : chaque habitude prévue aujourd'hui, un bouton pour la cocher, sa
   série ; pour « N fois par semaine » : « 2 sur 3 cette semaine ».
3. Page **Habitudes** (depuis « Aujourd'hui ») : liste, série et réussite sur 30 jours ; habitudes archivées à part.
4. Fiche d'une habitude : série actuelle, meilleure série, réussite sur 30 jours, grille des 5 dernières
   semaines (fait, manqué, en pause, non prévu) où l'on peut cocher un jour passé ; modifier (la nouvelle
   fréquence s'applique à partir d'une date), mettre en pause / reprendre, archiver, supprimer.
5. **Bilan** : réussite de chaque habitude sur la période.

## 3. Critères d'acceptation
- [x] CA-1 : une habitude a un titre (≤ 120), un objectif facultatif (à l'utilisateur, sinon 404), une liste
  datée de règles (`JOURS` avec des jours ISO 1-7, ou `SEMAINE` avec 1 à 7 fois), des pauses datées et un
  statut `ACTIVE` / `ARCHIVEE`. Changer de fréquence ajoute une règle à partir d'une date (aujourd'hui par
  défaut) : les jours précédents restent évalués avec l'ancienne règle.
- [x] CA-2 : cocher / décocher un jour est idempotent (une ligne par habitude et par jour, identifiant calculé :
  deux appareils hors ligne ne créent pas de doublon) ; jamais dans le futur ni avant le début (400).
- [x] CA-3 : série `JOURS` = jours prévus consécutifs faits, en remontant depuis aujourd'hui (aujourd'hui pas
  encore fait ne casse rien ; jours non prévus et en pause ignorés). Série `SEMAINE` = semaines (lundi →
  dimanche) consécutives où l'objectif est atteint (semaine en cours en attente ; objectif réduit au prorata
  des jours actifs). Meilleure série sur tout l'historique.
- [x] CA-4 : réussite sur une période = faits / attendus (`JOURS` : jours prévus ; `SEMAINE` : objectif au
  prorata des jours actifs), plafonnée à 100 % ; aucun jour attendu → pas de taux.
- [x] CA-5 : `GET /today` renvoie `habits` (actives, non en pause, prévues aujourd'hui ou « par semaine » non
  encore atteintes cette semaine… et celles déjà cochées aujourd'hui) ; `GET /reviews` renvoie `habits`
  (attendus, faits, taux par habitude).
- [x] CA-6 : tout est traité par le téléphone avec les mêmes réponses (scénario de parité `habitudes`),
  synchronisé (tables `habits`, `habit_checks`, protocole 3 ; une application en version 2 reste servie sans
  les habitudes) ; isolation entre utilisateurs sur toutes les routes.
- [x] CA-7 : interface au format téléphone : formulaire, section du jour avec bouton de 44 px, page Habitudes,
  fiche avec grille lisible au lecteur d'écran (« mardi 4 novembre : fait »), statuts avec icône et libellé.

## 4. Hors périmètre
- Habitudes chiffrées (quantité, durée), plusieurs fois par jour, rappels d'habitudes, effet sur la
  progression d'un objectif, statistiques sur l'année.

## 5. Plan technique
- **Base** : `habits` (`rules` et `pauses` en JSON, `status`, `start_date`, `goal_id` SetNull) et `habit_checks`
  (`habit_id` cascade, `date`, `done`, unique `(habit_id, date)`), synchronisables (déclencheurs).
- **Partagé** : `habits.rules.ts` (règle du jour, attendu, séries, réussite, grille), `habits.schemas.ts`,
  `domain/habits.ts` (commandes et vues), « Aujourd'hui » et bilan étendus, protocole 3.
- **Serveur** : dépôt Prisma, routes `/api/habits`, synchronisation, tests API / isolation / synchronisation, parité.
- **Téléphone** : Dexie `version(3)`, dépôt local, routes locales, `snapshot()`, parité locale.
- **Écrans** : `habits/habit-form.component.ts`, `habits/habits.page.ts` (`/app/habitudes`),
  `habits/habit-detail.page.ts` (`/app/habitudes/:id`), section du jour, bilan, feuille « Ajouter ».

## 6. Tâches
- [x] T1 Règles pures et tests
- [x] T2 Tables, schémas, lignes, logique partagée, « Aujourd'hui » et bilan
- [x] T3 Serveur : dépôt, routes, synchronisation, tests, parité
- [x] T4 Téléphone : base locale, dépôt, moteur, parité locale
- [x] T5 Écrans
- [x] T6 e2e, documentation, revue

## 7. Revue
- Décisions prises en route :
  - Décocher remet `done` à faux au lieu de supprimer la ligne : avec un identifiant calculé, une suppression
    (prioritaire à la synchronisation) aurait empêché de recocher le même jour.
  - « N fois par semaine » commencé en cours de semaine : objectif au prorata (vendredi → 1 sur 3 la première
    semaine), au moins 1.
- Vérifications exécutées :
  - `npm test` : backend 231/231 (9 tests des règles : règle datée, jours non prévus et pauses ignorés,
    séries en jours et en semaines, prorata, meilleure série, réussite, grille ; 7 tests API : isolation sur
    toutes les routes, objectif supprimé, double appui, synchronisation entre deux téléphones, habitude
    supprimée ailleurs, habitude invalide, client v2 ; parité 8 scénarios dont `habitudes`, références
    existantes : seul `"habits": []` ajouté) ; frontend 71/71 (parité `habitudes` rejouée sur le téléphone,
    2 tests de synchronisation).
  - Relecture du scénario `habitudes` étape par étape (séries 4 → 2 → 4 → 5, grille, bilan 5/7 et 3/3,
    prorata de la semaine en cours, pause effacée à la reprise du jour même).
  - Mutation « aujourd'hui pas encore fait casse la série » : détectée (3 tests).
  - e2e `frontend/e2e/habitudes.spec.ts` (**serveur coupé**) : création (chaque jour, 3 fois par semaine),
    cochage depuis « Aujourd'hui », liste, fiche, pause puis reprise, bilan ; retour du serveur : tout est
    synchronisé. Les 8 parcours passent. Captures relues (un défaut corrigé : « 1 jours »).
  - `npm run lint`, `ng build` : propres.
- Écarts restants :
  - Le titre de l'en-tête des fiches (habitude, rendez-vous) est tronqué à 360 px quand la pastille de
    synchronisation et deux boutons l'accompagnent.
  - Pas de rappel d'habitude, pas d'habitude chiffrée, pas de lien avec la progression d'un objectif.
  - Une habitude qui passe de « jours fixes » à « par semaine » : la série repart dans la nouvelle unité.
