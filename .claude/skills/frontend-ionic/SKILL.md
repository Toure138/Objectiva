---
name: frontend-ionic
description: Conventions du frontend Objectiva (Angular 22 sans zone.js + Ionic 9 + Capacitor 8, mobile d'abord, en français). Utiliser pour créer ou modifier un écran, un composant, une modale, un appel API ou un formulaire.
---

# Conventions frontend Objectiva

## Structure (`frontend/src/app/`)
- `core/` : `api.service.ts` (seul point d'appel HTTP, une méthode typée par endpoint),
  `models.ts` (types de l'API + libellés français des énumérations), session, thème, réglages.
- `shared/` : composants et services réutilisés (`task-item`, `state-view`, `page-header`,
  formulaires en modale, `add-menu.service`).
- Un dossier par espace : `today/`, `plan/`, `goals/`, `budget/`, `review/`, `profile/`.
  Nouvelle page : route chargée à la demande dans `app.routes.ts` (enfants de `/app` pour un
  onglet), chemin en français.

## Modèle d'écran
Copier `today/today.page.ts` : signaux `loading` / `error` / données, `load()` appelé dans
`ionViewWillEnter()` (rechargement à chaque retour sur l'onglet), `<app-state-view>` pour le
chargement et l'erreur avec « Réessayer », message explicite pour une liste vide.

## Règles
1. **Signaux** pour l'état (pas de zone.js). Composants standalone, imports Ionic depuis
   `@ionic/angular`, icônes enregistrées avec `addIcons` dans le constructeur.
2. **`inject()` avant tout `await`** dans les gardes et fonctions async (sinon NG0203).
3. **Modales** : `@Input()` classiques (Ionic affecte `componentProps` directement) ; injecter
   `ModalController` sous le nom `modalCtrl` (`modal` est réservé).
4. Aucun calcul métier : afficher les valeurs de l'API (progression, taux, reste).
5. Mobile d'abord (360 px) : actions principales en bas ou en bouton « + », formulaires courts,
   options avancées dans un `ion-accordion` « Plus d'options », libellés courts dans les onglets.
6. Accessibilité : statut = libellé + icône, `aria-label` sur les boutons-icônes, cibles 44 px.
7. Double appui : désactiver le bouton pendant l'appel (`busy`/`saving`).
8. Erreurs : `ApiError` (message français de l'API) ; erreurs de champ via `fields`.
9. Toasts en position `top` ; action « Annuler » après une action réversible.
10. Dates : `AAAA-MM-JJ`, affichage via `core/dates.ts` (`relativeDay`, `longDate`).

## Design system (spec 002)
- Composer les écrans avec les composants de `shared/` : `app-page-header` (titre display, avatar,
  retour), `app-state-view` (squelette/erreur), `app-empty-state`, `app-section-header`,
  `app-segmented` (à la place d'`ion-segment`), `app-progress-ring` / `app-progress-bar`,
  `app-task-item` (passer `[index]` pour l'animation), `app-category-badge`.
- Contenu d'un écran dans `<div class="ob-container">` ; réserver `ob-fab-space` sous les listes
  qui ont un bouton « + ». Formulaires : `<ion-list class="ob-form" lines="none">`.
- Couleurs uniquement par jetons (`variables.scss`), jamais en dur. Pastilles : `ob-chip` +
  `--ok|--warn|--danger|--primary`, toujours avec libellé (et icône).
- Vérifier chaque écran en clair **et** en sombre à 360×740 (captures Playwright).

## Code partagé (`shared/`)
Les règles de calcul et schémas de `shared/src/` s'importent par chemin relatif **sans extension**
(`'../../../../shared/src/goals.rules'`). Ne jamais copier une règle dans le frontend : l'importer.

## Argent, événements, formulaires à clé
- Montants : `core/money.ts` (`formatMoney`, `formatSigned`, `parseMoney`, `toInputValue`,
  `newIdempotencyKey`). Le frontend n'additionne ni ne soustrait des montants : il affiche les valeurs de
  l'API (`remaining`, `economy`, `percent`…). Une saisie invalide est refusée localement, jamais arrondie.
- Un formulaire qui crée une écriture d'argent génère sa `idempotencyKey` **à l'ouverture** et la rejoue
  telle quelle ; le bouton est désactivé pendant l'appel (`saving`).
- Événements : jour et heures locaux viennent de l'API (`date`, `startTime`, `endTime`, `leaveAtTime`) ;
  ne jamais reconvertir d'instants dans le navigateur.
- Icônes des nouveaux composants : `[icon]="importee"` (pas de `addIcons`).

## Vérifier
```bash
npx ng lint --fix && npx prettier --write "src/**/*.{ts,html}"
npx ng lint && npx ng test --no-watch && npx ng build
```
Puis un parcours réel au format 360×740 (Playwright). Ionic garde les pages précédentes dans le
DOM : restreindre les sélecteurs à la page active.

## Mobile natif
`npx ng build && npx cap sync android && npx cap open android`. En développement, l'API est en
HTTP (`capacitor.config.ts` : `androidScheme: 'http'`, `cleartext: true`). iOS : Mac + Xcode.
