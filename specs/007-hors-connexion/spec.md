# 007 — Fonctionnement complet hors connexion (offline-first)

> **Statut : décisions du § 6 validées le 2026-11-04 ; phases 0 et 1 terminées, phase 2 (événements) à venir.**
> Cette fiche change l'architecture de l'application (le téléphone devient la référence des données).

## 1. Objectif
Une fois connectée, une personne utilise **toute** l'application sur son téléphone, sans réseau,
sans serveur ni base de données disponibles, aussi longtemps qu'elle le souhaite (y compris six
mois). Tout ce qu'elle fait est enregistré sur le téléphone. Le jour où la connexion revient, la
synchronisation se fait seule, sans perte ni doublon.

Ce n'est **pas** un cache de réponses : un cache ne permet pas d'écrire, et nos vues (Aujourd'hui,
bilan, solde, progression) sont calculées. Il faut donc une base locale et le calcul sur le téléphone.

## 2. Principes
1. **Le téléphone est la référence pour l'interface.** L'écran lit et écrit toujours en local,
   instantanément. Le réseau n'est jamais sur le chemin d'une action.
2. **Le serveur est un partenaire de synchronisation** : sauvegarde, second appareil, restauration.
3. **Les mêmes règles de calcul tournent des deux côtés** (progression, statut d'une prévision,
   solde, fuseaux, bilan…). Elles sont extraites dans un module partagé `shared/` en TypeScript pur,
   avec les mêmes schémas de validation. La règle actuelle « le frontend ne recalcule pas » devient :
   « le frontend utilise le module partagé, jamais une copie ».
4. **Chaque écriture est rejouable sans effet double** (identifiant et clé générés sur l'appareil).
5. **Rien n'est jamais perdu en silence** : une modification refusée par le serveur reste visible et
   corrigeable, elle n'est pas jetée.

## 3. Ce que cela change

### Sur le téléphone
- Base locale **IndexedDB** (Dexie), qui fonctionne dans le navigateur et dans la WebView Android ;
  stockage persistant demandé (`navigator.storage.persist()`).
- **Moteur local** : implémente les mêmes opérations que `ApiService` (listes, vue du jour, bilan,
  vue du mois du budget, règlement…) au-dessus de la base locale, en s'appuyant sur `shared/`. Les
  écrans ne changent presque pas : `ApiService` devient une façade vers le moteur local.
- **Journal des modifications** (outbox) : chaque écriture est enregistrée avec un identifiant de
  mutation, un horodatage hybride et le jeu de champs modifiés.
- **Service de synchronisation** : au lancement, au retour du réseau, après une écriture et
  périodiquement app ouverte ; réessais avec délai croissant ; jamais bloquant.
- **Indicateur d'état** : « Synchronisé », « 3 modifications en attente », « Hors connexion — dernière
  synchronisation le 12 mai », « Reconnecte-toi pour synchroniser ».

### Sur le serveur
- Les identifiants (UUID) sont **générés par l'appareil** et acceptés par l'API ; un identifiant qui
  appartient à un autre utilisateur est rejeté sans rien révéler (clé primaire par utilisateur).
- Chaque entité synchronisable porte `updated_at`, un numéro de version serveur croissant par
  utilisateur, et une suppression logique (`deleted_at`, « pierre tombale »).
- Deux routes : `POST /sync/push` (lot de mutations idempotentes) et `GET /sync/pull?cursor=`
  (changements depuis le curseur, par pages). Les routes REST actuelles restent (autres clients,
  tests, outils) ; les règles métier sont appelées par les deux chemins.
- **Version de protocole** dans chaque requête de synchronisation et **époque du serveur** (voir § 4).

## 4. Cas limites traités
| Situation | Comportement attendu |
|---|---|
| **Six mois sans réseau** | L'app fonctionne normalement ; la base locale a tout. Au retour du réseau : synchronisation par lots, sans perte. |
| **Session serveur expirée** pendant l'absence | Les données locales ne sont **jamais effacées**. L'app reste utilisable ; la synchronisation se met en pause avec « Reconnecte-toi ». Après reconnexion **au même compte**, elle reprend. Un autre compte sur le même appareil est refusé tant que des modifications ne sont pas synchronisées. La session passe à 12 mois glissants (renouvelée à chaque synchro), toujours révocable côté serveur. |
| **Serveur ou base arrêtés** | Pour l'app, c'est équivalent au mode avion : aucune erreur bloquante, réessais automatiques, indicateur correct. |
| **Réponse perdue en plein envoi** | Le lot est renvoyé tel quel : les identifiants de mutation et les clés d'idempotence (déjà utilisées pour les règlements) évitent tout doublon. |
| **Deux appareils modifient la même donnée** | Par champ, la dernière modification (horloge hybride) l'emporte ; les deux appareils convergent vers le même état. Les écritures d'argent sont des ajouts : jamais écrasées, les statuts sont recalculés (un éventuel dépassement est affiché, rien n'est perdu). |
| **Suppression sur un appareil, appareil resté hors ligne six mois** | Les pierres tombales sont conservées 24 mois ; au-delà, l'appareil fait une **resynchronisation complète** qui réconcilie ses modifications non envoyées. Une donnée supprimée ne ressuscite pas. |
| **Ancienne version de l'app après six mois** | Le serveur accepte le protocole N-1 pendant au moins 12 mois. Sinon : réponse `426` « mets l'application à jour », **sans toucher** au journal local. Les migrations de la base locale sont versionnées et testées sur d'anciennes bases. |
| **Serveur restauré depuis une sauvegarde** (données plus anciennes) | L'**époque** du serveur change ; l'appareil le détecte et, après confirmation, renvoie son état complet : les données du téléphone reconstruisent le serveur. |
| **Horloge du téléphone fausse** | L'ordre des conflits repose sur une horloge hybride ; l'écart avec l'heure du serveur est mesuré à chaque synchro et signalé s'il est important. |
| **Stockage refusé ou plein** | Avertissement clair ; l'app ne prétend pas être hors connexion sûre. |
| **Premier lancement, inscription, changement de mot de passe, suppression de compte** | Nécessitent le réseau (une seule fois pour le premier). |

## 5. Critères d'acceptation
- [ ] CA-1 : après connexion et une première synchronisation, **réseau coupé et API arrêtée**, toutes
      les actions des écrans fonctionnent : tâches (créer, cocher, reporter, annuler), objectifs,
      jalons, relevés, événements, prévisions, règlements, transactions, enveloppes ; Aujourd'hui,
      Planifier, Bilan et Budget se calculent sur le téléphone.
- [ ] CA-2 : **tests de parité** : pour un même jeu d'écritures, le moteur local et l'API renvoient
      les mêmes résultats (vue du jour, objectifs, bilan, événements, vue du mois du budget).
- [ ] CA-3 : **six mois** : avec une horloge avancée de 200 jours, session expirée, l'app fonctionne
      hors ligne, ne perd rien, et se synchronise sans perte ni doublon après reconnexion.
- [ ] CA-4 : une coupure au milieu d'un envoi, puis la reprise, ne crée aucune écriture en double
      (règlement, tâche, événement).
- [ ] CA-5 : deux appareils modifiant le même champ hors ligne convergent vers le même état, selon la
      règle documentée ; aucune écriture d'argent n'est perdue.
- [ ] CA-6 : une suppression faite ailleurs n'est pas annulée par un appareil resté absent ; au-delà
      de la durée de conservation, la resynchronisation complète est correcte.
- [ ] CA-7 : sécurité : un utilisateur ne peut pousser ni tirer que ses propres données ; un identifiant
      appartenant à autrui est rejeté sans fuite d'information ; le serveur revalide chaque mutation
      avec les mêmes schémas ; aucun montant ni contenu dans les journaux.
- [ ] CA-8 : un protocole trop ancien renvoie `426` ; le journal local reste intact.
- [ ] CA-9 : serveur arrêté ou lent : jamais d'écran d'erreur bloquant, réessais, indicateur exact.
- [ ] CA-10 : serveur restauré (époque différente) : réamorçage depuis l'appareil, vérifié.
- [ ] CA-11 : stockage persistant demandé ; migrations locales testées depuis chaque version
      précédente du schéma.
- [ ] CA-12 : indicateur d'état visible (en ligne/hors ligne, modifications en attente, dernière
      synchronisation, reconnexion nécessaire).
- [ ] CA-13 : aucune régression : tests backend, frontend et e2e existants, adaptés si besoin.

## 6. Décisions à valider (avec ma recommandation)
1. **Approche** : synchronisation **maison** au-dessus de notre API et de nos règles, plutôt qu'une
   bibliothèque de synchronisation (PowerSync, RxDB, ElectricSQL). *Recommandé* : nos règles
   métier (règlement idempotent, statuts, fuseaux) existent déjà et doivent rester la référence ;
   une bibliothèque n'en dispenserait pas côté téléphone et ajouterait une dépendance serveur.
2. **Plusieurs appareils par compte** : pris en charge dès la première version (téléphone + navigateur).
   *Recommandé* : oui, le surcoût est faible une fois le protocole en place.
3. **Conflit sur un même champ** : la dernière modification gagne ; une suppression l'emporte.
   *Recommandé* : simple, prévisible, adapté à des données personnelles. Alternative (écran de
   résolution manuelle) écartée pour la première version.
4. **Durée de session** : 12 mois glissants, révocable. *Recommandé* ; plus court = reconnexion
   fréquente, mais sans perte de données dans tous les cas.
5. **Verrouillage local (code ou empreinte)** et **chiffrement de la base du téléphone** : hors de
   cette première version (le chiffrement du stockage Android protège déjà un téléphone verrouillé).
   *À planifier* avant une publication publique : des données financières sont stockées localement.
6. **Synchronisation app fermée** (en arrière-plan) : hors première version ; la synchronisation a lieu
   à l'ouverture, au retour du réseau et périodiquement app ouverte.

## 7. Plan par phases (chacune livrée, testée et vérifiée avant la suivante)
- **P0 Fondations** : module `shared/` (règles + schémas), identifiants générés par l'appareil,
  colonnes `updated_at` / version / `deleted_at`, version de protocole, tests de parité en place.
- **P1 Noyau** : base locale, moteur local et synchronisation pour tâches, objectifs, jalons,
  relevés ; Aujourd'hui, Planifier, Bilan ; indicateur d'état ; routes `/sync`.
- **P2 Événements** (avec règles de fuseau partagées).
- **P3 Budget** (règlement, transactions, enveloppes, vue du mois).
- **P4 Robustesse** : session expirée, six mois (horloge simulée), conflits, pierres tombales, versions,
  époque du serveur, coupures simulées (Playwright hors ligne), migrations locales.

## 8. Hors périmètre
Synchronisation en arrière-plan app fermée ; chiffrement applicatif de la base locale ; résolution
manuelle des conflits ; partage de données entre utilisateurs ; plusieurs comptes sur un même appareil.

## 9. Risques
- **Ampleur** : c'est la plus grosse évolution du projet (réécriture de la couche de données du
  frontend, nouveau protocole serveur). Raison du découpage en phases.
- **Divergence entre le calcul local et le calcul serveur** : atténuée par le code partagé et les
  tests de parité (CA-2), qui doivent rester obligatoires.
- **Stockage de la WebView** : peut être purgé dans des cas extrêmes (stockage saturé). La demande de
  stockage persistant et un export manuel en limitent l'impact ; à vérifier sur un vrai téléphone.
- **Migration des données existantes** (ajout des versions et des pierres tombales) : migration
  réversible et testée sur une copie de la base de démonstration.

## 10. Tâches
- [x] T0 Valider les décisions du § 6
- [x] T1 P0 Fondations
- [x] T2 P1 Noyau
- [ ] T3 P2 Événements
- [ ] T4 P3 Budget
- [ ] T5 P4 Robustesse
- [ ] T6 Mettre à jour CLAUDE.md et les skills (règle de calcul partagé)

## 11. Revue
### Phase 1 — Noyau (terminée)
- Livré :
  - **Logique métier unique** (`shared/src/domain/`) : commandes et vues des tâches, objectifs, jalons,
    relevés, « Aujourd'hui » et bilan, écrites une seule fois au-dessus d'une interface de stockage
    (`Repo`). Le serveur la branche sur Prisma (`backend/src/core/repo.prisma.ts`), le téléphone sur
    IndexedDB (`frontend/src/app/offline/local-repo.ts`). Les anciens services du serveur ont disparu.
  - **Protocole** : `POST /api/sync/push` (modifications idempotentes, arbitrage **champ par champ** par
    horloge hybride, suppression prioritaire, références d'objectif détachées si le parent a disparu,
    refus uniforme pour les données d'autrui) et `GET /api/sync/pull` (changements par pages, curseur
    sûr même quand plusieurs tables sont tronquées, pierres tombales). Garde de version (426).
  - **Téléphone** : base IndexedDB par utilisateur (Dexie), moteur local qui répond aux mêmes chemins
    que l'API, journal d'envoi atomique avec chaque écriture, horloge hybride, application des changements
    reçus, service de synchronisation (lots de 200, réessais 5 s → 5 min, retour du réseau, retour au
    premier plan, toutes les 60 s) et pastille d'état (« Hors ligne · 2 », « Reconnecte-toi », « Mise à
    jour », « Synchro en pause »). Un compte neuf ou un nouvel appareil télécharge tout une fois, puis
    fonctionne sans réseau.
  - **Session expirée** : si des données locales existent, l'utilisateur n'est pas déconnecté (sinon il
    perdrait l'accès à ses propres données) : bandeau « Reconnecte-toi pour synchroniser », journal et
    données intacts.
- Vérifications exécutées :
  - Backend `npx vitest run` : 178/178 (dont 24 tests du protocole, 3 de l'horloge, parité sur 5
    scénarios) ; frontend `ng test` : 42/42 dont **3 scénarios de parité rejoués sur le moteur local**
    (taches-et-bilan, progression-mesuree, ordre-des-listes) à l'identique des références du serveur, et
    17 tests de synchronisation (messages valides pour les schémas du serveur, horloge croissante même si
    l'heure recule, arbitrage champ par champ, suppression non envoyée jamais ressuscitée, lots de 200,
    coupure en plein envoi, 401, 426, serveur restauré, une seule synchronisation à la fois).
  - **e2e réel** (`frontend/e2e/hors-connexion.spec.ts`, navigateur 360×740, vraie API) : inscription,
    données téléchargées, **serveur coupé**, création de tâches et d'un objectif, cochage, bilan,
    « Hors ligne », **redémarrage de l'application serveur toujours coupé** : tout est là, retour du
    serveur, synchronisation, le serveur contient tout, un **second appareil** retrouve tout.
  - **Contrôles par mutation** : serveur (plafond de pagination supprimé, arbitrage par horloge supprimé)
    et téléphone (tri inversé, « sans date en premier », serveur qui écrase toujours le local, suppression
    locale ressuscitée) : tous détectés. Un trou de couverture sur les tris a été comblé par le scénario
    `ordre-des-listes`.
- Écarts restants (phase 1) :
  - **Rendez-vous et budget ne sont pas encore sur le téléphone** (phases 2 et 3) : ils exigent le réseau.
    « Aujourd'hui » et le bilan les demandent au serveur quand il répond (liste vide sinon).
  - **Web** : hors connexion, une page déjà ouverte continue de fonctionner, mais recharger l'application
    web sans réseau échoue (pas de service worker). L'application Android embarque ses fichiers : pas
    concernée. À traiter si le web hors connexion devient un objectif.
  - **Session** : le serveur expire toujours les sessions à 30 jours ; le glissant à 12 mois est prévu en
    phase 4. Sans effet sur les données (jamais effacées), mais la synchronisation attend une reconnexion.
  - Les modifications faites par l'API REST sur des données synchronisées n'ont pas d'horloge : elles
    cèdent devant toute modification d'un appareil (acceptable tant que l'application n'utilise que la
    synchronisation pour ces données).
  - Deux copies de `zod` (shared/ et backend) : sans effet constaté.
  - Pas de test sur un vrai téléphone Android (stockage de la WebView, application en arrière-plan).

### Phase 0 — Fondations (terminée)
- Livré :
  - `shared/` : règles de calcul, schémas de validation, dates et protocole, partagés par l'API et
    l'application (imports relatifs, sans extension ; compile en production dans `dist/shared`).
  - Base : `server_version` et `updated_at` attribués par **déclencheurs** PostgreSQL à toute
    écriture, pierres tombales à toute suppression (cascades comprises), `user_id` dénormalisé sur
    `milestones` et `goal_readings`, table `server_meta` (époque), migration avec remplissage des
    données existantes.
  - Identifiants fournis par l'appareil sur toutes les créations ; collision → 409 uniforme.
  - `GET /api/meta`, version de protocole, garde `requireProtocol` (426), `npm run db:new-epoch`.
  - Parité : 4 scénarios (`shared/parity/scenarios.ts`) rejoués contre l'API, réponses figées dans
    `shared/parity/golden/` ; le moteur local de la phase 1 devra les rejouer à l'identique.
- Vérifications exécutées :
  - Backend `npx vitest run` : 149/149 (dont 9 tests de déclencheurs, 7 d'identifiants client,
    5 de protocole, 8 de parité) ; frontend `ng test` : 22/22 (dont 4 règles partagées exécutées dans
    l'application) ; `ng lint`, Prettier, `ng build`, typecheck de `shared/` et du backend : propres.
  - Build de production du backend lancé (`node dist/backend/src/server.js`) : le code partagé
    s'exécute compilé.
  - **Contrôle par mutation** : une règle de calcul du bilan volontairement faussée fait échouer 2
    scénarios de parité ; rétablie, tout repasse.
  - Valeurs des références recalculées à la main (solde, économie, taux de bilan, conversions
    d'heure y compris le changement d'heure de mars 2027).
- Écarts restants (phase 0) :
  - Deux copies de `zod` (celle de `shared/` et celle du backend) coexistent ; sans effet constaté,
    versions identiques épinglées.
  - Les vues `today`, `reviews` et `budget` restent calculées côté serveur dans leurs services : leur
    extraction dans `shared/` se fera avec le moteur local (phase 1), guidée par les tests de parité.
  - Les tests de parité côté application n'existent pas encore (pas de moteur local).
