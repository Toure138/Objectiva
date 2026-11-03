# OBJECTIVA — Contexte projet pour Claude Code

Application personnelle de planification et de suivi, entièrement en français : définir des
objectifs à long terme, les décomposer en jalons mensuels, planifier tâches et habitudes par
semaine et par jour, cocher ce qui est réellement accompli, planifier le budget (jour, mois,
année), gérer réunions et rencontres, et faire le bilan. Voir [README.md](README.md).

**État** : étape 1 « Socle objectifs » terminée (spec 001) ; interface refondue (spec 002). Suite et éléments reportés :
[docs/feuille-de-route.md](docs/feuille-de-route.md). API : [docs/api.md](docs/api.md).

## Stack technique (versions vérifiées, voir `docs/versions.md`)

- **Frontend** (`frontend/`) : Angular 22 (standalone, **sans zone.js** : état en signaux),
  Ionic Angular 9, Capacitor 8 (Android ; iOS préparé). Mobile d'abord (petit Android, 360 px).
- **Backend** (`backend/`) : Node.js, Express 5, TypeScript 5.9, API REST, un seul service.
- **Base** : PostgreSQL 16 (Docker) + Prisma 7 (`prisma.config.ts`, adaptateur `@prisma/adapter-pg`,
  client généré dans `backend/src/generated/`, non versionné).
- **Tests** : Vitest + Supertest sur une vraie base `objectiva_test` (backend) ; Vitest via
  `ng test` (frontend) ; Playwright disponible pour l'e2e.

## Architecture

### Backend
- `src/modules/<domaine>/` : `*.routes.ts` (aucune règle métier), `*.service.ts`, `*.schemas.ts`
  (zod), `*.rules.ts` (calculs purs testés sans base). Domaines actuels : `auth`, `goals`
  (+ jalons), `tasks`, `today`, `reviews`. À venir : `events`, `budget`, `habits`.
- `src/core/` : `env.ts` (validation de l'environnement), `prisma.ts`, `errors.ts` (`AppError`,
  `parseInput`, gestionnaire central), `auth.middleware.ts` (`requireAuth`, `currentUser`),
  `dates.ts`, `ids.ts` (`idParam` : uuid invalide → 404).
- **Sessions** : table `sessions` ; le JWT porte `sid`, vérifié en base à chaque requête →
  déconnexion = révocation immédiate.
- Les **règles de calcul** (progression, report, taux du bilan, et plus tard soldes et
  disponibilité) vivent dans le backend. Le frontend affiche, il ne recalcule pas.

### Frontend
- `src/app/core/` : `api.service.ts` (**seul point d'appel HTTP**), `auth.service.ts` (session
  via Capacitor Preferences), `auth.interceptor.ts`, `auth.guard.ts`, `settings.service.ts`
  (adresse d'API modifiable dans l'app), `theme.service.ts`, `models.ts` (types + libellés FR).
- `src/app/shared/` : `task-item`, `task-actions.service` (cocher/reporter/annuler + « Annuler »),
  formulaires en modale, `add-menu.service` + `add-sheet` (feuille « Ajouter »), `state-view`
  (squelette/erreur), `page-header`, `empty-state`, `section-header`, `segmented` (contrôle en
  pilule), `progress-ring`, `progress-bar`, `category-badge`, `goal-status-chip`, `brand-mark`.
- Un dossier par espace : `today/`, `plan/`, `goals/`, `budget/` (à venir), `review/`, `profile/`.
  Routes en français : `/connexion`, `/app/aujourdhui`, `/app/objectifs/:id`, `/profil`…

### Design system (spec 002 « calme et cap »)
- **Jetons** : `src/theme/variables.scss` (couleurs Ionic + `--ob-*`, clair et sombre) ; habillage
  des composants Ionic et utilitaires `ob-*` (`ob-card`, `ob-chip`, `ob-cat--*`, `ob-rise`,
  `ob-container`, `ob-form`…) dans `src/global.scss`. **Jamais de couleur en dur** dans un
  composant : utiliser les jetons (`--ob-surface`, `--ob-text-2`, `--ion-color-primary`…) ; seuls les
  dégradés de marque (connexion, Budget, bienvenue) sont en dur, avec du texte blanc.
- **Typographie** : Fraunces (titres, chiffres : classe `ob-display`) et Inter (interface), fichiers
  woff2 dans `src/fonts/` (embarqués, hors ligne). Mode Ionic **`md` forcé** (`main.ts`).
- **Catégories d'objectifs** : une couleur + une icône chacune (`category-badge.component.ts`,
  classes `ob-cat ob-cat--<categorie>` qui posent `--cat`, `--cat-soft`, `--cat-ink`).
- Une icône se passe en `[icon]="importee"` (pas de `addIcons`) dans les nouveaux composants.

## Règles de sécurité non négociables

- Toute ressource est filtrée par `userId` côté serveur. **Chaque identifiant associé** (objectif
  d'une tâche, jalon, plus tard événement ou enveloppe) doit appartenir à l'utilisateur connecté :
  vérifier avant d'écrire (voir `resolveLinks` dans `tasks.service.ts`). Ressource d'autrui → 404.
- Mots de passe hachés (bcrypt 12). Jamais de mot de passe, jeton, corps de requête ou montant
  dans les journaux (le gestionnaire d'erreurs ne logue que méthode, route et message).
- Secrets uniquement dans `backend/.env` (non versionné). `.env.example` : valeurs fictives.
- Validation de toutes les entrées (zod). Limitation par e-mail (5 échecs / 15 min) et par IP.
- Actions idempotentes contre le double appui (cocher, reporter à la même date). Pour les
  paiements à venir : clé d'idempotence et contrainte d'unicité en base.
- Montants : entier en plus petite unité, jamais `float`. Dates sans heure : colonne `DATE`,
  échange `AAAA-MM-JJ`, jamais convertie de fuseau. Instants : UTC + fuseau de l'utilisateur.
- Tout ajout de route : test de succès, de validation et d'**isolation entre deux utilisateurs**
  (`backend/tests/api/isolation.test.ts`).

## Pièges déjà rencontrés (ne pas les refaire)

- **Angular** : dans une garde ou une fonction `async`, appeler tous les `inject()` **avant** le
  premier `await` (sinon NG0203).
- **Ionic, modales** : `componentProps` est affecté directement aux propriétés du composant →
  utiliser `@Input()` classiques dans un composant ouvert en modale, pas `input()` signal. Ne pas
  nommer une propriété `modal` (réservée par Ionic) : utiliser `modalCtrl`.
- **Ionic, pile de navigation** : les pages précédentes restent dans le DOM ; dans les tests e2e,
  restreindre les sélecteurs à la page active (`app-today …`).
- **Ionic, toasts** : position `top` (en bas, le bouton « + » masque l'action « Annuler »).
- **Petits écrans** : libellés courts dans les segments et onglets (360 px de large). Les 5 onglets
  ne tiennent que grâce à `ion-tab-button { --padding-*: 0; min-width: 0 }` et une pastille d'icône
  compacte (`global.scss`) : ne pas les élargir.
- **Ionic md** : `ion-header` porte une ombre portée (`box-shadow`) à retirer, pas seulement
  `::after`. Les variables sombres d'Ionic (`.ion-palette-dark.md`) sont plus spécifiques que
  `:root` : les surcharger sous `:root.ion-palette-dark.md` (voir `variables.scss`).
- **Angular** : une propriété CSS personnalisée se lie par `[style.--nom]="valeur + 'px'"` (pas de
  suffixe d'unité `.px`).
- **Prisma 7** : `migrate dev` ne régénère plus le client → `npx prisma generate` après une
  modification du schéma (fait aussi par `postinstall`).
- **Port** : l'API utilise **3100** ; le port 3000 est occupé par un autre projet sur ce poste.
  Ne jamais arrêter un processus Node que ce projet n'a pas lancé.
- **Lint frontend** (strict, config Ionic) : types de retour explicites, ordre des imports,
  suffixe `Component`/`Page`. `npx ng lint --fix` puis `npx prettier --write "src/**/*.{ts,html}"`.

## Conventions

- **Langue** : métier, messages, commentaires et interface en français ; identifiants techniques
  (fichiers, fonctions, variables, modèles Prisma) en anglais ; tables et colonnes en snake_case.
  Valeurs d'énumération métier en français majuscule (`A_DEMARRER`, `CARRIERE`).
- **Fichiers** : kebab-case avec rôle (`goal-detail.page.ts`, `goals.service.ts`).
- **Réponses API** : `{ success, data }` ou `{ success: false, code, message, details? }` ;
  `message` affichable tel quel ; `code` stable.
- **Ton de l'interface** : tutoiement, encourageant, jamais culpabilisant.
- **Accessibilité** : statuts avec libellé et icône (jamais la couleur seule), cibles de 44 px,
  zoom autorisé, `aria-label` sur les boutons-icônes.
- **Commentaires** : seulement le « pourquoi » non évident.

## Méthodologie

Pour toute fonctionnalité non triviale, suivre le skill **`spec-driven-development`** (commande
`/nouvelle-fonctionnalite`) : SPEC → plan → tâches → implémentation → tests → revue, dans
`specs/NNN-nom/spec.md`. Skills : `backend-conventions`, `frontend-ionic`. Pour une correction
isolée, appliquer la démarche avec proportion.

Avant de déclarer une étape finie : `npm test`, `npm run lint`, `ng build`, et un parcours réel
dans le navigateur au format téléphone.

## Commandes (depuis la racine)

- `npm run db:start` / `npm run db:stop` — PostgreSQL (Docker).
- `npm run db:migrate` — applique les migrations ; `npm run db:seed` — données de démo
  (demo@objectiva.fr / objectiva123).
- `npm run api` — API sur http://localhost:3100 ; `npm run web` — interface sur http://localhost:4200.
- `npm test` — tests backend puis frontend ; `npm run lint` — types backend + lint frontend.
- Nouvelle migration : `cd backend && npx prisma migrate dev --name <nom>` puis `npx prisma generate`.
