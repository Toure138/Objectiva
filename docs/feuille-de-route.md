# Feuille de route Objectiva

Chaque étape livre un parcours utilisable avec persistance réelle. Chaque fonctionnalité non
triviale passe par une fiche `specs/NNN-nom/spec.md` (commande `/nouvelle-fonctionnalite`).

## Étape 1 — Socle objectifs (faite, spec 001)

Comptes et sessions, objectifs, jalons, tâches (créer, cocher, annuler la validation, reporter,
remettre « À planifier », annuler), vue Aujourd'hui, vue Planifier (7 jours, À planifier), bilan
jour/semaine/mois, thème clair/sombre, adresse d'API réglable depuis le téléphone.

Reporté depuis l'étape 1 : jusqu'à 3 priorités principales par jour, checklist de sous-étapes,
durée estimée, rappel et note après réalisation sur une tâche, progression **mesurable**
(valeur initiale, cible, relevés), historique détaillé d'une tâche, enregistrement des réponses
du bilan, catégories personnalisées.

## Étape 2 — Premier parcours transversal (faite, specs 003 à 006)

- Événements : réunion, rencontre, rendez-vous, appel, visio ; lieu ou lien, participants
  (noms seulement), ordre du jour, statut prévu/réalisé/annulé, décisions et action de suivi.
- Temps de déplacement et de préparation réservés avant le rendez-vous.
- Tâche de préparation liée à un événement.
- Budget mensuel : comptes, catégories, enveloppes, opérations prévues, transactions réelles,
  règlement d'une prévision (partiel ou soldé, avec économie), protection contre le double appui
  (clé d'idempotence).
- Progression mesurable des objectifs (nécessaire au scénario « 1 démonstration sur 3 »).
- Scénario d'acceptation EcoleSaaS de la mission (section 11) en test automatisé.

Reste à confirmer : le scénario a été reconstitué sans le texte de la mission (voir la spec 006).
Reporté de l'étape 2 : choix de la devise (colonne `users.currency` prête, `XOF` par défaut),
report d'enveloppe d'un mois à l'autre.

## Étape 3 — Planification complète

Déjà fait (specs 009 et 010) : agenda du jour heure par heure avec chevauchements signalés, réunions
récurrentes (chaque jour, en semaine, jours choisis, chaque semaine ; cette occurrence ou les suivantes),
calendrier du mois, liste « à venir » sans limite de durée avec filtres, liste des réunions récurrentes.

Budgets annuel et quotidien imbriqués (répartition, dépassements), vues agenda semaine/mois, plages disponibles et charge (fusion des chevauchements, durée
estimée des tâches), habitudes (quotidiennes, jours fixes, pauses, séries, changement de
fréquence daté), bilans enrichis (habitudes, rencontres, budget).

## Étape 4 — Fonctions complémentaires

Récurrences (« cette occurrence » / « et les suivantes », changements d'heure), rappels locaux
Android (plage de tranquillité, reprogrammation), transferts entre comptes (atomiques, exclus
des totaux), objectifs d'épargne, report d'enveloppe, devise par utilisateur, export des
données, suppression du compte, consultation hors connexion avec date de mise à jour.

## Plus tard (hors périmètre actuel)

Habitudes « trois fois par semaine », invitations aux participants (avec validation explicite),
synchronisation Google Calendar / Outlook, synchronisation des écritures hors connexion,
publication sur les stores, API en HTTPS hébergée.
