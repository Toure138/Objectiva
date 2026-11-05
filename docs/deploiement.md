# Mise en production : API sur Render, application installée à la main sur Android

```
Téléphone (application + toutes ses données)  ──HTTPS──▶  API sur Render  ──réseau interne──▶  Base PostgreSQL sur Render
```

Le téléphone ne parle **jamais** directement à la base : il passe par l'API, qui vérifie les comptes
et isole les utilisateurs. La base n'est même pas joignable depuis Internet (`ipAllowList: []`).
Grâce au mode hors connexion (spec 007), l'application marche aussi quand l'API dort ou est coupée :
elle se synchronise à son retour.

## 1. Déployer l'API et la base (une fois, environ 10 minutes)

Prérequis : un compte [Render](https://render.com), et la branche à déployer poussée sur GitHub.

1. Render > **New** > **Blueprint** > connecte ton compte GitHub > choisis le dépôt `Objectiva`
   et la branche.
2. Render lit [render.yaml](../render.yaml) et propose deux éléments : `objectiva-api` (service web)
   et `objectiva-db` (base). Vérifie le coût affiché, puis **Apply**.
3. Attends la fin de la construction (5 minutes environ la première fois). Au démarrage, l'API applique
   seule les migrations de la base.
4. Ouvre `https://<nom-du-service>.onrender.com/health` : la page doit afficher `"status":"ok"`.
   Note cette adresse (le nom peut avoir un suffixe si `objectiva-api` est déjà pris).

Rien de secret n'est dans le dépôt : `JWT_SECRET` est généré par Render, et l'adresse de la base est
fournie par Render à l'API.

### Ce qu'il faut savoir sur l'offre gratuite

- **La base gratuite expire 30 jours après sa création**, puis est supprimée avec ses données après
  14 jours de grâce. **Avant le 30e jour**, passe-la sur une offre payante : tableau de bord >
  `objectiva-db` > changer d'offre. Les données sont conservées. Note la date d'échéance dès aujourd'hui.
- Le service web gratuit s'endort après 15 minutes sans requête et met environ une minute à se réveiller.
  Sans gêne pour toi : le téléphone travaille en local, la pastille affiche « Hors ligne » puis la
  synchronisation reprend.
- Aucune sauvegarde automatique sur l'offre gratuite.

### Si la base est remplacée ou restaurée

Le téléphone est la référence : il reconstruit le serveur tout seul.

- **Base neuve** (base gratuite expirée puis recréée, autre hébergeur) : le serveur ne connaît plus ton
  compte. L'application affiche « Ta session a expiré » ; touche le bandeau, choisis **Inscription** et
  recrée ton compte avec **le même e-mail** (le mot de passe peut changer). Le compte reprend le même
  identifiant et le téléphone renvoie aussitôt toutes ses données. Sur un second téléphone, il suffit
  ensuite de se reconnecter : ses propres données sont fusionnées.
- **Sauvegarde restaurée** : lance `npm run db:new-epoch` contre cette base. À la synchronisation suivante,
  chaque téléphone renvoie son état ; ce que le serveur avait déjà est fusionné champ par champ (la
  modification la plus récente l'emporte), rien n'est écrasé à l'aveugle.
- Limites : les **rendez-vous et le budget** ne sont pas encore sur le téléphone (spec 007, phases 2 et 3) :
  ils ne sont pas renvoyés et ceux d'une base perdue sont perdus. Après une restauration, une donnée
  supprimée après la date de la sauvegarde peut réapparaître (à supprimer de nouveau).

Passer la base gratuite en payant avant le 30e jour reste le plus simple : rien à reconstruire.

## 2. Construire l'APK (une fois, puis à chaque mise à jour)

L'APK est compilé et signé par GitHub Actions ([.github/workflows/android.yml](../.github/workflows/android.yml)) :
pas besoin d'Android Studio.

### Mise en place (une fois)

1. **Clé de signature.** Elle doit rester la même pour toujours : Android refuse d'installer une mise à
   jour signée par une autre clé, et désinstaller l'application **efface ses données locales**. Elle a été
   créée dans un dossier `Objectiva-cle-android` (fichier `A-LIRE.txt` à l'intérieur) : déplace ce dossier
   en lieu sûr et fais-en une copie (clé USB, gestionnaire de mots de passe). Jamais dans le dépôt.
   Pour en créer une autre (seulement avant la première installation) :
   `keytool -genkeypair -keystore objectiva-release.jks -storetype PKCS12 -alias objectiva -keyalg RSA -keysize 4096 -validity 10000`.
2. **Secrets GitHub** : dépôt > Settings > Secrets and variables > Actions > **New repository secret**,
   les quatre valeurs de `A-LIRE.txt` : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
3. **Adresse du serveur** (facultatif, évite de la saisir sur le téléphone) : même page, onglet
   **Variables** > `API_URL` = `https://<nom-du-service>.onrender.com`.

### Construire

GitHub > **Actions** > **APK Android** > **Run workflow** (ou pousser une étiquette `v1.0.3`). Après
environ 10 minutes, télécharge **Objectiva-apk** en bas de la page de l'exécution (un zip contenant
`Objectiva.apk`, gardé 90 jours).

### Installer sur le téléphone

1. Copie `Objectiva.apk` sur le téléphone (câble, Drive, e-mail à toi-même) et ouvre-le.
2. Android demande d'autoriser l'installation depuis cette source : accepte pour l'application utilisée
   (Fichiers, Chrome…). Play Protect peut avertir d'une application inconnue : « Installer quand même ».
3. Ouvre Objectiva. Si `API_URL` n'était pas définie : écran de connexion > « Adresse du serveur » >
   colle `https://<nom-du-service>.onrender.com` (`/api` est ajouté tout seul).
4. Crée ton compte. Au premier lancement, l'API peut mettre une minute à se réveiller.

### Mettre à jour

**Toujours le serveur d'abord** (push sur `main` : Render redéploie et applique les migrations), **puis**
l'APK : une nouvelle application peut envoyer des champs qu'un ancien serveur refuserait.

Relance le workflow et installe le nouvel APK **par-dessus** l'ancien (jamais de désinstallation) :
le numéro de version augmente à chaque exécution et la clé est la même, donc les données restent.

## 3. Sauvegardes

- Offre payante : Render fait des sauvegardes de la base (durée selon l'offre, à vérifier sur
  [render.com/pricing](https://render.com/pricing)).
- Copie manuelle depuis ton PC : tableau de bord > `objectiva-db` > **Networking** : ajoute ton adresse IP,
  copie l'**External Database URL**, puis
  `docker run --rm postgres:16 pg_dump "<External Database URL>" -Fc > objectiva-AAAA-MM-JJ.dump`.
  Retire ensuite ton adresse IP de la liste.
- Après une **restauration**, lancer `npm run db:new-epoch` contre cette base : les téléphones renvoient
  alors leur état (voir « Si la base est remplacée ou restaurée »).

## 4. Développement : application sur le téléphone contre l'API du PC

L'application de production est en HTTPS et refuse une API en HTTP. Pour tester contre l'API du PC
sur le même Wi-Fi : `cd frontend && OBJECTIVA_DEV_HTTP=1 npx cap sync android` (sous PowerShell :
`$env:OBJECTIVA_DEV_HTTP='1'; npx cap sync android`), puis adresse `192.168.x.x:3100`, et ajouter
`http://localhost` à `CORS_ORIGIN` dans `backend/.env`. Ne jamais construire l'APK de production ainsi.

## 5. Configuration de l'API en production

| Variable | Valeur sur Render | Rôle |
|---|---|---|
| `DATABASE_URL` | fournie par Render (adresse interne) | base |
| `JWT_SECRET` | générée par Render | signature des sessions ; refusée si elle ressemble à un exemple |
| `TRUST_PROXY` | `1` | une couche de relais (Render) : sans cela, la limitation par adresse IP bloquerait tout le monde à la fois |
| `CORS_ORIGIN` | `https://localhost,capacitor://localhost` | application Android et iOS ; `*` est refusé |
| `SESSION_DAYS` | `30` | durée d'une session |
| `PORT` | fourni par Render | — |

L'image ([Dockerfile](../Dockerfile)) se teste en local :
`docker build -t objectiva-api .` puis
`docker run -p 3199:3100 -e DATABASE_URL=… -e JWT_SECRET=… -e TRUST_PROXY=1 objectiva-api`.
