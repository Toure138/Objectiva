---
name: spec-driven-development
description: Méthode SPEC → plan → tâches → implémentation → tests → revue pour toute fonctionnalité non triviale d'Objectiva. Utiliser avant de coder un nouvel écran, une nouvelle route ou une règle métier.
---

# Spec-driven development (Objectiva)

Pour une fonctionnalité non triviale, créer `specs/NNN-nom/` avec `spec.md` (depuis
`specs/_template.md`) et suivre ces étapes dans l'ordre :

1. **Analyse** : reformuler le besoin, lister les hypothèses, identifier les espaces concernés.
2. **SPEC** : objectif, parcours utilisateur, critères d'acceptation numérotés (CA-1, CA-2…),
   hors périmètre.
3. **Plan technique** : modules backend touchés, modèle Prisma (ajouts, index, suppression),
   endpoints (méthode, chemin, entrée, sortie, codes d'erreur), écrans Angular.
4. **Tâches** : liste ordonnée, chaque tâche finissable et vérifiable ; cocher au fur et à mesure.
5. **Implémentation** : une tâche à la fois, en respectant les skills `backend-conventions` et
   `frontend-ionic`.
6. **Tests** : au moins un test par critère d'acceptation, plus les tests d'isolation utilisateur.
7. **Revue** : relire la SPEC, vérifier chaque CA avec la commande réellement exécutée, noter les
   écarts restants dans `spec.md`.

Ne jamais déclarer une fonctionnalité terminée sans avoir exécuté les tests ou le parcours.
