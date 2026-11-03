# Objectiva

Application personnelle de planification et de suivi, en français. Tu définis ce que tu veux
accomplir, tu le découpes en jalons, tu planifies tes actions jour par jour, puis tu coches ce
que tu as réellement fait et tu fais le bilan.

> **État actuel : étape 1 « Socle objectifs ».** Ce qui marche, ce qui arrive ensuite :
> voir [Feuille de route](#feuille-de-route).

## Sommaire

1. [Ce dont tu as besoin](#1-ce-dont-tu-as-besoin)
2. [Première installation](#2-première-installation)
3. [Lancer l'application chaque jour](#3-lancer-lapplication-chaque-jour)
4. [Essayer l'application](#4-essayer-lapplication)
5. [Ouvrir l'application sur un téléphone Android](#5-ouvrir-lapplication-sur-un-téléphone-android)
6. [iOS (iPhone)](#6-ios-iphone)
7. [Tests et vérifications](#7-tests-et-vérifications)
8. [Organisation du projet](#8-organisation-du-projet)
9. [Problèmes fréquents](#9-problèmes-fréquents)
10. [Feuille de route](#feuille-de-route)

---

## 1. Ce dont tu as besoin

| Outil | Version | Pour quoi faire | Vérifier |
|---|---|---|---|
| **Node.js** | 22 ou plus (26 conseillé, voir `.nvmrc`) | faire tourner l'API et Angular | `node --version` |
| **Docker Desktop** | récent | faire tourner PostgreSQL sans l'installer | `docker --version` |
| **Git** | récent | récupérer et versionner le code | `git --version` |
| Android Studio | récent (avec JDK 21) | seulement pour installer l'app sur Android | — |

Sous Windows 11, Docker Desktop doit être **démarré** (icône de baleine dans la barre des tâches)
avant toute commande `docker`.

**PowerShell ou WSL ?** Les deux marchent. Les commandes `npm` et `docker` sont identiques dans
les deux. Seules quelques commandes diffèrent (copier un fichier, trouver son adresse IP) : elles
sont données pour chacun.

## 2. Première installation

Toutes les commandes se lancent **depuis le dossier `Objectiva`** (la racine du projet), sauf
mention contraire.

**Étape 1 — se placer dans le dossier**

PowerShell :
```powershell
cd "$HOME\Desktop\Objectiva"
```
WSL Ubuntu :
```bash
cd /mnt/c/Users/<ton-nom>/Desktop/Objectiva
```

**Étape 2 — installer les dépendances** (quelques minutes la première fois)
```bash
npm run install:all
```

**Étape 3 — créer le fichier de configuration de l'API**

PowerShell :
```powershell
Copy-Item .env.example backend\.env
```
WSL :
```bash
cp .env.example backend/.env
```

Puis ouvre `backend/.env` et remplace `JWT_SECRET` par une valeur aléatoire. Pour en générer
une :
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Étape 4 — démarrer la base de données**
```bash
npm run db:start
```
La première fois, Docker télécharge PostgreSQL et crée deux bases : `objectiva` (tes données)
et `objectiva_test` (réservée aux tests automatiques).

**Étape 5 — créer les tables, puis les données de démonstration**
```bash
npm run db:migrate
npm run db:seed
```
Le compte de démonstration est **demo@objectiva.fr / objectiva123** (données fictives autour de
l'anglais, du sport, de la lecture et d'un projet professionnel). Relancer `db:seed` remet ce
compte à zéro ; les autres comptes ne sont pas touchés.

## 3. Lancer l'application chaque jour

Il faut **deux terminaux**, ouverts tous les deux à la racine du projet.

Terminal 1 — l'API :
```bash
npm run db:start
npm run api
```
Attends le message `API Objectiva prête sur http://localhost:3100`.

Terminal 2 — l'interface :
```bash
npm run web
```
Puis ouvre **http://localhost:4200** dans ton navigateur. Pour simuler un téléphone : touche
`F12`, puis l'icône « téléphone » (mode appareil).

Pour arrêter : `Ctrl + C` dans chaque terminal, puis `npm run db:stop` si tu veux arrêter la base.

## 4. Essayer l'application

Ce que tu peux faire dès maintenant :

1. **Créer un compte** (onglet « Inscription ») : un court parcours de bienvenue te guide.
2. **Créer un objectif**, par exemple « Présenter EcoleSaaS à trois établissements ».
3. Dans la fiche de l'objectif, **ajouter un jalon** (« Réaliser la première démonstration »),
   puis **Planifier** une action pour ce jalon.
4. Dans **Aujourd'hui** : cocher la tâche, puis toucher « Annuler » dans le message si c'était
   une erreur. Le bouton `…` d'une tâche permet de la **reporter** (demain, une date, « À
   planifier ») ou de l'**annuler**.
5. Dans **Planifier** : les 7 prochains jours, et la liste « À planifier » (tâches sans date).
6. Dans **Bilan** : jour, semaine ou mois. Le taux affiche toujours « X sur Y » ; les tâches
   annulées sont listées à part et ne comptent pas.
7. Fermer puis rouvrir le navigateur : tu restes connecté et tout est enregistré.
8. Dans le **profil** (icône en haut à droite) : thème clair/sombre, adresse du serveur,
   déconnexion.

L'API est documentée dans [docs/api.md](docs/api.md).

## 5. Ouvrir l'application sur un téléphone Android

Sur le téléphone, `localhost` désigne **le téléphone lui-même**, pas ton PC. Il faut donc
indiquer à l'application l'adresse IP de ton PC. Le téléphone et le PC doivent être sur **le même
réseau Wi-Fi**.

**1. Trouver l'adresse IP du PC**

PowerShell : `ipconfig` → ligne « Adresse IPv4 » de ta carte Wi-Fi (ex. `192.168.1.20`).
WSL : utilise aussi `ipconfig` côté Windows (l'adresse de WSL n'est pas joignable depuis le
téléphone par défaut).

**2. Autoriser le port de l'API dans le pare-feu Windows** (PowerShell **en administrateur**,
une seule fois) :
```powershell
New-NetFirewallRule -DisplayName "Objectiva API" -Direction Inbound -Protocol TCP -LocalPort 3100 -Action Allow -Profile Private
```

### Option A — dans le navigateur du téléphone (le plus rapide)

1. Dans `backend/.env`, ajoute l'adresse du PC à `CORS_ORIGIN`, par exemple :
   `CORS_ORIGIN="http://localhost:4200,http://192.168.1.20:4200,http://localhost,capacitor://localhost"`,
   puis relance `npm run api`.
2. Autorise aussi le port 4200 dans le pare-feu (même commande avec `-LocalPort 4200`).
3. Lance l'interface avec `npm run web:phone` au lieu de `npm run web`.
4. Sur le téléphone, ouvre `http://192.168.1.20:4200`.
5. Sur l'écran de connexion, déplie **« Adresse du serveur »** et saisis
   `http://192.168.1.20:3100/api`.

### Option B — installer l'application Android (Capacitor)

Prérequis : **Android Studio** installé, un téléphone en **mode développeur** avec le débogage
USB activé (ou un émulateur).

Depuis le dossier `frontend` :
```bash
cd frontend
npx ng build
npx cap add android      # une seule fois : crée le dossier android/
npx cap sync android     # après chaque modification du code
npx cap open android     # ouvre Android Studio
```
Dans Android Studio, choisis ton téléphone et clique sur ▶ (Run). Dans l'application, saisis
l'adresse `http://<IP-du-PC>:3100/api` dans « Adresse du serveur ».

L'application Android parle à l'API en HTTP en développement (`capacitor.config.ts`,
`cleartext: true`). Pour une vraie mise en ligne, il faudra une API en **HTTPS**.

## 6. iOS (iPhone)

Le code est prêt pour iOS, mais la compilation demande obligatoirement :
- un **Mac** avec **Xcode** à jour et CocoaPods ;
- un compte **Apple Developer** (gratuit pour tester sur ton propre iPhone, payant pour publier) ;
- une API en **HTTPS** pour un usage réel (iOS bloque le HTTP par défaut).

Sur le Mac, depuis `frontend` : `npx ng build`, `npx cap add ios`, `npx cap sync ios`,
`npx cap open ios`, puis ▶ dans Xcode.

## 7. Tests et vérifications

```bash
npm test        # tests de l'API (base objectiva_test) puis tests de l'interface
npm run lint    # vérification des types (API) et du style (interface)
```
La base doit être démarrée (`npm run db:start`) pour les tests de l'API. Ils remettent à zéro la
base `objectiva_test` uniquement, jamais la base `objectiva`.

Ce qui est testé : règles de calcul (progression, report, bilan, dates), authentification et
limitation des tentatives, parcours objectif → jalon → tâche → bilan, et **isolation entre deux
utilisateurs** (impossible de lire, modifier ou rattacher les données d'un autre).

## 8. Organisation du projet

```
Objectiva/
├── backend/            API Express + TypeScript + Prisma
│   ├── prisma/         schéma, migrations versionnées, données de démonstration
│   ├── src/core/       configuration, base, erreurs, sessions, dates
│   ├── src/modules/    un dossier par domaine : auth, goals, tasks, today, reviews
│   └── tests/          tests unitaires (règles) et tests d'API
├── frontend/           Angular + Ionic + Capacitor
│   └── src/app/        core/ (API, session), shared/, et un dossier par espace
├── docker/             PostgreSQL pour le développement
├── docs/               API, versions, feuille de route
├── specs/              une fiche par fonctionnalité (méthode spec-driven)
├── .claude/            skills et commandes pour Claude Code
└── CLAUDE.md           règles du projet pour Claude Code
```

Choix techniques principaux (détails dans [docs/versions.md](docs/versions.md) et
[CLAUDE.md](CLAUDE.md)) :
- **Toutes les règles de calcul sont côté serveur** ; l'interface affiche ce que l'API renvoie.
- **Sessions révocables** : le jeton porte un identifiant de session vérifié en base, donc la
  déconnexion est immédiate. Le jeton est stocké avec Capacitor Preferences (stockage natif sur
  téléphone, `localStorage` sur le web).
- **Dates sans heure** stockées en `DATE` et échangées en `AAAA-MM-JJ` : « vendredi » reste
  vendredi quel que soit le fuseau. Les instants sont en UTC.
- **Une ressource d'un autre utilisateur répond 404**, comme une ressource inexistante.
- Port **3100** pour l'API, pour ne pas entrer en conflit avec d'autres projets sur le port 3000.

## 9. Problèmes fréquents

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Impossible de joindre le serveur` | API arrêtée ou mauvaise adresse | Lance `npm run api` ; vérifie l'adresse dans le profil |
| `Le port 3100 est déjà utilisé` | une autre application occupe ce port | Change `PORT` dans `backend/.env` et l'adresse dans l'application |
| `Configuration invalide : JWT_SECRET…` | `backend/.env` absent ou incomplet | Refais l'étape 3 de l'installation |
| `Can't reach database server` | Docker Desktop ou la base arrêtés | Démarre Docker Desktop puis `npm run db:start` |
| Le téléphone n'arrive pas à se connecter | pare-feu, autre Wi-Fi, ou `localhost` utilisé | Voir la section 5 |

## Feuille de route

Le détail est dans [docs/feuille-de-route.md](docs/feuille-de-route.md).

| Étape | Contenu | État |
|---|---|---|
| 1. Socle objectifs | Comptes, objectifs, jalons, tâches, cocher/reporter/annuler, Aujourd'hui, bilan | **fait** |
| 2. Parcours transversal | Réunions et rencontres, tâche de préparation, frais prévus, paiement, budget mensuel | à faire |
| 3. Planification complète | Budgets annuel et quotidien, agenda, conflits, charge disponible, habitudes, bilans enrichis | à faire |
| 4. Fonctions complémentaires | Récurrences, rappels, transferts, épargne, paiements partiels, export, hors connexion, paramètres | à faire |
