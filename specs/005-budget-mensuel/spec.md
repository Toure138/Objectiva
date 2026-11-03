# 005 — Budget mensuel

## 1. Objectif
Planifier ses revenus, dépenses et épargne du mois, enregistrer les paiements réels, comparer le
prévu au réel et régler une prévision (en une fois, en plusieurs fois, ou soldée avec une
économie), sans jamais perdre ni doubler une écriture en cas de double appui.

## 2. Parcours utilisateur
1. Premier passage dans « Budget » : « Démarrer mon budget » crée un compte « Espèces » et des
   catégories par défaut (une seule fois).
2. Choix du mois (précédent/suivant). Résumé : revenus prévus/réels, dépenses prévues/réelles,
   reste à dépenser, économies réalisées, soldes des comptes.
3. Enveloppes : un montant prévu par catégorie et par mois ; barre « dépensé / prévu ».
4. « Ajouter » → « Dépense ou revenu » : une **prévision** (à payer ou recevoir à une date) ou
   une **opération réelle** (déjà payée).
5. Sur une prévision : « Régler » (montant, compte, date) ; « Solder » termine la prévision même
   si le montant payé est inférieur : la différence est une **économie**.
6. Une opération réelle peut être supprimée ; la prévision liée est recalculée.

## 3. Critères d'acceptation
- [x] CA-1 : tout montant est un **entier** en plus petite unité de la devise (`XOF` : 1 franc, 0
      décimale ; `EUR` : centime) ; jamais de flottant ; maximum 1 000 000 000 ; > 0.
- [x] CA-2 : types `REVENU`, `DEPENSE`, `EPARGNE`. Comptes (`ESPECES, BANQUE, MOBILE_MONEY`) avec
      solde d'ouverture ; catégories par type.
- [x] CA-3 : statut d'une prévision : `PREVUE` (rien payé), `PARTIELLE` (0 < payé < prévu),
      `SOLDEE` (payé ≥ prévu, ou soldée volontairement), `ANNULEE`. Calcul par une règle pure.
- [x] CA-4 : `POST /budget/operations/:id/settle` (montant, compte, date, `close?`,
      `idempotencyKey`) crée une transaction réelle liée **et** met à jour le statut dans une
      seule transaction base de données.
- [x] CA-5 : même `idempotencyKey` rejouée (double appui) : aucune seconde écriture, la réponse
      est celle de la première (contrainte unique `(user_id, idempotency_key)` en base).
- [x] CA-6 : régler avec `close: true` un montant inférieur au prévu solde la prévision et
      produit `economy = prévu − payé` ; un paiement supérieur est un `overrun` visible.
- [x] CA-7 : solde d'un compte = ouverture + revenus − dépenses − épargne (transactions réelles
      seulement) ; résumé du mois : prévu, réel, reste, économie, dépassements, par enveloppe.
- [x] CA-8 : supprimer une transaction recalcule la prévision liée (ré-ouverte si payé < prévu).
- [x] CA-9 : compte, catégorie et prévision rattachés doivent appartenir à l'utilisateur (404
      sinon) et le type de la catégorie doit correspondre à celui de l'opération.
- [x] CA-10 : aucun montant ni corps de requête dans les journaux.
- [x] CA-11 : isolation complète sur toutes les routes budget.
- [x] CA-12 : le frontend affiche les valeurs de l'API (soldes, restes, pourcentages) sans les
      recalculer ; formate seulement selon la devise (`Intl`).

## 4. Hors périmètre
- Budgets annuel et quotidien imbriqués, dépassements répartis (étape 3) ; transferts entre
  comptes, objectifs d'épargne, report d'enveloppe, changement de devise, export (étape 4) ;
  récurrences ; pièces jointes ; connexion bancaire.

## 5. Plan technique
- **Utilisateur** : `users.currency` (défaut `XOF`), exposée dans `user`.
- **Modèle** : `Account`, `BudgetCategory`, `Envelope` (`(user, month, category)` unique),
  `PlannedOperation` (`status`, `closed_at`), `Transaction` (`planned_operation_id` SetNull,
  `idempotency_key`, unique `(user_id, idempotency_key)`) ; index par `(user_id, date)`.
  Suppressions : utilisateur Cascade ; catégorie/compte utilisés → `Restrict` (archivage plutôt
  que suppression).
- **Règles pures** (`budget.rules.ts`) : `settlementStatus`, `accountBalance`, `monthSummary`,
  `envelopeStatus`, bornes d'un mois.
- **Endpoints** (préfixe `/api/budget`) : `POST /setup` ; `GET|POST /accounts`, `PATCH
  /accounts/:id` ; `GET|POST /categories`, `PATCH /categories/:id` ; `GET /months/:AAAA-MM` ;
  `PUT /envelopes` ; `POST /operations`, `PATCH|DELETE /operations/:id`, `POST
  /operations/:id/settle` ; `POST /transactions`, `DELETE /transactions/:id`.
- **Écrans** : `budget/budget.page.ts` (mois, résumé, enveloppes, opérations), `shared/money.ts`,
  `shared/operation-form`, `shared/settle-form`, feuille « Ajouter ».
- **Tests** : unitaires des règles ; API (dont double appui et économie) ; isolation.

## 6. Tâches
- [x] T1 Migration, devise utilisateur, règles pures + tests unitaires
- [x] T2 Comptes, catégories, démarrage
- [x] T3 Prévisions, règlement idempotent, transactions
- [x] T4 Vue du mois (résumé, enveloppes) + tests API et isolation
- [x] T5 Frontend : modèles, formatage, écran Budget
- [x] T6 Frontend : formulaires (opération, règlement), feuille « Ajouter »
- [x] T7 Documentation API, seed

## 7. Revue
- Vérifications exécutées (commande + résultat) :
  - `npx vitest run` (backend) : 119/119. Budget : 16 tests de règles pures (`budget.rules.test.ts`),
    22 tests API (`budget.test.ts`, CA-1 à CA-10) dont **cinq appuis simultanés** avec la même clé
    (une seule écriture) et deux règlements simultanés (cohérence), et le cas d'isolation CA-11.
  - **Contrôle par mutation** : sans le verrou `FOR UPDATE` sur la prévision, le test des deux
    règlements simultanés échoue (1 exécution sur 3, statut « partielle » alors que 10 000 sont
    payés) ; avec le verrou, 6 exécutions sur 6 passent.
  - `ng test` : 18/18, dont `money.spec.ts` (formatage XOF/EUR, lecture de saisie sans flottant).
  - `ng lint`, Prettier, `ng build` : propres, sans avertissement.
  - Navigateur 360×740 (clair et sombre) : démarrage du budget, résumé, comptes, enveloppes,
    prévisions, règlement avec économie, **double appui volontaire : 1 seule requête envoyée**.
  - Contraste mesuré sur l'écran Budget : AA respecté (CA-2 de la spec 002).
- Écarts restants :
  - Une seule devise par utilisateur (`XOF` par défaut, colonne `users.currency`) : pas d'écran de
    choix avant l'étape 4 ; en `EUR`, le formatage et la saisie sont couverts par les tests.
  - Le règlement est refusé sur une prévision déjà soldée : un trop-perçu se corrige en modifiant
    le montant prévu ou en supprimant la transaction.
  - Les enveloppes ne sont pas reportées d'un mois à l'autre (étape 4).
  - Pas de vue « jour » ni « année » (étape 3, comme prévu).
