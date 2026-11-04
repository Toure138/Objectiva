import type { Task } from '../../generated/prisma/client.ts';
import { prismaRepo, toTaskRow } from '../../core/repo.prisma.ts';
import { resolveTaskLinks } from '../../../../shared/src/domain/tasks.ts';
import { serializeTask as serializeTaskRow } from '../../../../shared/src/domain/views.ts';

// Les commandes sur les tâches vivent dans shared/src/domain/tasks.ts. Ce fichier ne garde que ce
// dont d'autres modules (événements) ont besoin : sérialiser une tâche et vérifier ses liens.

export const serializeTask = (t: Task, today: string) => serializeTaskRow(toTaskRow(t), today);
export type SerializedTask = ReturnType<typeof serializeTask>;

/** Vérifie que l'objectif et le jalon visés appartiennent à l'utilisateur et sont cohérents. */
export const resolveLinks = (userId: string, goalId: string | null | undefined, milestoneId: string | null | undefined) =>
  resolveTaskLinks(prismaRepo(userId), goalId, milestoneId);
