# 008 — Mise en production (API sur Render, APK installé à la main)

> **Statut : préparée le 2026-11-04 ; déploiement réel et installation sur téléphone à faire par l'utilisateur.**

## 1. Objectif
Utiliser Objectiva au quotidien sur son téléphone Android, avec ses données synchronisées sur un
serveur en ligne, sans Android Studio ni boutique d'applications.

## 2. Parcours utilisateur
1. Il crée l'API et la base sur Render à partir du dépôt (Blueprint), en quelques clics.
2. Il lance un workflow GitHub qui produit un APK signé et le télécharge.
3. Il l'installe sur son téléphone, colle l'adresse du serveur (ou elle est déjà inscrite), crée son compte.
4. Plus tard, il installe une nouvelle version par-dessus, sans perdre ses données.

## 3. Critères d'acceptation
- [x] CA-1 : le téléphone ne parle qu'à l'API ; la base n'est pas joignable depuis Internet ; aucun secret
  dans le dépôt ni dans l'application.
- [x] CA-2 : l'image de l'API se construit depuis la racine (avec `shared/`), applique les migrations sur une
  base vierge et démarre ; `/health` et `/api/meta` répondent.
- [x] CA-3 : derrière le relais de Render, l'adresse IP réelle est prise en compte (`TRUST_PROXY`).
- [x] CA-4 : en production, l'API refuse de démarrer avec un `JWT_SECRET` d'exemple ou `CORS_ORIGIN=*`.
- [x] CA-5 : l'application Android est en HTTPS par défaut (origine `https://localhost`, autorisée par CORS) ;
  le mode HTTP de développement exige `OBJECTIVA_DEV_HTTP=1`.
- [x] CA-6 : l'adresse saisie est complétée (`https://`, `/api`) ; l'adresse par défaut peut être inscrite
  à la construction (`API_URL`, https seulement).
- [x] CA-7 : l'APK est signé avec une clé stable fournie en secret ; sans elle le workflow s'arrête (un APK
  signé autrement ne s'installerait pas par-dessus et forcerait une désinstallation, donc une perte des
  données locales) ; le `versionCode` augmente à chaque construction.
- [x] CA-8 : un guide pas à pas en français ([docs/deploiement.md](../../docs/deploiement.md)).

## 4. Hors périmètre
- Publication sur le Play Store, iOS, application web en ligne (le web hors connexion exige un service worker).
- (Fait ensuite, voir spec 007) Reconstruction du serveur par le téléphone après changement d'époque.
- Supervision, alertes, nom de domaine personnalisé.

## 5. Plan technique
- Serveur : `TRUST_PROXY` (0 à 5, défaut 0) → `app.set('trust proxy')` ; garde-fous de production dans `env.ts`.
- `Dockerfile` (deux étapes, Node 24, `npm ci` de `shared/` et `backend/`, `prisma generate`, `tsc`),
  démarrage `prisma migrate deploy && node dist/backend/src/server.js` ; `.dockerignore`.
- `render.yaml` : service web Docker gratuit (Francfort, `/health`), base PostgreSQL 16 gratuite, accès
  interne seulement, `JWT_SECRET` généré, `CORS_ORIGIN=https://localhost,capacitor://localhost`.
- Application : `capacitor.config.ts` (https par défaut), `core/api-url.ts` (`normalizeApiUrl`) utilisé par
  `SettingsService`, textes d'aide de la connexion et du profil, `versionCode` lu dans les propriétés Gradle.
- `.github/workflows/android.yml` + `scripts/set-default-api-url.mjs` ; signature par `zipalign` + `apksigner`.
- Tests : `api-url.spec.ts` ; image vérifiée à la main contre une base vierge.

## 6. Tâches
- [x] T1 Serveur derrière relais et garde-fous de production
- [x] T2 Image Docker et Blueprint Render
- [x] T3 Application en HTTPS, adresse complétée
- [x] T4 Workflow APK signé, clé de signature créée hors dépôt
- [x] T5 Guide et documentation
- [ ] T6 Déploiement réel sur Render et installation sur le téléphone (utilisateur)

## 7. Revue
- Vérifications exécutées :
  - `docker build` : image construite ; lancée contre une base PostgreSQL vierge : 7 migrations appliquées,
    `/health` ok, `/api/meta` ok, inscription ok avec `X-Forwarded-For`, CORS : `https://localhost` accepté,
    origine inconnue refusée. Avec le `JWT_SECRET` d'exemple : démarrage refusé.
  - Backend `npx vitest run` : 178/178 ; frontend `ng test` : 46/46 (dont 4 pour `normalizeApiUrl`),
    `ng lint` et Prettier propres, `ng build` ok, `cap sync android` dans les deux modes (https / http).
  - Clé de signature : ouverture vérifiée avec `keytool -list`.
- Écarts restants :
  - Le workflow Android n'a pas encore tourné (il faut pousser la branche et créer les secrets) : la
    construction Gradle et la signature ne sont vérifiées qu'à la première exécution.
  - Base gratuite : expire au 30e jour (passer en payant avant) ; pas de sauvegarde automatique.
  - Base recréée ou restaurée : le téléphone reconstruit le serveur (spec 007, changement d'époque), mais les
    rendez-vous et le budget, pas encore locaux, ne sont pas renvoyés.
  - Rendez-vous et budget exigent encore le réseau (spec 007, phases 2 et 3) : avec une API endormie, ils
    attendent son réveil (environ une minute).
  - Sessions de 30 jours côté serveur : au-delà, « Reconnecte-toi » (données intactes).
