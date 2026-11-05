# OBJECTIVA — Contexte projet pour Claude Code

Application personnelle de planification et de suivi, entièrement en français : définir des
objectifs à long terme, les décomposer en jalons mensuels, planifier tâches et habitudes par
semaine et par jour, cocher ce qui est réellement accompli, planifier le budget (jour, mois,
année), gérer réunions et rencontres, et faire le bilan. Voir [README.md](README.md).

**État** : étapes 1 et 2 terminées (specs 001 à 006) : socle objectifs, refonte de l'interface,
progression mesurée, événements, budget mensuel, scénario EcoleSaaS. Hors connexion : phases 0 et 1
faites (spec 007). Mise en production préparée (spec 008). Suite et éléments reportés :
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
  (+ jalons, relevés), `tasks`, `today`, `reviews`, `events` (+ règles de fuseau), `budget` (+ règlement
  idempotent). À venir : `habits`.
- `src/core/` : `env.ts` (validation de l'environnement), `prisma.ts`, `errors.ts` (`AppError`,
  `parseInput`, gestionnaire central), `auth.middleware.ts` (`requireAuth`, `currentUser`),
  `dates.ts`, `ids.ts` (`idParam` : uuid invalide → 404).
- **Sessions** : table `sessions` ; le JWT porte `sid`, vérifié en base à chaque requête →
  déconnexion = révocation immédiate.
- Les **règles de calcul** (progression, report, taux du bilan, soldes, règlement, fuseaux…) vivent
  dans `shared/` (voir ci-dessous), jamais en double. Le frontend n'en écrit aucune : il affiche les
  valeurs de l'API ou du moteur local, qui exécutent le même code partagé.

### Code partagé (`shared/`) et synchronisation hors connexion (spec 007)
- `shared/src/` : règles (`*.rules.ts`), schémas zod (`*.schemas.ts`), `dates.ts`, `ids.ts`,
  `sync.ts` (version de protocole) en TypeScript pur, sans accès base ni interface. Le backend
  garde des **façades** d'un fichier (`export * from '../../../../shared/src/…'`) : les imports
  existants restent valables. Import par chemin relatif et **sans extension** dans `shared/`
  (le build Angular refuse `.ts`).
- Objectif de la spec 007 : fonctionnement complet hors connexion (le téléphone est la référence,
  le serveur est un partenaire de synchronisation). Phase 0 faite : voir `specs/007-hors-connexion`.
- **Base** : `server_version` et `updated_at` sont posés par des **déclencheurs** PostgreSQL sur toute
  table synchronisable, et toute suppression (cascades comprises) laisse une ligne dans `tombstones`.
  Ne jamais les écrire à la main. Une **nouvelle table synchronisable** doit avoir `user_id`,
  `server_version`, `updated_at` et les deux déclencheurs (copier la migration `…_synchronisation`).
- **Tests de parité** : `shared/parity/scenarios.ts` (données pures) joués contre l'API, réponses
  figées dans `shared/parity/golden/`. Le moteur local devra les rejouer à l'identique. Changement
  **volontaire** de comportement : `cd backend && UPDATE_GOLDEN=1 npx vitest run tests/parity`, puis
  relire le diff Git (les références sont la vérité du calcul, ne pas les régénérer à la légère).
- Toute création accepte un `id` fourni par l'appareil (collision → 409 uniforme, sans fuite).
- **Logique métier unique** (`shared/src/domain/`) : commandes et vues des tâches, objectifs, jalons,
  relevés, « Aujourd'hui » et bilan, écrites une fois au-dessus de l'interface `Repo` (`repo.ts`). Serveur :
  `backend/src/core/repo.prisma.ts` ; téléphone : `frontend/src/app/offline/local-repo.ts`. **Toute
  modification du comportement de ces fonctions se fait dans `shared/`**, pas dans les routes. Les deux
  implémentations de `Repo` doivent respecter les mêmes tris (voir le contrat dans `repo.ts`).
- **Synchronisation** : `backend/src/modules/sync/` (`POST /api/sync/push`, `GET /api/sync/pull`, garde de
  protocole). Arbitrage champ par champ par horloge hybride (`shared/src/hlc.ts`, colonne `field_clocks`),
  suppression prioritaire, identifiants de modification mémorisés (`sync_mutations`).
- **Téléphone** (`frontend/src/app/offline/`) : `local-db.ts` (Dexie, une base par utilisateur, schéma
  versionné : ajouter une `version(n)`, ne jamais modifier la précédente), `local-engine.ts` (mêmes chemins que
  l'API, transaction et journal d'envoi atomiques), `offline.service.ts` (porte d'entrée, `ready` = données
  complètes), `sync.service.ts` (boucle, états, réessais). `ApiService` route vers le moteur local quand `ready`,
  sinon vers HTTP. `AuthService` démarre la synchronisation ; une session expirée ne déconnecte pas tant que
  des données locales existent (bandeau « Reconnecte-toi »).
- **Rendez-vous et budget** ne sont pas encore locaux (phases 2 et 3) : ils exigent le réseau. Ajouter une
  entité synchronisable = table (`user_id`, `server_version`, `updated_at`, `field_clocks`, déclencheurs),
  `Repo`, schéma de champs dans `shared/src/sync.schemas.ts`, gestionnaire dans `sync.service.ts`, table
  Dexie, routes du moteur local, et un scénario de parité.

### Frontend
- `src/app/core/` : `api.service.ts` (**seul point d'appel HTTP**), `auth.service.ts` (session
  via Capacitor Preferences), `auth.interceptor.ts`, `auth.guard.ts`, `settings.service.ts`
  (adresse d'API modifiable dans l'app), `theme.service.ts`, `models.ts` (types + libellés FR).
- `src/app/shared/` : `task-item`, `task-actions.service` (cocher/reporter/annuler + « Annuler »),
  formulaires en modale, `add-menu.service` + `add-sheet` (feuille « Ajouter »), `state-view`
  (squelette/erreur), `page-header`, `empty-state`, `section-header`, `segmented` (contrôle en
  pilule), `progress-ring`, `progress-bar`, `category-badge`, `goal-status-chip`, `brand-mark`.
- Un dossier par espace : `today/`, `plan/`, `goals/`, `events/`, `budget/`, `review/`, `profile/`.
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
- Montants : entier en plus petite unité, jamais `float` (`users.currency`, `XOF` par défaut ; côté
  frontend, `core/money.ts` formate et lit la saisie sans flottant). Dates sans heure : colonne `DATE`,
  échange `AAAA-MM-JJ`, jamais convertie de fuseau. Instants : UTC + fuseau de l'utilisateur.
- Tout ajout de route : test de succès, de validation et d'**isolation entre deux utilisateurs**
  (`backend/tests/api/isolation.test.ts`).

## Pièges déjà rencontrés (ne pas les refaire)

- **Événements** : jour + heure locaux ↔ instants UTC uniquement via `events.rules.ts`
  (`localToUtc`, `utcToLocal`, `localDaysToUtc`) ; jamais d'arithmétique d'heure à la main (changements
  d'heure). Un lien d'événement n'accepte que `http(s)://`.
- **Budget** : tout règlement porte une `idempotencyKey` créée à l'**ouverture** du formulaire
  (rejouée telle quelle en cas de nouvel essai) ; le service verrouille la prévision (`FOR UPDATE`)
  et s'appuie sur `UNIQUE (user_id, idempotency_key)`. Le test des règlements simultanés détecte le
  retrait du verrou : ne pas l'affaiblir.
- **Frontend, caractères spéciaux** : pas d'espace insécable littéral dans le code (ESLint
  `no-irregular-whitespace`) : écrire `\u00a0` / `\u202f` ; vérifier le résultat après tout script
  de remplacement (un `sed` peut supprimer la barre oblique inverse sans erreur).
- **Build** : un style de composant au-delà de 2 ko avertit ; mutualiser dans `global.scss`
  (`ob-row`, `ob-chip`, `ob-card`…) plutôt que de relever le seuil.

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

## Production (spec 008)

- API et base sur Render : `render.yaml` (Blueprint) + `Dockerfile` à la racine (contexte = racine, compile
  `shared/`) ; migrations appliquées au démarrage. Guide : [docs/deploiement.md](docs/deploiement.md).
- `TRUST_PROXY=1` derrière Render (sinon la limitation par IP vise le relais) ; en production l'API refuse un
  `JWT_SECRET` d'exemple et `CORS_ORIGIN=*`. Origine de l'APK : `https://localhost`.
- Application Android en HTTPS par défaut ; `OBJECTIVA_DEV_HTTP=1 npx cap sync android` pour viser l'API
  du PC en HTTP. Adresse saisie normalisée par `core/api-url.ts`.
- APK : `.github/workflows/android.yml`, signé avec une clé **stable** (secrets `ANDROID_*`) : une autre clé
  forcerait une désinstallation, donc la perte des données locales. Ne jamais versionner de `.jks`.
- **Changement d'époque** (base recréée ou restaurée) : le téléphone renvoie tout son état
  (`LocalEngine.snapshot()`, `SyncService.reseed()`), vérifié avant chaque envoi via `GET /api/meta`. Une base
  neuve ne connaît plus le compte : l'inscription accepte l'`id` de l'appareil (`objectiva.accounts` mémorise
  e-mail → identifiant). Après une restauration : `npm run db:new-epoch`. Toute nouvelle entité locale doit
  entrer dans `snapshot()` (parents d'abord).

## Commandes (depuis la racine)

- `npm run db:start` / `npm run db:stop` — PostgreSQL (Docker).
- `npm run db:migrate` — applique les migrations ; `npm run db:seed` — données de démo
  (demo@objectiva.fr / objectiva123).
- `npm run api` — API sur http://localhost:3100 ; `npm run web` — interface sur http://localhost:4200.
- `npm test` — tests backend puis frontend ; `npm run lint` — types `shared/` et backend + lint frontend.
- `npm run db:new-epoch` — à lancer après toute **restauration de sauvegarde** de la base (les appareils
  détectent le changement d'époque).
- Nouvelle migration : `cd backend && npx prisma migrate dev --name <nom>` puis `npx prisma generate`.
