---
description: Démarrer une nouvelle fonctionnalité Objectiva selon la méthode spec-driven
argument-hint: <nom-de-la-fonctionnalite>
---

Lance une nouvelle fonctionnalité Objectiva : « $ARGUMENTS ».

1. Lis `CLAUDE.md` et le skill `spec-driven-development`.
2. Détermine le prochain numéro libre dans `specs/` et crée `specs/NNN-$ARGUMENTS/spec.md`
   à partir de `specs/_template.md`.
3. Rédige l'analyse, la SPEC avec critères d'acceptation numérotés, puis le plan technique.
4. Présente la SPEC et le plan à l'utilisateur. N'implémente rien avant sa validation, sauf
   si l'utilisateur demande explicitement de continuer.
