# 011 — Rappels avant les rendez-vous

> **Statut : terminée côté code (2026-11-05) ; à confirmer sur un vrai téléphone (APK).**

## 1. Objectif
Être prévenu sur son téléphone avant chaque rendez-vous ou réunion (récurrente comprise), au bon moment :
quand il faut partir ou commencer à se préparer, ou un délai choisi. Sans réseau ni serveur.

## 2. Parcours utilisateur
1. Au premier rendez-vous à rappeler, l'application Android demande l'autorisation d'afficher des notifications.
2. Avant le rendez-vous, une notification : « Point d'équipe à 09:00 — Pars maintenant · Salle B ». La toucher
   ouvre la fiche du rendez-vous.
3. Dans le formulaire, **Rappel** : par défaut, aucun, à l'heure, 15 min, 30 min, 1 h avant, ou « quand partir
   ou se préparer » (début du temps réservé, sinon 15 min avant).
4. Dans le profil : rappels activés ou non, rappel par défaut, état de l'autorisation, « Envoyer un rappel
   d'essai », accès au réglage des alarmes exactes si Android l'a désactivé.

## 3. Critères d'acceptation
- [x] CA-1 : règle partagée `reminderAt` : `DEPART` = début du temps réservé (trajet + préparation), sinon
  15 min avant ; `HEURE` = début ; `M15`, `M30`, `H1` ; `AUCUN` = pas de rappel. Texte : « Pars maintenant »
  (trajet), « Commence à te préparer » (préparation seule), « Dans 15 min », « C'est maintenant ».
- [x] CA-2 : choix par rendez-vous et par série (`reminder`, `null` = réglage par défaut du téléphone), copié
  dans les occurrences, modifiable pour « cette occurrence » ou « et les suivantes », synchronisé (champ
  facultatif : une application plus ancienne reste compatible).
- [x] CA-3 : le téléphone programme les rappels des rendez-vous **prévus** des 14 prochains jours (60 au plus),
  jamais dans le passé, jamais pour un rendez-vous annulé ou réalisé ; il les reprogramme après chaque
  modification, synchronisation ou retour au premier plan (anciens rappels annulés d'abord).
- [x] CA-4 : autorisation demandée seulement quand un rappel est à programmer ; refusée → rien n'est
  programmé, le profil l'explique sans culpabiliser. Hors application Android : aucune programmation, le
  profil le dit.
- [x] CA-5 : toucher une notification ouvre la fiche du rendez-vous.
- [x] CA-6 : Android : `POST_NOTIFICATIONS`, alarmes exactes (`USE_EXACT_ALARM` dès Android 13,
  `SCHEDULE_EXACT_ALARM` avant), canal « Rendez-vous » de haute importance, petite icône dédiée.

## 4. Hors périmètre
- Rappels des tâches et des habitudes ; plage de tranquillité ; plusieurs rappels par rendez-vous ;
  notifications envoyées par le serveur (push) ; iOS (préparé, non testé).

## 5. Plan technique
- **Base** : colonne `reminder` (énumération facultative) sur `events` et `event_series`.
- **Partagé** : `reminders.rules.ts` (`reminderAt`, `reminderText`, `notificationId`), schémas et lignes.
- **Téléphone** : `@capacitor/local-notifications` 8 ; `core/reminders.service.ts` (programmation, autorisation,
  ouverture au toucher) branché sur la synchronisation ; profil ; formulaire.
- **Tests** : règles (unitaires), service avec un faux module de notifications (fenêtre, passé, annulés,
  remplacement, autorisation refusée, web), API (champ accepté, copié, synchronisé), parité régénérée.

## 6. Tâches
- [x] T1 Règles partagées et tests
- [x] T2 Colonne, schémas, lignes, logique des rendez-vous, synchronisation, parité
- [x] T3 Service de rappels et tests
- [x] T4 Formulaire, profil, configuration Android
- [x] T5 Vérifications, documentation, revue

## 7. Revue
- Vérifications exécutées :
  - `npm test` : backend 213/213 (4 tests des règles de rappel, 2 tests API : choix accepté, copié dans les
    occurrences, modifiable pour la suite, refusé s'il est inconnu, compatibilité d'une application plus
    ancienne par synchronisation ; références de parité régénérées : seul `"reminder": null` ajouté) ;
    frontend 68/68 (8 tests du service de rappels avec un faux module : bon moment et bon texte, ordre,
    passé / « aucun » / annulé / réalisé exclus, anciens rappels remplacés sans toucher aux autres
    notifications, réglage par défaut, désactivation, autorisation demandée seulement s'il y a un rappel et
    refus respecté, 60 au plus, déconnexion, navigateur).
  - e2e : rappel « 30 min avant » choisi dans le formulaire hors connexion, retrouvé sur le serveur après
    synchronisation ; profil du navigateur qui renvoie à l'application Android. Les 7 parcours passent.
  - `npm run lint`, `ng build`, `cap sync android` (module enregistré, configuration de l'icône copiée).
- Écarts restants :
  - **Non vérifié sur un vrai téléphone** : affichage de la notification, autorisation Android 13+, alarmes
    exactes, ouverture de la fiche au toucher, rappels conservés après redémarrage du téléphone (géré par le
    module). À tester avec l'APK : profil → « Envoyer un rappel d'essai ».
  - Certains fabricants (Tecno, Infinix, Xiaomi…) retardent les applications en économie d'énergie : à
    autoriser dans les réglages de batterie si un rappel n'arrive pas.
  - Le texte d'un rappel est figé à sa programmation (reprogrammé à chaque changement ou ouverture).
  - Ordre de mise à jour : **serveur d'abord**, puis APK (un serveur plus ancien refuserait le champ `reminder`).
