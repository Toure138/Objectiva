# 009 — Rendez-vous sur le téléphone, réunions récurrentes et agenda du jour

> **Statut : terminée (2026-11-05).** Regroupe la phase 2 de la spec 007 (rendez-vous hors connexion),
> la récurrence (avancée de l'étape 4) et la vue agenda du jour avec chevauchements (avancée de l'étape 3).

## 1. Objectif
Planifier ses réunions heure par heure, y compris des réunions qui reviennent (chaque jour, en semaine,
certains jours, chaque semaine), modifier une seule fois ou toute la suite, voir sa journée sur une grille
horaire où les chevauchements sautent aux yeux — le tout sur le téléphone, sans réseau.

## 2. Parcours utilisateur
1. « Ajouter » → « Un événement » : titre, date, heures, puis **Répéter** : jamais, chaque jour, en semaine
   (lun.–ven.), chaque semaine, jours choisis (chips L M M J V S D), avec **jusqu'au** facultatif.
2. Les occurrences apparaissent dans « Aujourd'hui », « Planifier », le bilan et l'**agenda du jour**.
3. Modifier une occurrence : « Cette occurrence » ou « Cette occurrence et les suivantes ».
4. Supprimer une occurrence : « Annuler cette fois » (l'occurrence est annulée, réouvrable),
   « Cette occurrence et les suivantes » ou « Toute la série ».
5. Agenda du jour (depuis « Aujourd'hui » ou « Planifier ») : grille horaire, rendez-vous placés à leur heure,
   côte à côte s'ils se chevauchent, trajet et préparation dessinés avant, chevauchements signalés en toutes
   lettres avec une icône ; jour précédent / suivant ; ligne de l'heure actuelle.
6. Sans réseau : tout ce qui précède fonctionne et se synchronise au retour.

## 3. Critères d'acceptation
- [x] CA-1 : une série porte un modèle (type, titre, heures locales, lieu, lien, participants, ordre du jour,
  objectif, jalon, trajet, préparation), des **jours de la semaine** (1 = lundi … 7 = dimanche, au moins un),
  une date de début et une date de fin facultative. `POST /events` avec `repeat: { weekdays, until? }` crée la
  série et renvoie sa première occurrence (au plus tôt à `date`).
- [x] CA-2 : les occurrences sont des rendez-vous ordinaires (`seriesId`, `occurrenceDate`) : fiche, réalisé,
  annulé, tâches liées, « Aujourd'hui », bilan fonctionnent sans changement. Elles sont créées jusqu'à
  **60 jours** après aujourd'hui (et jusqu'à la fin de toute plage consultée, au plus 366 jours), avec un
  identifiant **déterministe** (série + date) : deux appareils hors ligne créent la même occurrence, sans
  doublon. Unicité `(series_id, occurrence_date)`.
- [x] CA-3 : heures locales converties dans le fuseau de l'utilisateur pour chaque date (changement d'heure :
  10 h reste 10 h).
- [x] CA-4 : `PATCH /events/:id?scope=occurrence` (par défaut) ne modifie que cette occurrence (elle peut
  changer de date ; son `occurrenceDate` reste celle d'origine). `scope=following` applique **les seuls champs
  modifiés** au modèle et à toutes les occurrences de cette date et des suivantes (une occurrence modifiée à
  part garde ses autres changements) ; changer d'heure garde la date de chaque occurrence ; changer de date
  est refusé (400). Changer les jours (`repeat.weekdays`) coupe la série : l'ancienne s'arrête la veille, une
  nouvelle commence à cette date. Changer `repeat.until` raccourcit ou prolonge.
- [x] CA-5 : `DELETE /events/:id?scope=occurrence` annule l'occurrence (statut `ANNULE`, réouvrable) ;
  `scope=following` arrête la série la veille et supprime les occurrences suivantes (sauf réalisées) ;
  `scope=series` supprime la série et toutes ses occurrences. Un rendez-vous hors série se supprime comme avant.
  Les tâches liées sont conservées (lien retiré).
- [x] CA-6 : `GET /agenda?date=` renvoie les rendez-vous non annulés du jour, par heure, chacun avec sa
  **colonne** et le **nombre de colonnes** de son groupe de chevauchement, et la liste de ses **conflits**
  (`CHEVAUCHEMENT` : les horaires se croisent ; `PREPARATION` : seul le trajet ou la préparation empiète),
  plus les heures de début et de fin de grille (7 h – 21 h au minimum, élargies si besoin).
- [x] CA-7 : rendez-vous et séries sont **sur le téléphone** : tous les appels `/events…` et `/agenda` sont
  traités par le moteur local, avec les mêmes réponses que le serveur (scénarios de parité `evenements` et
  `reunions-recurrentes` rejoués à l'identique) ; « Aujourd'hui » et le bilan ne demandent plus rien au réseau.
- [x] CA-8 : synchronisation des tables `events` et `event_series` (champ par champ, suppression prioritaire,
  série supprimée → occurrences envoyées par un autre appareil ignorées) ; version de protocole 2 (une
  application plus ancienne est invitée à se mettre à jour). Une création reçue pour une ligne déjà présente
  est **fusionnée** champ par champ (nécessaire aux identifiants déterministes). Reconstruction d'un serveur
  remplacé : séries et rendez-vous inclus.
- [x] CA-9 : isolation : série, occurrence, agenda, portées de modification et de suppression d'autrui → 404 ;
  objectif ou jalon d'autrui → 404.
- [x] CA-10 : interface : choix de la répétition au format téléphone, choix de la portée, icône et libellé de
  répétition sur chaque occurrence, agenda du jour lisible à 360 px, conflits avec libellé + icône (jamais la
  couleur seule).

## 4. Hors périmètre
- Mensuel, tous les N jours ou N semaines, « le 2e mardi » ; nombre d'occurrences (`count`).
- Rendez-vous sur plusieurs jours ; vue semaine / mois en grille ; plages libres ; glisser-déposer.
- Rappels (notifications) : étape 4.
- Budget hors connexion (spec 007, phase 3).

## 5. Plan technique
- **Base** : table `event_series` (`user_id`, modèle, `weekdays int[]`, `start_date`, `until`, `field_clocks`,
  `server_version`, `updated_at`, déclencheurs de synchronisation) ; `events.series_id` (cascade),
  `events.occurrence_date` (DATE), unique `(series_id, occurrence_date)`.
- **Partagé** : `recurrence.rules.ts` (dates d'une série, identifiant d'occurrence, jour de la semaine),
  `agenda.rules.ts` (colonnes, conflits, bornes de la grille), `domain/events.ts` (toutes les commandes et
  vues des rendez-vous, au-dessus de `Repo` étendu par `events` et `series`), schémas de champs synchronisés.
- **Serveur** : `repo.prisma.ts` (événements et séries), routes `events` et `agenda` réduites à l'appel des
  commandes partagées, synchronisation des deux tables, création existante → fusion.
- **Téléphone** : Dexie `version(2)` (tables `events`, `series`), `LocalRepo`, routes locales, synchronisation,
  `snapshot()` ; suppression des appels réseau de rendez-vous dans `ApiService`.
- **Écrans** : formulaire (répétition), choix de portée, élément de liste (répétition, conflit), page
  `agenda/agenda.page.ts` (`/app/agenda/:date`), liens depuis « Aujourd'hui » et « Planifier ».
- **Tests** : règles (dates, identifiants, colonnes, conflits, changement d'heure), API (chaque CA, isolation),
  synchronisation, parité serveur + téléphone, e2e hors connexion.

## 6. Tâches
- [x] T1 Règles pures : récurrence et agenda, tests unitaires
- [x] T2 Migration, protocole 2, schémas de champs
- [x] T3 Logique partagée des rendez-vous (`domain/events.ts`) et `Repo` étendu
- [x] T4 Serveur : dépôt Prisma, routes, synchronisation, tests API / isolation / parité
- [x] T5 Téléphone : base locale, dépôt, moteur, synchronisation, parité locale
- [x] T6 Écrans : répétition, portée, agenda du jour
- [x] T7 e2e, documentation, revue

## 7. Revue
- Décisions prises en route :
  - Identifiant d'occurrence = hachage 128 bits de « série/date » au format UUID v8. Un premier essai par
    XOR de la fin de l'identifiant de série et du numéro du jour produisait des **collisions** entre séries
    voisines (révélées par le scénario de parité) : remplacé, test de 20 000 identifiants sans collision.
  - Le serveur **fusionne** une création reçue pour une ligne déjà présente (au lieu de l'ignorer) : deux
    appareils qui créent la même occurrence hors ligne convergent champ par champ.
  - Protocole 2, mais les clients en version 1 restent servis (sans les rendez-vous) : pas de mise à jour forcée.
  - En modification, le formulaire n'envoie que les champs changés (indispensable pour « et les suivantes »,
    et une synchronisation n'écrase plus un champ modifié ailleurs).
- Vérifications exécutées :
  - `npm test` : backend 203/203 (dont 10 règles, 12 API récurrence/agenda/synchronisation/isolation, parité
    6 scénarios), frontend 59/59 (dont **5 scénarios de parité rejoués sur le téléphone**, `evenements` et
    `reunions-recurrentes` compris, 3 tests de synchronisation des rendez-vous, libellés de répétition).
  - `npm run lint`, `ng build` : propres, sans avertissement de taille de style.
  - e2e (`frontend/e2e/agenda.spec.ts`, 360×740, vraie API) : réunion chaque jour + rendez-vous qui la chevauche,
    agenda avec chevauchement en toutes lettres, « et les suivantes » (renommage visible le lendemain),
    **serveur coupé** : réunion hebdomadaire créée, une fois annulée ; retour du serveur : tout est synchronisé
    (occurrence annulée comprise). Les 6 parcours e2e passent. Captures relues en clair et en sombre.
  - Mutations : agenda qui garde les annulés (téléphone), « et les suivantes » appliqué au passé (logique
    partagée) : détectées par la parité.
- Écarts restants :
  - Rendez-vous sur plusieurs jours, mensuel, « tous les N », nombre d'occurrences, rappels : hors périmètre.
  - Supprimer « cette occurrence » l'annule (réouvrable) au lieu de la faire disparaître : choix assumé, une
    suppression serait recréée par la génération.
  - Après une coupure de série, une occurrence **réalisée** au-delà de la coupure reste dans l'ancienne série ;
    si la nouvelle série tombe le même jour, les deux coexistent.
  - Créer 60 jours d'occurrences d'un coup ajoute ~60 modifications au journal d'envoi (envoyées par lots de 200).
  - Le fuseau du téléphone sert à « aujourd'hui » dans l'agenda (`localToday`) ; il est supposé identique au
    fuseau du compte.
