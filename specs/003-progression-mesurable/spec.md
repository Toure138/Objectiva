# 003 — Progression mesurable des objectifs

## 1. Objectif
Mesurer l'avancement d'un objectif par une quantité (ex. « 1 démonstration sur 3 », « 40 km sur
120 ») et non seulement par jalons. L'utilisateur saisit une valeur initiale, une cible et des
relevés successifs ; la progression se calcule côté serveur.

## 2. Parcours utilisateur
1. À la création d'un objectif : choix du mode de progression « Par jalons » (défaut) ou
   « Mesurée » ; en mode mesuré : unité (« démonstrations »), valeur de départ, cible.
2. Sur la fiche de l'objectif : bouton « Enregistrer un relevé » (valeur, date, note facultative).
3. La progression (anneau, barre, libellé « 1 sur 3 démonstrations ») se met à jour partout :
   liste des objectifs, fiche, bilan.
4. Un relevé peut être supprimé (erreur de saisie) ; l'historique des relevés est visible.

## 3. Critères d'acceptation
- [x] CA-1 : un objectif a un `progressMode` `JALONS` (défaut) ou `MESURE`. En `MESURE`, unité,
      valeur initiale et cible sont obligatoires et la cible diffère de la valeur initiale.
- [x] CA-2 : progression mesurée = (valeur courante − départ) / (cible − départ), bornée à 0-100 %,
      arrondie ; la valeur courante est le dernier relevé (date puis création), sinon le départ.
      Fonctionne aussi pour une cible inférieure au départ (ex. 80 kg → 72 kg).
- [x] CA-3 : le libellé est « {courant} sur {cible} {unité} » ; `reached` vaut `true` dès que la
      cible est atteinte ou dépassée.
- [x] CA-4 : `POST /goals/:id/readings` enregistre un relevé (valeur entière, date par défaut
      aujourd'hui) et renvoie le relevé et la progression à jour ; refusé (409 `CONFLICT`) si
      l'objectif n'est pas en mode `MESURE`.
- [x] CA-5 : `DELETE /readings/:id` supprime un relevé et recalcule la progression.
- [x] CA-6 : la progression par jalons reste inchangée pour les objectifs existants (aucune
      régression : tests de la spec 001).
- [x] CA-7 : la progression apparaît avec le même format (`progress`) dans `GET /goals`,
      `GET /goals/:id` et le bilan ; le frontend ne recalcule rien.
- [x] CA-8 : isolation : un utilisateur ne peut ni lire, ni créer, ni supprimer un relevé sur
      l'objectif d'un autre (404).
- [x] CA-9 : passer un objectif de `MESURE` à `JALONS` est autorisé ; les relevés sont conservés.

## 4. Hors périmètre
- Valeurs décimales (entiers seulement), objectifs composés (plusieurs mesures), graphique
  d'évolution, rappels de relevé.

## 5. Plan technique
- **Modèle** : `Goal.progressMode` (enum `ProgressMode`), `measureUnit` (30), `startValue`,
  `targetValue` (Int, nullables) ; table `goal_readings` (`id`, `goal_id` → goals **Cascade**,
  `value` Int, `read_on` DATE, `note` 200, `created_at`) avec index `(goal_id, read_on)`.
- **Règles pures** (`goals.rules.ts`) : `measuredProgress`, `goalProgress` (dispatch par mode).
- **Endpoints** : `POST /goals/:id/readings`, `DELETE /readings/:id` ; `POST/PATCH /goals` acceptent
  `progressMode`, `measureUnit`, `startValue`, `targetValue` ; `GET /goals/:id` ajoute `readings`.
- **Écrans** : formulaire d'objectif (mode, unité, départ, cible), fiche (section « Relevés »,
  modale de relevé), libellés de progression génériques.
- **Tests** : unitaires des règles ; API succès/validation/409 ; isolation ajoutée à
  `isolation.test.ts`.

## 6. Tâches
- [x] T1 Migration Prisma + règles pures + tests unitaires
- [x] T2 Schémas, service, routes, tests API et isolation
- [x] T3 Bilan et liste : progression générique
- [x] T4 Frontend : modèles, formulaire, fiche, relevés
- [x] T5 Documentation API, seed

## 7. Revue
- Vérifications exécutées (commande + résultat) :
  - `npx vitest run` (backend) : 58/58, dont 5 règles pures, 8 tests API `readings.test.ts`
    (CA-1 à CA-7, CA-9) et le cas d'isolation CA-8 dans `isolation.test.ts`.
  - `npx ng lint`, `npx prettier --check`, `ng build` : propres.
  - Parcours navigateur 360×740 (script Playwright) : objectif EcoleSaaS mesuré, relevé « 1 »
    avec note, historique et suppression visibles, aucune erreur console.
- Écarts restants :
  - Pas d'annulation (« Annuler ») après suppression d'un relevé : confirmation par alerte à la place.
  - Le formulaire d'objectif n'a pas de capture dédiée du mode « Mesurée ».
