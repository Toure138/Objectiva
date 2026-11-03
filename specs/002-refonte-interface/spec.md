# 002 — Refonte de l'interface

## 1. Objectif
Donner à Objectiva une identité visuelle soignée et cohérente (clair et sombre), sans changer le
comportement : mêmes écrans, mêmes actions, mêmes règles. L'application doit donner envie de
l'ouvrir chaque matin : calme, lisible, encourageante, jamais culpabilisante.

## 2. Direction visuelle « calme et cap »
- **Couleurs** : fond papier chaud, vert sauge profond pour l'action principale, ambre pour
  « à replanifier », rouge brique pour « en retard » et les actions destructrices. Une couleur
  et une icône par catégorie d'objectif. Mode sombre à fond encre verte (pas de noir pur).
- **Typographie** : titres et chiffres en *Fraunces* (serif chaleureux), interface en *Inter*.
  Polices embarquées dans l'application (aucun appel à un service tiers, utilisable hors ligne).
- **Formes** : cartes à coins arrondis (20 px), bordure fine plutôt qu'ombre lourde, champs de
  formulaire en cases arrondies, boutons pleins à coins 14 px, pastilles pour les statuts.
- **Mouvement** : apparition douce des listes, anneau de progression animé, coche avec retour
  haptique sur mobile. Tout mouvement est supprimé si l'utilisateur le demande
  (`prefers-reduced-motion`).
- **Composants partagés** : en-tête de page avec salutation et avatar, anneau de progression,
  barre de progression, état vide, squelettes de chargement, feuille « Ajouter » à tuiles,
  contrôle segmenté en pilule, barre d'onglets à indicateur.

## 3. Critères d'acceptation
- [x] CA-1 : aucune régression fonctionnelle : tests backend, tests frontend et e2e inchangés ou
      adaptés au même comportement ; aucune route ni appel API ajouté.
- [x] CA-2 : contraste du texte ≥ 4,5:1 et des éléments d'interface ≥ 3:1, en clair et en sombre.
- [x] CA-3 : à 360 px de large, aucun défilement horizontal ; toutes les cibles tactiles ≥ 44 px ;
      le zoom reste autorisé.
- [x] CA-4 : un statut n'est jamais exprimé par la couleur seule (libellé + icône conservés).
- [x] CA-5 : `prefers-reduced-motion: reduce` désactive les animations.
- [x] CA-6 : polices servies par l'application (≤ 150 ko au total), texte lisible pendant le
      chargement (`font-display: swap`).
- [x] CA-7 : aucun calcul métier ajouté côté frontend : progression, taux et libellés viennent de
      l'API ; seules des mises en forme (anneau, salutation selon l'heure) sont locales.
- [x] CA-8 : thème clair, sombre et « comme le téléphone » fonctionnels sur tous les écrans, y
      compris modales, feuilles, alertes et toasts.
- [x] CA-9 : parcours réel vérifié au format 360×740 : inscription/connexion, création d'un
      objectif et d'un jalon, création et cochage d'une tâche, report, bilan, profil.

## 4. Hors périmètre
- Nouvelles fonctionnalités (budget, habitudes, événements) : l'onglet Budget reste une page
  d'attente, mieux présentée.
- Icône d'application Android et écran de démarrage natif : à faire avec `cap add android`.
- Changement de la structure de navigation (5 onglets conservés).

## 5. Plan technique
- **Fondations** : `src/theme/variables.scss` (jetons de couleur Ionic + jetons `--ob-*`, clair et
  sombre), `src/global.scss` (typographie, habillage des composants Ionic, utilitaires),
  `src/assets/fonts/` (Fraunces et Inter, sous-ensemble latin).
- **Partagé** : `brand-mark`, `progress-ring`, `empty-state`, `section-header`, `add-sheet`,
  `category-style.ts` ; refonte de `page-header`, `state-view`, `task-item`.
- **Écrans** : `tabs`, `today`, `plan`, `goals`, `goal-detail`, `review`, `budget`, `profile`,
  `login`, formulaires en modale (classes de style uniquement).
- **Tests** : tests unitaires existants conservés ; e2e Playwright étendu (connexion, parcours
  tâche) ; captures 360×740 clair/sombre pour la revue visuelle.

## 6. Tâches
- [x] T1 Polices embarquées, jetons de thème, habillage global
- [x] T2 Composants partagés
- [x] T3 Onglets, Aujourd'hui, Planifier
- [x] T4 Objectifs et détail d'un objectif
- [x] T5 Bilan, Budget, Profil
- [x] T6 Connexion
- [x] T7 Formulaires et feuille « Ajouter »
- [x] T8 Vérifications (lint, tests, build, captures clair/sombre, parcours réel)

## 7. Revue
- Vérifications exécutées (commande + résultat) :
  - `npm test` : backend 44/44, frontend 12/12 (dont 4 nouveaux tests des composants partagés).
  - `npm run lint` (types backend + ESLint 0 avertissement + types e2e + Prettier) : propre.
  - `ng build` : sans erreur ni avertissement ; polices 115 ko (CA-6), bundle initial 218 ko transférés.
  - e2e Playwright 360×740 : connexion + parcours complet (inscription, objectif, tâche du jour,
    cochage, absence de défilement horizontal) : 2/2.
  - Captures 360×740 clair et sombre de tous les écrans (connexion, inscription, Aujourd'hui,
    Planifier, Objectifs, détail, Bilan, Budget, Profil, feuille « Ajouter », formulaire).
  - Contraste mesuré par script sur tout le texte visible, clair et sombre : AA respecté ; les
    seuls signalements sont des faux positifs (dégradés de marque et fond interne des boutons
    Ionic, vérifiés à la main : blanc sur vert profond ≥ 5:1, blanc sur #17695a 6,3:1).
- Écarts restants :
  - Mode « md » forcé (rendu identique sur iOS) : à revoir si une identité iOS native est voulue.
  - Test sur un vrai téléphone Android (WebView) et icône/écran de démarrage natifs : à faire avec
    `cap add android`.
