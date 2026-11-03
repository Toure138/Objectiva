# 006 — Scénario d'acceptation EcoleSaaS (étape 2)

## 1. Objectif
Vérifier de bout en bout, dans un test automatisé, que les briques de l'étape 2 fonctionnent
ensemble sur le cas d'usage de référence : préparer et réussir une première démonstration
d'EcoleSaaS auprès d'un établissement, avec son budget.

> **Hypothèse à confirmer** : la mission d'origine (« section 11 ») n'est pas dans le dépôt. Ce
> scénario est reconstitué à partir des indices présents (objectif « Présenter EcoleSaaS à trois
> établissements », « 1 démonstration sur 3 », collège Les Palmiers dans les données de démo).
> À aligner sur le texte exact de la mission dès qu'il est disponible.

## 2. Scénario
1. Aminata crée l'objectif « Présenter EcoleSaaS à trois établissements » en progression
   mesurée : 0 → 3 démonstrations.
2. Elle planifie demain une réunion « Démonstration au collège Les Palmiers » (10:00-11:30,
   lieu, participant « M. Koné, directeur », ordre du jour, 45 min de déplacement, 30 min de
   préparation) liée à l'objectif.
3. Elle ajoute une tâche de préparation, la coche.
4. Elle démarre son budget et prévoit 15 000 XOF « Transport et impression », dans la catégorie
   Transport.
5. Le jour J, elle règle 9 000 puis 3 000 XOF (double appui ignoré), puis solde : économie 3 000.
6. Elle marque la réunion « Réalisée » avec les décisions, crée une action de suivi.
7. Elle enregistre un relevé : 1 démonstration → progression 33 %, « 1 sur 3 démonstrations ».
8. « Aujourd'hui », « Planifier » et le bilan reflètent l'événement, la tâche et la progression.
9. Un autre utilisateur ne voit aucune de ces données.

## 3. Critères d'acceptation
- [x] CA-1 : le scénario ci-dessus est un test d'intégration unique
      (`tests/scenarios/ecolesaas.test.ts`) qui passe sur la base réelle de test.
- [x] CA-2 : un parcours Playwright 360×740 couvre les mêmes étapes côté interface (objectif
      mesuré, événement, tâche de préparation, budget, relevé).

## 4. Hors périmètre
- Étapes 3 et 4 (habitudes, agenda complet, récurrences, transferts).

## 5. Plan technique
- Test API (`supertest`) enchaînant les routes ; test e2e dans `frontend/e2e/ecolesaas.spec.ts`.

## 6. Tâches
- [x] T1 Test d'intégration backend
- [x] T2 Parcours e2e frontend
- [x] T3 Données de démo (seed) cohérentes avec le scénario

## 7. Revue
- Vérifications exécutées (commande + résultat) :
  - `backend/tests/scenarios/ecolesaas.test.ts` : 1 test séquentiel, passe sur la base réelle de
    test (suite backend : 119/119).
  - `frontend/e2e/ecolesaas.spec.ts` (Playwright, Pixel 7 forcé à 360×740) : objectif mesuré,
    réunion, préparation, « Réalisé » avec décisions, budget (démarrage, prévision, règlement
    partiel puis soldé avec économie), relevé « 1 sur 3 démonstrations » ; aucun défilement
    horizontal. 3 tests e2e passent.
  - Seed : le compte de démo contient l'objectif mesuré, deux événements, un budget du mois.
- Écarts restants :
  - **Le scénario reste une reconstitution** : le texte exact de la mission (section 11) n'est pas
    dans le dépôt. À comparer dès qu'il est disponible (montants, formulations, ordre des étapes).
  - L'e2e suppose l'API et la base lancées (`npm run api`, `npm run db:start`).
